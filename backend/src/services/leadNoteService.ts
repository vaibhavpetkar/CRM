import { Op, QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';
import Lead from '../models/Lead';
import LeadNote from '../models/LeadNote';
import User from '../models/User';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError';
import { logActivity } from './activityLogger';
import { userCan } from './callService';
import { localDay } from '../utils/reportTime';
import { buildUserMatcher, detectNoteStatus, formatNoteLine, parseNotesCell, ParsedNote } from '../utils/leadNotes';
import { LEAD_STATUSES } from '../validations/leadValidation';

// Call notes on a lead ("13/09/26 CNR (SAKSHI)"). Writing one stamps today's
// date and the writer's name, and when the text names a lead status the lead
// moves to it. The newest note is copied onto the lead (lastNote* columns) so
// the Leads page can filter by it.

const MAX_NOTE = 2000;

const serializeNote = (n: LeadNote) => ({
  id: n.id,
  leadId: n.leadId,
  noteDate: n.noteDate,
  text: n.text,
  status: n.status ?? null,
  salesPersonName: n.salesPersonName ?? null,
  userId: n.userId ?? null,
  createdById: n.createdById ?? null,
  source: n.source,
  createdAt: n.createdAt,
  line: formatNoteLine(n),
});

const dayOrToday = (value: unknown) => {
  const today = localDay(new Date());
  if (value === undefined || value === null || value === '') return today;
  const day = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new ValidationError('Note date must be a valid date.');
  if (day > today) throw new ValidationError('A note cannot be dated in the future.');
  return day;
};

/** Every user of the company, for matching names written in brackets. */
export const loadNoteUserMatcher = async () =>
  buildUserMatcher(
    (await User.findAll({ attributes: ['id', 'firstName', 'lastName', 'email'], raw: true })) as unknown as {
      id: number; firstName: string; lastName: string; email: string;
    }[]
  );

/**
 * Copies the newest note (latest date, then the last one written) onto the
 * lead. With `applyStatus`, the lead also moves to that note's status.
 */
export const refreshLeadNoteSummary = async (
  lead: Lead,
  opts: { applyStatus?: boolean; userId?: number | null; transaction?: Transaction } = {}
) => {
  const t = opts.transaction;
  const [latest, count] = await Promise.all([
    LeadNote.findOne({ where: { leadId: lead.id }, order: [['noteDate', 'DESC'], ['id', 'DESC']], transaction: t }),
    LeadNote.count({ where: { leadId: lead.id }, transaction: t }),
  ]);
  const before = lead.status;
  const patch: Record<string, unknown> = {
    lastNoteDate: latest?.noteDate ?? null,
    lastNoteStatus: latest?.status ?? null,
    lastNoteText: latest?.text ?? null,
    lastNoteBy: latest?.salesPersonName ?? null,
    lastNoteUserId: latest?.userId ?? null,
    notesCount: count,
  };
  // RFQ Details > Notes shows the latest note ("06/11/26 SWITCH OFF (SHABINA)").
  if (latest) patch.notes = formatNoteLine(latest);
  const newStatus = latest?.status && LEAD_STATUSES.includes(latest.status) ? latest.status : null;
  if (opts.applyStatus && newStatus && newStatus !== before) patch.status = newStatus;
  await lead.update(patch, { transaction: t, hooks: true });
  if (patch.status) {
    await logActivity(
      {
        action: 'status_changed',
        entityType: 'Lead',
        entityId: lead.id,
        performedById: opts.userId ?? null,
        details: `Status: ${before} → ${patch.status} (from note "${formatNoteLine(latest!)}")`,
      },
      t
    );
  }
  return { statusChanged: !!patch.status, status: lead.status };
};

export const listNotes = async (leadId: number | string) => {
  const lead = await Lead.findByPk(leadId as number, { attributes: ['id'] });
  if (!lead) throw new NotFoundError('Lead', leadId);
  const rows = await LeadNote.findAll({ where: { leadId: lead.id }, order: [['noteDate', 'DESC'], ['id', 'DESC']] });
  return rows.map(serializeNote);
};

/** POST /api/leads/:id/notes { text, noteDate? } */
export const addNote = async (leadId: number | string, user: any, body: Record<string, unknown>) => {
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new ValidationError('Write the note first.');
  if (text.length > MAX_NOTE) throw new ValidationError(`A note can be at most ${MAX_NOTE} characters.`);
  const noteDate = dayOrToday(body.noteDate);

  const lead = await Lead.findByPk(leadId as number);
  if (!lead) throw new NotFoundError('Lead', leadId);

  // The writer is the sales person; their first name goes in the brackets.
  const name = String(user?.firstName || '').trim() || `${user?.lastName || ''}`.trim() || String(user?.email || '').split('@')[0] || null;
  const status = detectNoteStatus(text);

  return sequelize.transaction(async (t) => {
    const note = await LeadNote.create(
      { leadId: lead.id, noteDate, text, status, salesPersonName: name, userId: user?.id ?? null, createdById: user?.id ?? null, source: 'manual' },
      { transaction: t }
    );
    await logActivity(
      { action: 'note_added', entityType: 'Lead', entityId: lead.id, performedById: user?.id ?? null, details: `Note: ${formatNoteLine(note)}` },
      t
    );
    const result = await refreshLeadNoteSummary(lead, { applyStatus: true, userId: user?.id ?? null, transaction: t });
    return { note: serializeNote(note), ...result, lead: { id: lead.id, status: lead.status, lastNoteDate: lead.lastNoteDate, lastNoteBy: lead.lastNoteBy, notesCount: lead.notesCount } };
  });
};

/**
 * What someone typed into the lead's Notes field (RFQ Details). Plain text
 * ("CNR") becomes one note dated today with the writer's name; text that
 * already has dates and names ("31/10/26- CNR (SS) 01/11/26 BUSY (SS)") is
 * split into those notes. The lead's status follows the newest note unless
 * `applyStatus` is false (the user picked a status in the same save).
 */
export const addNotesFromText = async (
  lead: Lead,
  rawText: unknown,
  writerId: number | null | undefined,
  opts: { transaction?: Transaction; applyStatus?: boolean } = {}
) => {
  const text = String(rawText ?? '').trim();
  if (!text) return 0;
  const t = opts.transaction;
  const writer = writerId ? await User.findByPk(writerId, { attributes: ['id', 'firstName', 'lastName', 'email'], transaction: t }) : null;
  const writerName = writer ? String(writer.firstName || '').trim() || String(writer.lastName || '').trim() || String(writer.email || '').split('@')[0] : null;
  const parsed = parseNotesCell(text, localDay(new Date()));
  if (!parsed.length) return 0;
  const named = parsed.some((n) => n.salesPersonName);
  const matcher = named ? await loadNoteUserMatcher() : null;
  const rows = parsed.map((n) => ({
    leadId: lead.id,
    noteDate: n.noteDate,
    text: n.text.slice(0, MAX_NOTE),
    status: n.status,
    salesPersonName: n.salesPersonName || writerName,
    userId: n.salesPersonName ? matcher!(n.salesPersonName) : writer?.id ?? null,
    createdById: writerId ?? null,
    source: 'manual' as const,
  }));
  const created = await LeadNote.bulkCreate(rows, { transaction: t });
  await logActivity(
    {
      action: 'note_added',
      entityType: 'Lead',
      entityId: lead.id,
      performedById: writerId ?? null,
      details: `Note: ${created.map((n) => formatNoteLine(n)).join(', ')}`.slice(0, 1000),
    },
    t
  );
  await refreshLeadNoteSummary(lead, { applyStatus: opts.applyStatus !== false, userId: writerId, transaction: t });
  return created.length;
};

/** The writer of a note, or anyone who sees the team, can remove it. */
export const deleteNote = async (leadId: number | string, noteId: number | string, user: any) => {
  const note = await LeadNote.findOne({ where: { id: noteId as number, leadId: leadId as number } });
  if (!note) throw new NotFoundError('Note', noteId);
  if (note.createdById !== user?.id && !userCan(user, 'sales:team') && !userCan(user, 'leads:delete')) {
    throw new ForbiddenError('You can only remove notes you wrote.');
  }
  const lead = await Lead.findByPk(note.leadId);
  return sequelize.transaction(async (t) => {
    await note.destroy({ transaction: t });
    if (lead) await refreshLeadNoteSummary(lead, { transaction: t });
    return { ok: true };
  });
};

/** What status a note would set, for the live hint under the note box. */
export const detectStatus = (text: unknown) => ({ status: detectNoteStatus(String(text ?? '')) });

// ─── Import ──────────────────────────────────────────────────────────────────

export type NoteMatcher = (name: string | null | undefined) => number | null;

/** Parses a notes cell and resolves the names; the last note is the current one. */
export const prepareImportedNotes = (
  cell: unknown,
  matcher: NoteMatcher,
  opts: { day?: string | null; name?: string | null } = {}
) => {
  // A note without a date gets the row's date (e.g. its Site Visit Date), and
  // one without a name in brackets gets the row's Executive Name.
  const notes = parseNotesCell(cell, opts.day || localDay(new Date())).map((n) => {
    const salesPersonName = n.salesPersonName || (opts.name ? String(opts.name).trim().slice(0, 100) : null);
    return { ...n, salesPersonName, userId: matcher(salesPersonName) };
  });
  // Current = newest date; on the same date, the one written last.
  let current: (ParsedNote & { userId: number | null }) | null = null;
  for (const n of notes) if (!current || n.noteDate >= current.noteDate) current = n;
  return { notes, current };
};

/**
 * Saves imported notes on a lead, skipping ones it already has (same day,
 * text and name), so importing an updated sheet again only adds the new ones.
 * The lead's status follows the newest note.
 */
export const saveImportedNotes = async (
  lead: Lead,
  notes: (ParsedNote & { userId: number | null })[],
  userId: number | null | undefined,
  transaction?: Transaction,
  applyStatus = true
) => {
  if (!notes.length) return 0;
  const existing = await LeadNote.findAll({ where: { leadId: lead.id }, attributes: ['noteDate', 'text', 'salesPersonName'], transaction, raw: true });
  const key = (n: { noteDate: string; text: string; salesPersonName?: string | null }) =>
    `${n.noteDate}|${n.text.toLowerCase()}|${String(n.salesPersonName || '').toLowerCase()}`;
  const have = new Map<string, number>();
  for (const e of existing) have.set(key(e as any), (have.get(key(e as any)) || 0) + 1);
  const fresh = notes.filter((n) => {
    const k = key(n);
    const left = have.get(k) || 0;
    if (left > 0) {
      have.set(k, left - 1);
      return false;
    }
    return true;
  });
  if (!fresh.length) return 0;
  await LeadNote.bulkCreate(
    fresh.map((n) => ({
      leadId: lead.id,
      noteDate: n.noteDate,
      text: n.text,
      status: n.status,
      salesPersonName: n.salesPersonName,
      userId: n.userId,
      createdById: userId ?? null,
      source: 'import' as const,
    })),
    { transaction }
  );
  await refreshLeadNoteSummary(lead, { applyStatus, userId, transaction });
  return fresh.length;
};

// ─── Leads page helpers ──────────────────────────────────────────────────────

/** Names in brackets that don't belong to a user ("SS"), for the "Note by" filter. */
export const otherNoteNames = async () => {
  const rows = await LeadNote.findAll({
    where: { userId: null, salesPersonName: { [Op.ne]: null } },
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('salesPersonName')), 'name']],
    raw: true,
    limit: 500,
  });
  return [...new Set((rows as unknown as { name: string }[]).map((r) => String(r.name || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
};

// ─── Sales Activity ──────────────────────────────────────────────────────────

/**
 * Notes written per sales person in a date range (by note date): how many,
 * on how many leads, and what they said (status counts). With `userId` it
 * also lists that person's notes with the lead, newest first.
 */
export const notesActivity = async (
  range: { fromDay: string; toDay: string },
  onlyUserId: number | null,
  opts: { listFor?: number | string | null; limit?: number } = {}
) => {
  const where: any = { noteDate: { [Op.gte]: range.fromDay, [Op.lte]: range.toDay } };
  if (onlyUserId) where.userId = onlyUserId;
  const rows = (await LeadNote.findAll({
    where,
    attributes: ['id', 'leadId', 'noteDate', 'text', 'status', 'salesPersonName', 'userId', 'createdAt'],
    order: [['noteDate', 'DESC'], ['id', 'DESC']],
    raw: true,
  })) as unknown as LeadNote[];

  const people = new Map<string, { key: string; userId: number | null; name: string; notes: number; leads: Set<number>; statuses: Record<string, number>; days: Set<string>; lastNoteDate: string | null }>();
  for (const r of rows) {
    const key = r.userId ? `u:${r.userId}` : `n:${String(r.salesPersonName || '—').toUpperCase()}`;
    if (!people.has(key)) {
      people.set(key, { key, userId: r.userId ?? null, name: r.salesPersonName || '—', notes: 0, leads: new Set(), statuses: {}, days: new Set(), lastNoteDate: null });
    }
    const p = people.get(key)!;
    p.notes += 1;
    p.leads.add(r.leadId);
    p.days.add(r.noteDate);
    const s = r.status || 'other';
    p.statuses[s] = (p.statuses[s] || 0) + 1;
    if (!p.lastNoteDate || r.noteDate > p.lastNoteDate) p.lastNoteDate = r.noteDate;
  }

  // Full names for the people who are users.
  const ids = [...people.values()].map((p) => p.userId).filter((id): id is number => !!id);
  const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id', 'firstName', 'lastName'], raw: true }) : [];
  const nameOf = new Map(users.map((u: any) => [u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim()]));

  const summary = [...people.values()]
    .map((p) => ({
      key: p.key,
      userId: p.userId,
      name: (p.userId && nameOf.get(p.userId)) || p.name,
      notes: p.notes,
      leads: p.leads.size,
      days: p.days.size,
      lastNoteDate: p.lastNoteDate,
      statuses: p.statuses,
    }))
    .sort((a, b) => b.notes - a.notes || a.name.localeCompare(b.name));

  // One person's notes, with the lead they were written on.
  let list: unknown[] | undefined;
  if (opts.listFor) {
    const key = String(opts.listFor);
    const mine = rows.filter((r) => (r.userId ? `u:${r.userId}` : `n:${String(r.salesPersonName || '—').toUpperCase()}`) === key).slice(0, opts.limit || 500);
    const leadIds = [...new Set(mine.map((r) => r.leadId))];
    const leads = leadIds.length
      ? await Lead.findAll({ where: { id: leadIds }, attributes: ['id', 'leadNumber', 'firstName', 'lastName', 'mobile', 'status'], raw: true })
      : [];
    const leadById = new Map(leads.map((l: any) => [l.id, l]));
    list = mine.map((r) => {
      const l: any = leadById.get(r.leadId);
      return {
        id: r.id,
        leadId: r.leadId,
        leadNumber: l?.leadNumber || null,
        leadName: l ? `${l.firstName || ''} ${l.lastName || ''}`.trim() : `Lead #${r.leadId}`,
        mobile: l?.mobile || null,
        leadStatus: l?.status || null,
        noteDate: r.noteDate,
        text: r.text,
        status: r.status,
        salesPersonName: r.salesPersonName,
      };
    });
  }

  const allLeads = new Set(rows.map((r) => r.leadId));
  return { from: range.fromDay, to: range.toDay, totals: { notes: rows.length, leads: allLeads.size, people: summary.length }, people: summary, notes: list };
};

/** Lead ids with a note matching the filters, as SQL for the Leads page (company scoped by the lead itself). */
export type NoteFilter = { from?: string | null; to?: string | null; text?: string | null; status?: string[]; userId?: number | null; name?: string | null };

/** "switch off" -> a Postgres pattern for those words from their start ("vis" finds "visit", "ni" doesn't find "visiting"). */
export const wholeWordsPattern = (text: string) => {
  const escaped = text.trim().split(/\s+/).map((w) => w.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'));
  return '\\m' + escaped.join('\\s+');
};

/** SQL conditions on a lead_notes row aliased `n` for the Notes filters. */
const noteWhereParts = (filters: NoteFilter) => {
  const parts: string[] = [];
  const esc = (v: string) => sequelize.escape(v);
  if (filters.from) parts.push(`n."noteDate" >= ${esc(filters.from)}`);
  if (filters.to) parts.push(`n."noteDate" <= ${esc(filters.to)}`);
  if (filters.text) {
    // From the start of a word, so "ni" doesn't find "visiting"; a status word ("CNR") also
    // finds notes with that status written another way ("not picking").
    const re = esc(wholeWordsPattern(filters.text));
    const status = detectNoteStatus(filters.text);
    parts.push(`(n."text" ~* ${re} OR n."salesPersonName" ~* ${re}${status ? ` OR n."status" = ${esc(status)}` : ''})`);
  }
  if (filters.status?.length) parts.push(`n."status" IN (${filters.status.map(esc).join(', ')})`);
  if (filters.userId) parts.push(`n."userId" = ${Number(filters.userId)}`);
  if (filters.name) parts.push(`n."userId" IS NULL AND n."salesPersonName" ILIKE ${esc(filters.name)}`);
  return parts;
};

export const noteExistsSql = (filters: NoteFilter) =>
  `EXISTS (SELECT 1 FROM "lead_notes" AS n WHERE ${['n."leadId" = "Lead"."id"', ...noteWhereParts(filters)].join(' AND ')})`;

/** For "Any note": the newest note of each lead that fits the filters, so the list shows why it matched. */
export const matchingNotes = async (leadIds: number[], filters: NoteFilter) => {
  if (!leadIds.length) return new Map<number, any>();
  const rows = (await sequelize.query(
    `SELECT DISTINCT ON (n."leadId") n."leadId", n."noteDate", n."text", n."salesPersonName", n."status"
       FROM "lead_notes" AS n
      WHERE n."leadId" IN (${leadIds.map(Number).join(', ')}) AND ${['TRUE', ...noteWhereParts(filters)].join(' AND ')}
      ORDER BY n."leadId", n."noteDate" DESC, n."id" DESC`,
    { type: QueryTypes.SELECT }
  )) as any[];
  return new Map(rows.map((r) => [Number(r.leadId), r]));
};

