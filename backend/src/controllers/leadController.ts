import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import leadService from '../services/LeadService';
import Company from '../models/Company';
import Contact from '../models/Contact';
import Lead from '../models/Lead';
import { Op } from 'sequelize';
import { validationResult } from 'express-validator';
import { createLeadValidation } from '../validations/leadValidation';
import { ConflictError, ValidationError } from '../errors/AppError';
import * as leadNotes from '../services/leadNoteService';
import { notifyUser, notifyLeadTeam } from '../utils/notificationService';
import { NOTE_STATUS_KEYWORDS } from '../utils/leadNotes';
import leadRepository from '../repositories/LeadRepository';
import SiteVisit, { DONE_VISIT_STATUSES } from '../models/SiteVisit';
import { localDay } from '../utils/reportTime';
import {
  splitMobiles, normalizeImportSource, normalizeImportStatus, splitFullName, importDay, VISIT_FROM_LEAD_STATUS,
} from '../utils/leadImport';

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

// Lead fields an import may fill in on a lead that is already in the CRM
// (only where the lead has nothing yet; what the team typed is kept).
const IMPORT_FILL_FIELDS = [
  'firstName', 'lastName', 'email', 'alternateMobile', 'phone', 'company', 'leadSource', 'subSource',
  'configuration', 'propertyType', 'projectName', 'preferredLocation', 'budgetMin', 'budgetMax',
  'city', 'state', 'country', 'street', 'zipCode', 'territory', 'industry', 'jobTitle',
] as const;

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

type ImportedVisit = { day: string; status: 'completed' | 'revisit-done'; userId: number | null; notes: string | null };

/** Adds the site visits an imported row says happened, skipping ones the lead already has that day. */
const saveImportedVisits = async (lead: Lead, visits: ImportedVisit[], importerId: number | null | undefined) => {
  if (!visits.length) return 0;
  const existing = await SiteVisit.findAll({
    where: { leadId: lead.id, status: DONE_VISIT_STATUSES },
    attributes: ['scheduledAt', 'status'],
    raw: true,
  });
  const have = new Set(existing.map((v) => `${localDay(new Date(v.scheduledAt))}|${v.status}`));
  let added = 0;
  for (const v of visits) {
    const key = `${v.day}|${v.status}`;
    if (have.has(key)) continue;
    have.add(key);
    const userId = v.userId ?? lead.assignedToId ?? importerId;
    if (!userId) continue;
    const at = new Date(`${v.day}T12:00:00+05:30`);
    await SiteVisit.create({
      leadId: lead.id,
      userId,
      scheduledAt: at,
      status: v.status,
      projectName: lead.projectName ?? null,
      location: lead.preferredLocation ?? null,
      notes: v.notes ? v.notes.slice(0, 5000) : null,
      completedAt: at,
      createdById: importerId ?? null,
    });
    added += 1;
  }
  return added;
};

/** One notification per import batch (not one per row): a summary for the
 * importer and admins, and "N new leads assigned to you" for each sales person. */
const notifyImport = async (summary: { created: number; updated: number; failed: number }, createdIds: number[], importerId?: number) => {
  if (!summary.created && !summary.updated) return;
  const parts = [
    summary.created && `${summary.created} new lead${summary.created === 1 ? '' : 's'} added`,
    summary.updated && `${summary.updated} existing lead${summary.updated === 1 ? '' : 's'} updated`,
    summary.failed && `${summary.failed} row${summary.failed === 1 ? '' : 's'} failed`,
  ].filter(Boolean);
  await notifyLeadTeam({ type: 'lead_import', title: 'Leads imported', message: `${parts.join(', ')}.`, actorId: importerId });

  if (!createdIds.length) return;
  const leads = await Lead.findAll({ where: { id: createdIds }, attributes: ['id', 'assignedToId'] });
  const perUser = new Map<number, number[]>();
  for (const l of leads) {
    if (!l.assignedToId) continue;
    perUser.set(l.assignedToId, [...(perUser.get(l.assignedToId) || []), l.id]);
  }
  await Promise.all(
    [...perUser].map(([userId, ids]) =>
      notifyUser({
        userId,
        type: 'lead_assigned',
        title: ids.length === 1 ? 'New lead assigned to you' : `${ids.length} new leads assigned to you`,
        message: `${ids.length === 1 ? 'A lead' : `${ids.length} leads`} from an import ${ids.length === 1 ? 'was' : 'were'} assigned to you.`,
        entityType: ids.length === 1 ? 'Lead' : undefined,
        entityId: ids.length === 1 ? ids[0] : undefined,
        sendEmail: false,
      }).catch(() => undefined)
    )
  );
};

