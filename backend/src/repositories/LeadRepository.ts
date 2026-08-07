import { FindOptions, Transaction } from 'sequelize';
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
      ['firstName', 'lastName', 'email', 'company', 'leadNumber'], // searchable
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
}

export default new LeadRepository();
