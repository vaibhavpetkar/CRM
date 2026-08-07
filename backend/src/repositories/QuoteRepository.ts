import { Transaction } from 'sequelize';
import Quote from '../models/Quote';
import QuoteProduct from '../models/QuoteProduct';
import QuoteTax from '../models/QuoteTax';
import User from '../models/User';
import { BaseRepository, ListQueryParams, PaginatedResult } from './BaseRepository';

const assignedToInclude = {
  model: User,
  attributes: ['id', 'firstName', 'lastName', 'email'],
  as: 'assignedTo',
  required: false,
};

const childTableIncludes = [
  { model: QuoteProduct, as: 'products', required: false },
  { model: QuoteTax, as: 'taxes', required: false },
];

class QuoteRepository extends BaseRepository<Quote> {
  constructor() {
    super(Quote, ['quoteNumber', 'client', 'customerEmail'], ['status', 'dealId', 'leadId', 'assignedToId'], 'createdAt');
  }

  async list(params: ListQueryParams): Promise<PaginatedResult<Quote>> {
    return this.findAll(params, { include: [assignedToInclude] });
  }

  async getByIdWithDetails(id: number | string, transaction?: Transaction): Promise<Quote | null> {
    return this.findById(id, { include: [assignedToInclude, ...childTableIncludes] }, transaction);
  }
}

export default new QuoteRepository();