export const importLeads = asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('No rows to import.');
  if (rows.length > IMPORT_BATCH_MAX) {
    throw new ValidationError(`Send at most ${IMPORT_BATCH_MAX.toLocaleString('en-IN')} rows per request.`);
  }

  const results: {
    ok: boolean; id?: number; error?: string; duplicate?: boolean; notesAdded?: number; visitsAdded?: number; updated?: boolean;
  }[] = [];
  const importerId = req.user?.id;
  // Names in the notes column's brackets ("(SS)", "(SADIYA)") and in the
  // Executive Name column are matched to users once per batch.
  const notesOf = (r: any) => (r ? r.notes ?? r.callNotes : undefined);
  const execOf = (r: any) => (r ? r.assignedTo ?? r.salesPerson ?? r.executiveName : undefined);
  const needsMatcher = rows.some((r: any) => String(notesOf(r) ?? '').trim() || String(execOf(r) ?? '').trim());
  const matcher = needsMatcher ? await leadNotes.loadNoteUserMatcher() : null;
  const today = localDay(new Date());

  for (const raw of rows) {
    const body: Record<string, any> = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    const rowReq = { body } as any;

    // "Name" column -> first and last name.
    if (!isBlank(body.name) && isBlank(body.firstName) && isBlank(body.lastName)) {
      [body.firstName, body.lastName] = splitFullName(body.name);
    }
    delete body.name;

    // "9822675337/  9175444667" -> Mobile and Alternate Mobile.
    const mobiles = splitMobiles(body.mobile);
    if (mobiles.length) body.mobile = mobiles[0];
    if (mobiles[1] && isBlank(body.alternateMobile)) body.alternateMobile = mobiles[1];
    if (!isBlank(body.alternateMobile)) body.alternateMobile = splitMobiles(body.alternateMobile)[0];

    if (!isBlank(body.leadSource)) body.leadSource = normalizeImportSource(body.leadSource);
    if (!isBlank(body.status)) {
      const status = normalizeImportStatus(body.status);
      if (status) body.status = status;
      else delete body.status;
    } else delete body.status;

    // "Executive Name" -> the lead's sales person, when it names one user.
    const execName = isBlank(execOf(body)) ? null : String(execOf(body)).trim();
    delete body.assignedTo;
    delete body.salesPerson;
    delete body.executiveName;
    const execId = execName && matcher ? matcher(execName) : null;
    if (execId && isBlank(body.assignedToId)) body.assignedToId = execId;

    // "Site Visit Date": the visit happened that day.
    const visitDay = importDay(body.siteVisitDate);
    delete body.siteVisitDate;
    if (visitDay && !body.status) body.status = 'site-visit-done';
    const sheetStatus: string | undefined = body.status;

    // The Notes column: "31/10/26- CNR (SS) 01/11/26- BUSY (SS) ...". The
    // last note gives the lead its status (unless the sheet has a Status) and,
    // when the name is a user and the sheet has no owner, its sales person.
    const notesCell = notesOf(body);
    const prepared = matcher && String(notesCell ?? '').trim()
      ? leadNotes.prepareImportedNotes(notesCell, matcher, { day: visitDay, name: execName })
      : null;
    delete body.callNotes;
    if (prepared) delete body.notes; // saved as dated notes below, not as raw text
    if (prepared?.current) {
      if (!body.status && prepared.current.status) body.status = prepared.current.status;
      if (isBlank(body.assignedToId) && prepared.current.userId) body.assignedToId = prepared.current.userId;
    }

    // Site visits this row says happened: notes such as "site visit done",
    // a Site Visit Date, or a Site Visit Done / Revisit Done status.
    const visits: ImportedVisit[] = [];
    for (const n of prepared?.notes ?? []) {
      const status = n.status ? VISIT_FROM_LEAD_STATUS[n.status] : undefined;
      if (status) visits.push({ day: n.noteDate, status, userId: n.userId, notes: n.text });
    }
    if (visitDay && !visits.some((v) => v.day === visitDay)) {
      visits.push({ day: visitDay, status: 'completed', userId: execId, notes: prepared?.current?.text ?? null });
    }
    const statusVisit = body.status ? VISIT_FROM_LEAD_STATUS[body.status] : undefined;
    if (statusVisit && !visits.some((v) => v.status === statusVisit)) {
      visits.push({ day: prepared?.current?.noteDate ?? today, status: statusVisit, userId: execId, notes: prepared?.current?.text ?? null });
    }

    try {
      await Promise.all(createLeadValidation.map((chain) => chain.run(rowReq)));
      const invalid = validationResult(rowReq);
      if (!invalid.isEmpty()) {
        results.push({ ok: false, error: invalid.array()[0].msg });
        continue;
      }
      const created = await leadService.create(body as any, importerId, { quiet: true });
      const lead = prepared?.notes.length || visits.length ? await Lead.findByPk(created.id) : null;
      const notesAdded = lead && prepared?.notes.length ? await leadNotes.saveImportedNotes(lead, prepared.notes, importerId, undefined, !sheetStatus) : undefined;
      const visitsAdded = lead && visits.length ? await saveImportedVisits(lead, visits, importerId) : undefined;
      results.push({ ok: true, id: created.id, notesAdded, visitsAdded });
    } catch (err) {
      if (!(err instanceof ConflictError)) {
        results.push({ ok: false, error: rowErrorMessage(err) });
        continue;
      }
      // Already in the CRM (same mobile or email): add the new notes and
      // visits to that lead, fill its empty fields, and apply the sheet's status.
      try {
        const existing = await leadRepository.findDuplicate({ email: body.email || null, mobile: body.mobile || null });
        const lead = existing ? await Lead.findByPk(existing.id) : null;
        if (!lead) {
          results.push({ ok: false, error: rowErrorMessage(err), duplicate: true });
          continue;
        }
        const patch: Record<string, any> = {};
        for (const key of IMPORT_FILL_FIELDS) {
          if (!isBlank(body[key]) && isBlank((lead as any)[key])) patch[key] = body[key];
        }
        if (!isBlank(body.assignedToId) && !lead.assignedToId) patch.assignedToId = body.assignedToId;
        if (sheetStatus && sheetStatus !== lead.status) patch.status = sheetStatus;
        if (Object.keys(patch).length) {
          await leadService.update(lead.id, patch as any, importerId, { quiet: true });
          await lead.reload();
        }
        const notesAdded = prepared?.notes.length ? await leadNotes.saveImportedNotes(lead, prepared.notes, importerId, undefined, !sheetStatus) : 0;
        const visitsAdded = await saveImportedVisits(lead, visits, importerId);
        if (Object.keys(patch).length || notesAdded || visitsAdded) {
          results.push({ ok: true, id: lead.id, updated: true, notesAdded, visitsAdded });
        } else {
          results.push({ ok: false, error: 'Already in the CRM, nothing new to add', duplicate: true });
        }
      } catch (updateErr) {
        results.push({ ok: false, error: rowErrorMessage(updateErr), duplicate: true });
      }
    }
  }

  const summary = {
    created: results.filter((r) => r.ok && !r.updated).length,
    updated: results.filter((r) => r.updated).length,
    failed: results.filter((r) => !r.ok).length,
  };
  await notifyImport(summary, results.filter((r) => r.ok && !r.updated && r.id).map((r) => r.id!), importerId);
  return res.json({ ...summary, results });
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

