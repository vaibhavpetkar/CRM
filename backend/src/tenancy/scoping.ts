import { DataTypes, Op, Model, ModelStatic } from 'sequelize';
import logger from '../utils/logger';
import { currentCompanyId } from './context';

import Company from '../models/Company';
import User from '../models/User';
import Employee from '../models/Employee';
import Lead from '../models/Lead';
import LeadProduct from '../models/LeadProduct';
import LeadTax from '../models/LeadTax';
import Deal from '../models/Deal';
import Contact from '../models/Contact';
import Quote from '../models/Quote';
import QuoteProduct from '../models/QuoteProduct';
import QuoteTax from '../models/QuoteTax';
import Invoice from '../models/Invoice';
import Payment from '../models/Payment';
import Meeting from '../models/Meeting';
import Task from '../models/Task';
import Campaign from '../models/Campaign';
import Template from '../models/Template';
import DocumentTemplate from '../models/DocumentTemplate';
import ActivityLog from '../models/ActivityLog';
import Notification from '../models/Notification';
import Attachment from '../models/Attachment';
import Expense from '../models/Expense';
import Item from '../models/Item';
import ItemCategory from '../models/ItemCategory';
import TaxMaster from '../models/TaxMaster';

/**
 * Multi-company data isolation.
 *
 * Every model below holds one company's data and carries a `companyId`
 * column. Instead of adding `where: { companyId }` to every query in every
 * controller, Sequelize hooks do it centrally: inside a logged-in request
 * (see tenancy/context.ts) all finds, counts, sums, bulk updates/deletes are
 * filtered to the user's company, and every insert is stamped with it.
 * A request can never move a record to another company: a companyId sent in
 * a request body is overwritten with the caller's own.
 *
 * Still global for now (single shared copy across companies): roles and
 * permissions, number sequences, integrations and Google connections.
 */
export const TENANT_MODELS: ModelStatic<Model>[] = [
  User,
  Employee,
  Lead,
  LeadProduct,
  LeadTax,
  Deal,
  Contact,
  Quote,
  QuoteProduct,
  QuoteTax,
  Invoice,
  Payment,
  Meeting,
  Task,
  Campaign,
  Template,
  DocumentTemplate,
  ActivityLog,
  Notification,
  Attachment,
  Expense,
  Item,
  ItemCategory,
  TaxMaster,
];

export const TENANT_FIELD = 'companyId';

const addTenantWhere = (options: any, field: string) => {
  const companyId = currentCompanyId();
  if (companyId == null || !options) return;
  const clause = { [field]: companyId };
  options.where = options.where ? { [Op.and]: [options.where, clause] } : clause;
};

const stampInstance = (instance: any, options: any) => {
  const companyId = currentCompanyId();
  if (companyId == null) return;
  instance.set(TENANT_FIELD, companyId);
  if (Array.isArray(options?.fields) && !options.fields.includes(TENANT_FIELD)) {
    options.fields.push(TENANT_FIELD);
  }
};

const scopeReadsAndBulkWrites = (model: any, field: string) => {
  model.addHook('beforeFind', 'tenantScope', (options: any) => addTenantWhere(options, field));
  model.addHook('beforeCount', 'tenantScope', (options: any) => addTenantWhere(options, field));
  model.addHook('beforeBulkDestroy', 'tenantScope', (options: any) => addTenantWhere(options, field));
  model.addHook('beforeBulkRestore', 'tenantScope', (options: any) => addTenantWhere(options, field));
  model.addHook('beforeBulkUpdate', 'tenantScope', (options: any) => {
    addTenantWhere(options, field);
    const companyId = currentCompanyId();
    if (companyId != null && options.attributes && field in options.attributes) {
      options.attributes[field] = companyId;
    }
  });

  // sum/min/max (and aggregate itself) skip the find hooks, so wrap them.
  const aggregate = model.aggregate.bind(model);
  model.aggregate = (attribute: string, aggregateFunction: string, options: any = {}) => {
    addTenantWhere(options, field);
    return aggregate(attribute, aggregateFunction, options);
  };
};

const addCompanyIdAttribute = (model: any) => {
  if (model.rawAttributes[TENANT_FIELD]) return;
  model.rawAttributes[TENANT_FIELD] = { type: DataTypes.INTEGER, allowNull: true };
  model.refreshAttributes();
};

let applied = false;

export const applyTenantScoping = () => {
  if (applied) return;
  applied = true;

  for (const model of TENANT_MODELS as any[]) {
    addCompanyIdAttribute(model);
    scopeReadsAndBulkWrites(model, TENANT_FIELD);

    model.addHook('beforeCreate', 'tenantScope', (instance: any, options: any) => {
      stampInstance(instance, options);
      if (instance.get(TENANT_FIELD) == null) {
        logger.warn(`[tenancy] ${model.name} created without a company (no request context).`);
      }
    });
    model.addHook('beforeBulkCreate', 'tenantScope', (instances: any[], options: any) => {
      instances.forEach((instance) => stampInstance(instance, options));
    });
    model.addHook('beforeUpdate', 'tenantScope', (instance: any) => {
      const companyId = currentCompanyId();
      if (companyId != null && instance.changed(TENANT_FIELD)) instance.set(TENANT_FIELD, companyId);
    });
  }

  // The company record itself: a user can only read or change their own.
  scopeReadsAndBulkWrites(Company, 'id');
};
