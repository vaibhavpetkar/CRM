import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import leadService from '../services/LeadService';
import Company from '../models/Company';
import Contact from '../models/Contact';
import { Op } from 'sequelize';
import { validationResult } from 'express-validator';
import { createLeadValidation } from '../validations/leadValidation';
import { ConflictError, ValidationError } from '../errors/AppError';

export const getLeads = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await leadService.list(req.query as any);
  return res.json(result);
});

export const getLeadById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.getById(req.params.id);
  return res.json(lead);
});

// Task 2.6: GET /api/leads/check-duplicate?email=&mobile=&excludeId=
export const checkDuplicateLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, mobile, excludeId } = req.query as { email?: string; mobile?: string; excludeId?: string };
  const result = await leadService.checkDuplicate(email || null, mobile || null, excludeId);
  return res.json(result);
});

// Bulk import: POST /api/leads/import { rows: [...] }. The browser sends a
// big file in batches of a few hundred rows instead of one request per lead,
// so a 30,000-lead file is ~60 requests rather than 30,000. Each row goes
// through the same validation and create path as the Add Lead form
// (duplicate check, lead rotation, numbering), and a bad row only fails
// itself: the response has one result per row, in order.
export const IMPORT_BATCH_MAX = 1000;

const rowErrorMessage = (err: unknown) => {
  const e = err as { message?: string; details?: { message?: string }[] };
  const detail = Array.isArray(e?.details) && e.details[0]?.message;
  if (e?.message === 'Validation failed' && detail) return detail;
  return e?.message || 'Import failed';
};

export const importLeads = asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('No rows to import.');
  if (rows.length > IMPORT_BATCH_MAX) {
    throw new ValidationError(`Send at most ${IMPORT_BATCH_MAX.toLocaleString('en-IN')} rows per request.`);
  }

  const results: { ok: boolean; id?: number; error?: string; duplicate?: boolean }[] = [];
  for (const raw of rows) {
    const rowReq = { body: raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {} } as any;
    try {
      await Promise.all(createLeadValidation.map((chain) => chain.run(rowReq)));
      const invalid = validationResult(rowReq);
      if (!invalid.isEmpty()) {
        results.push({ ok: false, error: invalid.array()[0].msg });
        continue;
      }
      const lead = await leadService.create(rowReq.body, req.user?.id);
      results.push({ ok: true, id: lead.id });
    } catch (err) {
      results.push({ ok: false, error: rowErrorMessage(err), duplicate: err instanceof ConflictError || undefined });
    }
  }

  return res.json({
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

export const createLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.create(req.body, req.user?.id);
  return res.status(201).json({ message: 'Lead created successfully', lead });
});

export const updateLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.update(req.params.id, req.body, req.user?.id);
  return res.json({ message: 'Lead updated successfully', lead });
});

export const deleteLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  await leadService.delete(req.params.id, req.user?.id);
  return res.json({ message: 'Lead deleted successfully' });
});

export const convertLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await leadService.convert(req.params.id, req.body || {}, req.user?.id);
  return res.json({ message: 'Lead converted successfully', ...result });
});

export const getLeadStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = await leadService.getStats();
  return res.json(stats);
});

export const getLeadTimeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timeline = await leadService.getTimeline(req.params.id);
  return res.json({ timeline });
});

export const revertLeadChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.revert(req.params.id, req.params.logId, req.user?.id);
  return res.json({ message: 'Change reverted successfully', lead });
});

// Search companies and contacts for auto-populate in lead form
export const searchCompaniesAndContacts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { q } = req.query as { q?: string };
  
  if (!q || q.trim().length < 2) {
    return res.json({ results: [] });
  }

  const searchTerm = q.trim();
  // Match each typed word independently (case-insensitive substring, any
  // order) rather than requiring the whole typed string to appear as one
  // literal substring — "Corp Tech" now finds "Tech Corp Ltd", not just
  // exact left-to-right substrings.
  const words = searchTerm.split(/\s+/).filter(Boolean);
  const wordConditions = (field: string) => ({
    [Op.and]: words.map((w) => ({ [field]: { [Op.iLike]: `%${w}%` } })),
  });

  const [companies, contacts] = await Promise.all([
    Company.findAll({
      where: {
        ...wordConditions('name'),
        isActive: true,
      },
      attributes: ['id', 'name', 'email', 'phone', 'address', 'website', 'industry'],
      limit: 10,
      order: [['name', 'ASC']],
    }),
    Contact.findAll({
      where: {
        ...wordConditions('company'),
        isActive: true,
      },
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle'],
      limit: 10,
      order: [['company', 'ASC']],
    }),
  ]);

  // Combine and deduplicate by company name
  const companyMap = new Map<string, any>();
  
  companies.forEach((c) => {
    companyMap.set(c.name.toLowerCase(), {
      type: 'company',
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      website: c.website,
      industry: c.industry,
      contactName: null,
      contactTitle: null,
    });
  });

  contacts.forEach((c) => {
    const key = c.company?.toLowerCase() || '';
    if (key && !companyMap.has(key)) {
      companyMap.set(key, {
        type: 'contact',
        id: c.id,
        name: c.company,
        email: c.email,
        phone: c.phone,
        address: null, // contacts don't have address
        website: null,
        industry: null,
        contactName: `${c.firstName} ${c.lastName}`,
        contactTitle: c.jobTitle,
      });
    }
  });

  const results = Array.from(companyMap.values()).slice(0, 10);
  return res.json({ results });
});
