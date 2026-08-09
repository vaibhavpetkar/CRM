import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import leadService from '../services/LeadService';
import Company from '../models/Company';
import Contact from '../models/Contact';
import { Op } from 'sequelize';

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
  const [companies, contacts] = await Promise.all([
    Company.findAll({
      where: {
        name: { [Op.iLike]: `%${searchTerm}%` },
        isActive: true,
      },
      attributes: ['id', 'name', 'email', 'phone', 'address', 'website', 'industry'],
      limit: 10,
      order: [['name', 'ASC']],
    }),
    Contact.findAll({
      where: {
        company: { [Op.iLike]: `%${searchTerm}%` },
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
