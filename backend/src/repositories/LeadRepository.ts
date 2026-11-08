import { FindOptions, Transaction, Op, WhereOptions } from 'sequelize';
import Lead from '../models/Lead';
import User from '../models/User';
import LeadProduct from '../models/LeadProduct';
import LeadTax from '../models/LeadTax';
import { BaseRepository, ListQueryParams, PaginatedResult } from './BaseRepository';
import { localDay, startOfLocalDay } from '../utils/reportTime';
import { noteExistsSql } from '../services/leadNoteService';
import sequelize from '../config/database';

const assignedToInclude = {
  model: User,
  attributes: ['id', 'firstName', 'lastName', 'email'],
  as: 'assignedTo',
  required: false,
};

const qualifiedByInclude = {
  model: User,
  attributes: ['id', 'firstName', 'lastName', 'email'],
  as: 'qualifiedBy',
  required: false,
};

const childTableIncludes = [
  { model: LeadProduct, as: 'products', required: false },
  { model: LeadTax, as: 'taxes', required: false },
];

// Free-text search on the Leads page: name, number, area, 1 BHK / 2 BHK,
// plus the Series ID and company it always covered (Task 2.17).
const TEXT_SEARCH_FIELDS = [
  'leadNumber', 'company', 'firstName', 'lastName', 'email',
  'preferredLocation', 'city', 'territory', 'street', 'projectName', 'configuration', 'subSource',
];
const PHONE_FIELDS = ['mobile', 'alternateMobile', 'phone'];

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);


// ─── Dates typed into the search box ─────────────────────────────────────────
// "20-11-26", "20/11/2026", "20.11.26", "20-nov-26", "20 Nov 2026", "20-nov"
// mean that day; "nov-26", "nov 2026", "nov" or "november" mean that month.
// They filter on the date the lead was created (Indian time, like the date
// filter), so "rahul 20-nov-26" finds Rahul's lead created that day.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const pad = (n: number) => String(n).padStart(2, '0');
const fullYear = (y: string | undefined, month: number) => {
  if (y) return y.length === 2 ? 2000 + Number(y) : Number(y);
  // No year typed: the most recent one, so in January "dec" means last December.
  const [cy, cm] = localDay(new Date()).split('-').map(Number);
  return month > cm ? cy - 1 : cy;
};
const isRealDay = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

type DayRange = { from: string; to: string }; // inclusive YYYY-MM-DD days

