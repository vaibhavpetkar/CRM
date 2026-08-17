/**
 * Model Associations
 * This file defines all Sequelize associations between models.
 * Import this file in server.ts AFTER all models are imported.
 */

import User from './User';
import Role from './Role';
import Lead from './Lead';
import Deal from './Deal';
import Contact from './Contact';
import Employee from './Employee';
import Company from './Company';
import Task from './Task';
import Meeting from './Meeting';
import Quote from './Quote';
import Invoice from './Invoice';
import Campaign from './Campaign';
import Template from './Template';
import Expense from './Expense';
import GoogleMeetConnection from './GoogleMeetConnection';
import GoogleBusinessConnection from './GoogleBusinessConnection';
import ActivityLog from './ActivityLog';
import Payment from './Payment';
import Notification from './Notification';
import Item from './Item';
import ItemCategory from './ItemCategory';
import TaxMaster from './TaxMaster';
import LeadProduct from './LeadProduct';
import LeadTax from './LeadTax';
import QuoteProduct from './QuoteProduct';
import QuoteTax from './QuoteTax';

// ─── Lead Associations ────────────────────────────────────────────────────────
Lead.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Lead, { foreignKey: 'assignedToId', as: 'assignedLeads' });
Lead.belongsTo(User, { foreignKey: 'qualifiedById', as: 'qualifiedBy' });

// ─── Deal Associations ────────────────────────────────────────────────────────
Deal.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Deal, { foreignKey: 'assignedToId', as: 'assignedDeals' });

Deal.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
Lead.hasMany(Deal, { foreignKey: 'leadId', as: 'deals' });

Deal.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' });
Contact.hasMany(Deal, { foreignKey: 'contactId', as: 'deals' });

Deal.belongsTo(Company, { foreignKey: 'accountId', as: 'account' });
Company.hasMany(Deal, { foreignKey: 'accountId', as: 'deals' });

// ─── Contact Associations ─────────────────────────────────────────────────────
Contact.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Contact, { foreignKey: 'assignedToId', as: 'assignedContacts' });

Contact.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
Lead.hasMany(Contact, { foreignKey: 'leadId', as: 'contacts' });

// ─── ActivityLog Associations ─────────────────────────────────────────────────
ActivityLog.belongsTo(User, { foreignKey: 'performedById', as: 'performedBy' });
User.hasMany(ActivityLog, { foreignKey: 'performedById', as: 'activityLogs' });

// ─── Employee Associations ────────────────────────────────────────────────────
Employee.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(Employee, { foreignKey: 'userId', as: 'employee' });

Employee.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Company.hasMany(Employee, { foreignKey: 'companyId', as: 'employees' });

// ─── Role Associations ────────────────────────────────────────────────────────
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });

// ─── Task Associations ────────────────────────────────────────────────────────
Task.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Task, { foreignKey: 'assignedToId', as: 'assignedTasks' });

// Real relation into the Lead → Deal → Quote → Invoice chain, instead of only
// the free-text `relatedTo` label a user typed by hand.
Task.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
Lead.hasMany(Task, { foreignKey: 'leadId', as: 'tasks' });
Task.belongsTo(Deal, { foreignKey: 'dealId', as: 'deal' });
Deal.hasMany(Task, { foreignKey: 'dealId', as: 'tasks' });
Task.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' });
Contact.hasMany(Task, { foreignKey: 'contactId', as: 'tasks' });

// ─── Meeting Associations ─────────────────────────────────────────────────────
Meeting.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Meeting, { foreignKey: 'assignedToId', as: 'assignedMeetings' });

// Same real relation for Meetings — was only a free-text `client` string before.
Meeting.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
Lead.hasMany(Meeting, { foreignKey: 'leadId', as: 'meetings' });
Meeting.belongsTo(Deal, { foreignKey: 'dealId', as: 'deal' });
Deal.hasMany(Meeting, { foreignKey: 'dealId', as: 'meetings' });
Meeting.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' });
Contact.hasMany(Meeting, { foreignKey: 'contactId', as: 'meetings' });

