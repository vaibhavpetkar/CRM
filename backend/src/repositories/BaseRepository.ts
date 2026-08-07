import { Model, ModelStatic, FindOptions, Op, WhereOptions, Transaction } from 'sequelize';

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ListQueryParams {
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  order?: 'ASC' | 'DESC' | string;
  search?: string;
  [key: string]: unknown;
}

/**
 * Generic repository sitting directly on top of Sequelize. Handles the
 * cross-cutting concerns every module needs — pagination, exact-match
 * filtering on whitelisted fields, free-text search across whitelisted
 * fields, and sorting — so concrete repositories (LeadRepository, etc.)
 * only need to declare *which* fields are searchable/filterable and add
 * any module-specific query methods on top.
 */
export class BaseRepository<TModel extends Model> {
  constructor(
    protected readonly model: ModelStatic<TModel>,
    protected readonly searchableFields: string[] = [],
    protected readonly filterableFields: string[] = [],
    protected readonly defaultSortField: string = 'createdAt'
  ) {}

  protected buildWhere(params: ListQueryParams): WhereOptions {
    const where: Record<string, unknown> = {};

    // Exact-match filters on whitelisted fields, e.g. ?status=new&territory=west
    for (const field of this.filterableFields) {
      const value = params[field];
      if (value !== undefined && value !== '') {
        where[field] = value;
      }
    }

    // Free-text search across whitelisted fields, e.g. ?search=acme
    if (params.search && this.searchableFields.length > 0) {
      (where as any)[Op.or] = this.searchableFields.map((field) => ({
        [field]: { [Op.iLike]: `%${params.search}%` },
      }));
    }

    return where;
  }

  async findAll(params: ListQueryParams = {}, options: FindOptions = {}): Promise<PaginatedResult<TModel>> {
    const page = Math.max(1, parseInt(String(params.page ?? 1), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(params.limit ?? 20), 10) || 20));
    const sortBy = params.sortBy ? String(params.sortBy) : this.defaultSortField;
    const order = String(params.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const where = { ...(options.where as object), ...this.buildWhere(params) };

    const result = await this.model.findAndCountAll({
      ...options,
      where,
      limit,
      offset: (page - 1) * limit,
      order: [[sortBy, order]],
      distinct: true,
    });

    return {
      rows: result.rows,
      total: result.count as number,
      page,
      pages: Math.max(1, Math.ceil((result.count as number) / limit)),
      limit,
    };
  }

  async findById(id: number | string, options: FindOptions = {}, transaction?: Transaction): Promise<TModel | null> {
    return this.model.findByPk(id as never, { ...options, ...(transaction ? { transaction } : {}) });
  }

  async findOne(options: FindOptions): Promise<TModel | null> {
    return this.model.findOne(options);
  }

  async create(data: object, transaction?: Transaction): Promise<TModel> {
    return this.model.create(data as never, { transaction });
  }

  async update(instance: TModel, data: object, transaction?: Transaction): Promise<TModel> {
    return instance.update(data as never, { transaction });
  }

  async delete(instance: TModel, transaction?: Transaction): Promise<void> {
    await instance.destroy({ transaction });
  }

  async count(where: WhereOptions = {}): Promise<number> {
    return this.model.count({ where });
  }
}
