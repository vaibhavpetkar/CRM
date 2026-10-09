import { FindOptions, Transaction, Op, WhereOptions } from 'sequelize';
import Lead from '../models/Lead';
import User from '../models/User';
import LeadProduct from '../models/LeadProduct';
import LeadTax from '../models/LeadTax';
import { BaseRepository, ListQueryParams, PaginatedResult } from './BaseRepository';
import { startOfLocalDay } from '../utils/reportTime';

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

    if (!and.length) return base;
    return { ...base, [Op.and]: and };
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
    if (mobile) orConditions.push({ mobile });
    if (orConditions.length === 0) return null;

    const where: any = { [Op.or]: orConditions };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    return this.findOne({ where, order: [['createdAt', 'DESC']], ...options });
  }
}

export default new LeadRepository();