const DATE_PATTERNS: { re: RegExp; toRange: (m: RegExpMatchArray) => DayRange | null }[] = [
  {
    // 20-11-26, 20/11/2026, 20.11.26 (day first, the Indian way)
    re: /(?<![\d])(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?![\d])/g,
    toRange: (m) => {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = fullYear(m[3], mo);
      if (!isRealDay(y, mo, d)) return null;
      const day = `${y}-${pad(mo)}-${pad(d)}`;
      return { from: day, to: day };
    },
  },
  {
    // 20-nov-26, 20 nov 2026, 20/november, 20-nov
    re: new RegExp(`(?<![\\d\\w])(\\d{1,2})[-/. ]?(${MONTH_NAMES})(?:[-/., ]+(\\d{4}|\\d{2}))?(?![\\w])`, 'gi'),
    toRange: (m) => {
      const d = Number(m[1]);
      const mo = MONTHS[m[2].toLowerCase()];
      const y = fullYear(m[3], mo);
      if (!isRealDay(y, mo, d)) return null;
      const day = `${y}-${pad(mo)}-${pad(d)}`;
      return { from: day, to: day };
    },
  },
  {
    // nov-26, nov 2026, nov, november (a whole month)
    re: new RegExp(`(?<![\\w])(${MONTH_NAMES})(?:[-/., ]+(\\d{4}|\\d{2}))?(?![\\w])`, 'gi'),
    toRange: (m) => {
      const mo = MONTHS[m[1].toLowerCase()];
      const y = fullYear(m[2], mo);
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return { from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(last)}` };
    },
  },
];

/** Pulls dates out of the search text; returns the rest of the text and the day range they cover. */
export const extractSearchDates = (text: string): { rest: string; range: DayRange | null } => {
  const ranges: DayRange[] = [];
  let rest = text;
  for (const { re, toRange } of DATE_PATTERNS) {
    rest = rest.replace(re, (...args) => {
      const r = toRange(args as unknown as RegExpMatchArray);
      if (!r) return args[0];
      ranges.push(r);
      return ' ';
    });
  }
  // A lone "to" / "-" between two dates ("1-11-26 to 20-11-26") is not a word to search for.
  if (ranges.length) rest = rest.replace(/(^|\s)(to|till|until|and|-)(?=\s|$)/gi, ' ');
  if (!ranges.length) return { rest: text, range: null };
  // Several dates: everything from the earliest to the latest.
  const from = ranges.map((r) => r.from).sort()[0];
  const to = ranges.map((r) => r.to).sort().slice(-1)[0];
  return { rest, range: { from, to } };
};

/**
 * Turns the search box text into a where clause. Every word has to match
 * somewhere, so "rahul baner 2bhk" finds Rahul's 2 BHK enquiry in Baner.
 * "2bhk", "2 bhk" and "2BHK" all mean the "2 BHK" configuration, and a
 * phone number matches with or without spaces, dashes or +91.
 */
export const buildLeadSearch = (raw: string): WhereOptions | null => {
  let text = raw.trim();
  if (!text) return null;
  const and: any[] = [];

  // Dates first: "20-11-26" would otherwise look like a phone number.
  const dates = extractSearchDates(text);
  if (dates.range) {
    and.push({ createdAt: { [Op.gte]: startOfLocalDay(dates.range.from), [Op.lt]: startOfLocalDay(dates.range.to, true) } });
    text = dates.rest;
  }

  // "2 bhk" / "2bhk" / "1rk" -> configuration filter, then drop it from the text.
  text = text.replace(/\b(\d+(?:\.\d)?)\s*(bhk|rk)\b/gi, (_m, n, kind) => {
    and.push({ configuration: { [Op.iLike]: `${n} ${kind.toUpperCase()}%` } });
    return ' ';
  });

  // A phone number, possibly typed with spaces: "98765 43210", "+91-98765-43210".
  const compact = text.replace(/[\s\-()]/g, '');
  if (/^\+?\d{4,}$/.test(compact)) {
    const digits = compact.replace(/^\+?91(?=\d{10}$)/, '').replace(/^\+/, '');
    and.push({
      [Op.or]: [
        ...PHONE_FIELDS.map((f) => ({ [f]: { [Op.iLike]: `%${digits}%` } })),
        { leadNumber: { [Op.iLike]: `%${escapeLike(text.trim())}%` } },
      ],
    });
    return and.length === 1 ? and[0] : { [Op.and]: and };
  }

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const like = `%${escapeLike(word)}%`;
    const or: any[] = TEXT_SEARCH_FIELDS.map((f) => ({ [f]: { [Op.iLike]: like } }));
    if (/^\d{3,}$/.test(word)) PHONE_FIELDS.forEach((f) => or.push({ [f]: { [Op.iLike]: like } }));
    and.push({ [Op.or]: or });
  }
  if (!and.length) return null;
  return and.length === 1 ? and[0] : { [Op.and]: and };
};

const csv = (value: unknown) =>
  String(value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v && v !== 'all');

const toNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Lead date filter: whole days in Indian time, like the sales reports.
const toDay = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

class LeadRepository extends BaseRepository<Lead> {
  constructor() {
    super(
      Lead,
      TEXT_SEARCH_FIELDS, // searchable (see buildLeadSearch for how words are matched)
      ['status', 'territory', 'industry', 'propertyType'], // exact-match filterable
      'createdAt'
    );
  }

  /**
   * Leads page filters on top of the exact-match ones: several sources or
   * configurations at once (comma separated), sales person ("unassigned"
   * for none), area, budget range and the lead date range.
   */
  protected buildWhere(params: ListQueryParams): WhereOptions {
    const base: any = super.buildWhere({ ...params, search: undefined });
    const and: any[] = [];

    const search = buildLeadSearch(String(params.search ?? ''));
    if (search) and.push(search);

    const sources = csv(params.leadSource);
    if (sources.length) and.push({ leadSource: { [Op.in]: sources } });

    const subSource = String(params.subSource ?? '').trim();
    if (subSource) and.push({ subSource: { [Op.iLike]: `%${escapeLike(subSource)}%` } });

    const configurations = csv(params.configuration);
    if (configurations.length) and.push({ configuration: { [Op.in]: configurations } });

    const assignee = String(params.assignedToId ?? '').trim();
    if (assignee === 'unassigned') and.push({ assignedToId: null });
    else if (assignee && assignee !== 'all') {
      const ids = csv(assignee).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) and.push({ assignedToId: { [Op.in]: ids } });
    }

    const location = String(params.location ?? '').trim();
    if (location) {
      const like = `%${escapeLike(location)}%`;
      and.push({ [Op.or]: ['preferredLocation', 'city', 'territory'].map((f) => ({ [f]: { [Op.iLike]: like } })) });
    }

    // A lead fits the budget filter when its range overlaps the one asked for.
    const minBudget = toNumber(params.budgetFrom);
    const maxBudget = toNumber(params.budgetTo);
    if (minBudget != null) and.push({ [Op.or]: [{ budgetMax: { [Op.gte]: minBudget } }, { budgetMax: null, budgetMin: { [Op.gte]: minBudget } }] });
    if (maxBudget != null) and.push({ budgetMin: { [Op.lte]: maxBudget } });

    const from = toDay(params.dateFrom);
    const to = toDay(params.dateTo);
    if (from || to) {
      const range: any = {};
      if (from) range[Op.gte] = startOfLocalDay(from);
      if (to) range[Op.lt] = startOfLocalDay(to, true);
      and.push({ createdAt: range });
    }

    and.push(...this.noteFilters(params));

    if (!and.length) return base;
    return { ...base, [Op.and]: and };
  }

  /**
   * Call note filters. By default they look at each lead's latest note (its
   * date, what it said, who wrote it), the way the lead's status does;
   * noteScope=any looks for any one note that fits all of them.
   */
  private noteFilters(params: ListQueryParams): any[] {
    const from = toDay(params.noteFrom);
    const to = toDay(params.noteTo);
    const text = String(params.noteSearch ?? '').trim().slice(0, 200) || null;
    const statuses = csv(params.noteStatus);
    const by = String(params.noteBy ?? '').trim();
    const byUserId = /^\d+$/.test(by) ? Number(by) : null;
    const byName = by.startsWith('name:') ? by.slice(5).trim() || null : null;
    if (!from && !to && !text && !statuses.length && !byUserId && !byName) return [];

    if (String(params.noteScope ?? '') === 'any') {
      return [sequelize.literal(noteExistsSql({ from, to, text, status: statuses, userId: byUserId, name: byName }))];
    }
    const out: any[] = [];
    if (from || to) {
      const range: any = {};
      if (from) range[Op.gte] = from;
      if (to) range[Op.lte] = to;
      out.push({ lastNoteDate: range });
    }
    if (text) {
      const like = `%${escapeLike(text)}%`;
      out.push({ [Op.or]: [{ lastNoteText: { [Op.iLike]: like } }, { lastNoteBy: { [Op.iLike]: like } }] });
    }
    if (statuses.length) out.push({ lastNoteStatus: { [Op.in]: statuses } });
    if (byUserId) out.push({ lastNoteUserId: byUserId });
    if (byName) out.push({ lastNoteUserId: null, lastNoteBy: { [Op.iLike]: escapeLike(byName) } });
    return out;
  }

  async list(params: ListQueryParams): Promise<PaginatedResult<Lead>> {
    return this.findAll(params, { include: [assignedToInclude] });
  }

  async getByIdWithDetails(id: number | string, transaction?: Transaction): Promise<Lead | null> {
    return this.findById(id, { include: [assignedToInclude, qualifiedByInclude, ...childTableIncludes] }, transaction);
  }

  async findByEmail(email: string, options: FindOptions = {}): Promise<Lead | null> {
    return this.findOne({ where: { email }, ...options });
  }

  // Task 2.6: duplicate detection by mobile OR email. Returns the first match
  // (most recently created) so the UI can offer "View Existing Lead".
  async findDuplicate(
    { email, mobile }: { email?: string | null; mobile?: string | null },
    excludeId?: number | string,
    options: FindOptions = {}
  ): Promise<Lead | null> {
    const orConditions: any[] = [];
    if (email) orConditions.push({ email });
    if (mobile) {
      // The same Indian number can be saved as 9876543210, 919876543210,
      // +919876543210 or 09876543210 (imports keep 10 digits, Facebook sends
      // +91...), so look for every form of it.
      const digits = String(mobile).replace(/\D/g, '');
      const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
      const forms = ten.length === 10 ? [ten, `91${ten}`, `+91${ten}`, `0${ten}`, `+91 ${ten}`] : [];
      orConditions.push({ mobile: { [Op.in]: [...new Set([String(mobile), ...forms])] } });
    }
    if (orConditions.length === 0) return null;

    const where: any = { [Op.or]: orConditions };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    return this.findOne({ where, order: [['createdAt', 'DESC']], ...options });
  }
}

export default new LeadRepository();