// ─── Quote Associations ───────────────────────────────────────────────────────
Quote.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Quote, { foreignKey: 'assignedToId', as: 'assignedQuotes' });
Quote.belongsTo(Deal, { foreignKey: 'dealId', as: 'dealRef' });
Deal.hasMany(Quote, { foreignKey: 'dealId', as: 'quotes' });
Quote.belongsTo(Lead, { foreignKey: 'leadId', as: 'leadRef' });
Lead.hasMany(Quote, { foreignKey: 'leadId', as: 'quotes' });

Quote.hasMany(QuoteProduct, { foreignKey: 'quoteId', as: 'products', onDelete: 'CASCADE' });
QuoteProduct.belongsTo(Quote, { foreignKey: 'quoteId', as: 'quote' });
QuoteProduct.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

Quote.hasMany(QuoteTax, { foreignKey: 'quoteId', as: 'taxes', onDelete: 'CASCADE' });
QuoteTax.belongsTo(Quote, { foreignKey: 'quoteId', as: 'quote' });
QuoteTax.belongsTo(TaxMaster, { foreignKey: 'taxId', as: 'tax' });

// ─── Invoice Associations ─────────────────────────────────────────────────────
Invoice.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Invoice, { foreignKey: 'assignedToId', as: 'assignedInvoices' });
Invoice.belongsTo(Quote, { foreignKey: 'quoteId', as: 'quoteRef' });
Quote.hasMany(Invoice, { foreignKey: 'quoteId', as: 'invoices' });

// ─── Campaign Associations ────────────────────────────────────────────────────
Campaign.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });
User.hasMany(Campaign, { foreignKey: 'assignedToId', as: 'assignedCampaigns' });

// ─── Payment Associations ─────────────────────────────────────────────────────
Payment.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
Invoice.hasMany(Payment, { foreignKey: 'invoiceId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'recordedById', as: 'recordedBy' });
User.hasMany(Payment, { foreignKey: 'recordedById', as: 'recordedPayments' });

// ─── Notification Associations ────────────────────────────────────────────────
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });

// ─── Expense Associations ──────────────────────────────────────────────────────
Expense.belongsTo(User, { foreignKey: 'recordedById', as: 'recordedBy' });
User.hasMany(Expense, { foreignKey: 'recordedById', as: 'recordedExpenses' });

// ─── Google Meet / Business Profile Connection Associations ───────────────────
GoogleMeetConnection.belongsTo(User, { foreignKey: 'connectedById', as: 'connectedBy' });
GoogleBusinessConnection.belongsTo(User, { foreignKey: 'connectedById', as: 'connectedBy' });

// ─── Item / Item Category / Tax Master Associations ───────────────────────────
Item.belongsTo(ItemCategory, { foreignKey: 'categoryId', as: 'category' });
ItemCategory.hasMany(Item, { foreignKey: 'categoryId', as: 'items' });

Item.belongsTo(TaxMaster, { foreignKey: 'taxId', as: 'tax' });
TaxMaster.hasMany(Item, { foreignKey: 'taxId', as: 'items' });

ItemCategory.belongsTo(ItemCategory, { foreignKey: 'parentCategoryId', as: 'parentCategory' });
ItemCategory.hasMany(ItemCategory, { foreignKey: 'parentCategoryId', as: 'subCategories' });

// ─── Lead Doctype Child-Table Associations ─────────────────────────────────────
Lead.hasMany(LeadProduct, { foreignKey: 'leadId', as: 'products', onDelete: 'CASCADE' });
LeadProduct.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
LeadProduct.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });

Lead.hasMany(LeadTax, { foreignKey: 'leadId', as: 'taxes', onDelete: 'CASCADE' });
LeadTax.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
LeadTax.belongsTo(TaxMaster, { foreignKey: 'taxId', as: 'tax' });

export {};