export const getLeadFollowUps = asyncHandler(async (req: AuthRequest, res: Response) => {
  const followUps = await leadService.getFollowUps(req.params.id);
  return res.json({ followUps });
});

// ─── Call notes ("13/09/26 CNR (SAKSHI)") ─────────────────────────────────────

export const getLeadNotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json({ notes: await leadNotes.listNotes(req.params.id) });
});

export const addLeadNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.status(201).json(await leadNotes.addNote(req.params.id, req.user, req.body || {}));
});

export const deleteLeadNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(await leadNotes.deleteNote(req.params.id, req.params.noteId, req.user));
});

export const detectNoteStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  return res.json(leadNotes.detectStatus(req.query.text));
});

/** The words in a note that set each status, for the keyword list and suggestions under Notes. */
export const getNoteKeywords = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json({ keywords: NOTE_STATUS_KEYWORDS });
});

export const getNoteNames = asyncHandler(async (_req: AuthRequest, res: Response) => {
  return res.json({ names: await leadNotes.otherNoteNames() });
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
  const { q, scope } = req.query as { q?: string; scope?: string };

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
  // A person matches when every word is in their first name, last name or
  // company ("rohan patil", "patil", "rohan kothrud developers").
  const personConditions = (fields: string[]) => ({
    [Op.and]: words.map((w) => ({ [Op.or]: fields.map((f) => ({ [f]: { [Op.iLike]: `%${w}%` } })) })),
  });
  // scope=clients (quotes, invoices) also offers the people the business
  // deals with, since a real-estate client is usually a buyer, not a company.
  const includePeople = scope === 'clients';

  const [companies, contacts, leads, people, leadPeople] = await Promise.all([
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
    // Company names typed on earlier leads, so the same company is offered
    // again instead of being re-typed slightly differently.
    Lead.findAll({
      where: wordConditions('company'),
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'mobile', 'company', 'jobTitle', 'street', 'city', 'industry', 'website'],
      limit: 10,
      order: [['updatedAt', 'DESC']],
    }),
    includePeople
      ? Contact.findAll({
          where: { ...personConditions(['firstName', 'lastName', 'company']), isActive: true },
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle'],
          limit: 10,
          order: [['firstName', 'ASC']],
        })
      : Promise.resolve([] as Contact[]),
    includePeople
      ? Lead.findAll({
          where: personConditions(['firstName', 'lastName', 'company']),
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'mobile', 'company', 'jobTitle', 'street', 'city', 'industry', 'website'],
          limit: 10,
          order: [['updatedAt', 'DESC']],
        })
      : Promise.resolve([] as Lead[]),
  ]);

  const leadAddress = (l: Lead) => [l.street, l.city].filter(Boolean).join(', ') || null;
  const fullName = (p: { firstName?: string | null; lastName?: string | null }) =>
    `${p.firstName || ''} ${p.lastName || ''}`.trim();

  // Combine and deduplicate by name
  const companyMap = new Map<string, any>();
  const add = (key: string, row: any) => {
    if (key && !companyMap.has(key)) companyMap.set(key, row);
  };

  companies.forEach((c) => {
    add(c.name.toLowerCase(), {
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
    add(c.company?.toLowerCase() || '', {
      type: 'contact',
      id: c.id,
      name: c.company,
      email: c.email,
      phone: c.phone,
      address: null, // contacts don't have address
      website: null,
      industry: null,
      contactName: fullName(c),
      contactTitle: c.jobTitle,
    });
  });

  leads.forEach((l) => {
    add(l.company?.toLowerCase() || '', {
      type: 'lead',
      id: l.id,
      name: l.company,
      email: l.email,
      phone: l.mobile || l.phone,
      address: leadAddress(l),
      website: l.website,
      industry: l.industry,
      contactName: fullName(l),
      contactTitle: l.jobTitle,
    });
  });

  people.forEach((c) => {
    const name = fullName(c);
    add(`person:${name.toLowerCase()}:${(c.email || c.phone || '').toLowerCase()}`, {
      type: 'contact',
      id: c.id,
      name,
      email: c.email,
      phone: c.phone,
      address: null,
      website: null,
      industry: null,
      contactName: c.company || null,
      contactTitle: c.jobTitle,
    });
  });

  leadPeople.forEach((l) => {
    const name = fullName(l);
    add(`person:${name.toLowerCase()}:${(l.email || l.mobile || l.phone || '').toLowerCase()}`, {
      type: 'lead',
      id: l.id,
      name,
      email: l.email,
      phone: l.mobile || l.phone,
      address: leadAddress(l),
      website: l.website,
      industry: l.industry,
      contactName: l.company || null,
      contactTitle: l.jobTitle,
    });
  });

  const results = Array.from(companyMap.values()).slice(0, includePeople ? 15 : 10);
  return res.json({ results });
});
