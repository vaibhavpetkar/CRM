import { FindOptions, Transaction, Op } from 'sequelize';
import Lead from '../models/Lead';
import User from '../models/User';
import LeadProduct from '../models/LeadProduct';
import LeadTax from '../models/LeadTax';
import { BaseRepository, ListQueryParams, PaginatedResult } from './BaseRepository';

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

class LeadRepository extends BaseRepository<Lead> {
  constructor() {
    super(
      Lead,
      ['leadNumber', 'company'], // searchable — Task 2.17: Series ID or Company Name only
      ['status', 'leadSource', 'territory', 'industry', 'assignedToId'], // filterable
      'createdAt'
    );
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
