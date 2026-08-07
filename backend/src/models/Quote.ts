import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface QuoteAttributes {
  id: number;
  quoteNumber: string;
  quotationDate: Date;
  status: string; // 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded'

  // Source — a Quotation is generated directly from a Lead or a Deal (Opportunity)
  leadId?: number | null;
  dealId?: number | null;

  // Customer snapshot — pulled automatically from the source Lead/Deal/Contact
  // at generation time, so the quotation reads correctly even if the source
  // record changes later.
  client: string; // customer / company display name
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;

  // Commercials
  subtotal: number;
  discountType: string; // 'percentage' | 'flat'
  discountValue: number;
  shippingCharges: number;
  taxTotal: number;
  amount: number; // grand total — kept as `amount` for backward compatibility with existing frontend

  // Terms
  terms?: string | null;
  paymentTerms?: string | null;
  salesPersonId?: number | null; // kept as assignedToId for backward compat, see below
  assignedToId?: number | null;

  validUntil?: Date | null;

  // Revisions — accepted/sent quotations that need changes are revised rather
  // than edited in place, preserving history.
  revisionOf?: number | null; // points to the original quote's id
  revisionNumber: number;

  // Generated artifacts
  pdfPath?: string | null;
  sentAt?: Date | null;
  acceptedAt?: Date | null;
  rejectedAt?: Date | null;
  approvedAt?: Date | null;
  approvedById?: number | null;

  createdById?: number | null;
}

interface QuoteCreationAttributes
  extends Optional<
    QuoteAttributes,
    | 'id'
    | 'quoteNumber'
    | 'quotationDate'
    | 'status'
    | 'subtotal'
    | 'discountType'
    | 'discountValue'
    | 'shippingCharges'
    | 'taxTotal'
    | 'amount'
    | 'revisionNumber'
  > {}

class Quote extends Model<QuoteAttributes, QuoteCreationAttributes> implements QuoteAttributes {
  public id!: number;
  public quoteNumber!: string;
  public quotationDate!: Date;
  public status!: string;
  public leadId?: number | null;
  public dealId?: number | null;
  public client!: string;
  public customerEmail?: string | null;
  public customerPhone?: string | null;
  public customerAddress?: string | null;
  public subtotal!: number;
  public discountType!: string;
  public discountValue!: number;
  public shippingCharges!: number;
  public taxTotal!: number;
  public amount!: number;
  public terms?: string | null;
  public paymentTerms?: string | null;
  public salesPersonId?: number | null;
  public assignedToId?: number | null;
  public validUntil?: Date | null;
  public revisionOf?: number | null;
  public revisionNumber!: number;
  public pdfPath?: string | null;
  public sentAt?: Date | null;
  public acceptedAt?: Date | null;
  public rejectedAt?: Date | null;
  public approvedAt?: Date | null;
  public approvedById?: number | null;
  public createdById?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Quote.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    quoteNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    quotationDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },

    leadId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'leads', key: 'id' } },
    dealId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'deals', key: 'id' } },

    client: { type: DataTypes.STRING(255), allowNull: false },
    customerEmail: { type: DataTypes.STRING(255), allowNull: true },
    customerPhone: { type: DataTypes.STRING(20), allowNull: true },
    customerAddress: { type: DataTypes.TEXT, allowNull: true },

    subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    discountType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'percentage' },
    discountValue: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    shippingCharges: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    taxTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

    terms: { type: DataTypes.TEXT, allowNull: true },
    paymentTerms: { type: DataTypes.TEXT, allowNull: true },
    salesPersonId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },

    validUntil: { type: DataTypes.DATEONLY, allowNull: true },

    // No FK constraint on revisionOf (self-reference to the same table via a
    // plain integer, matching the existing convertedToDealId-style pattern
    // elsewhere in this codebase) — keeps sync ordering simple.
    revisionOf: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    revisionNumber: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },

    pdfPath: { type: DataTypes.STRING(500), allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    acceptedAt: { type: DataTypes.DATE, allowNull: true },
    rejectedAt: { type: DataTypes.DATE, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    approvedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },

    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'quotes', sequelize }
);

export default Quote;
