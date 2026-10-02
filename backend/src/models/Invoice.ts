import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface InvoiceAttributes {
  id: number;
  invoiceNumber: string;
  client: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  companyAddress?: string | null;
  amount: number; // grand total
  // Commercials — mirror Quote. Invoices without line items (legacy or
  // manually keyed) keep a hand-entered amount and zeroed breakdown.
  subtotal: number;
  discountType: string; // 'percentage' | 'fixed'
  discountValue: number;
  shippingCharges: number;
  taxTotal: number;
  terms?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  status: string; // 'paid' | 'pending' | 'overdue' | 'draft' | 'cancelled'
  issuedDate?: Date | null;
  dueDate?: Date | null;
  quoteId?: number | null;
  assignedToId?: number | null;
}

interface InvoiceCreationAttributes extends Optional<InvoiceAttributes, 'id' | 'invoiceNumber' | 'subtotal' | 'discountType' | 'discountValue' | 'shippingCharges' | 'taxTotal'> {}

class Invoice extends Model<InvoiceAttributes, InvoiceCreationAttributes> implements InvoiceAttributes {
  public id!: number;
  public invoiceNumber!: string;
  public client!: string;
  public customerEmail?: string | null;
  public customerPhone?: string | null;
  public customerAddress?: string | null;
  public companyAddress?: string | null;
  public amount!: number;
  public subtotal!: number;
  public discountType!: string;
  public discountValue!: number;
  public shippingCharges!: number;
  public taxTotal!: number;
  public terms?: string | null;
  public paymentTerms?: string | null;
  public notes?: string | null;
  public status!: string;
  public issuedDate?: Date | null;
  public dueDate?: Date | null;
  public quoteId?: number | null;
  public assignedToId?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Invoice.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    invoiceNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    client: { type: DataTypes.STRING(255), allowNull: false },
    customerEmail: { type: DataTypes.STRING(255), allowNull: true },
    customerPhone: { type: DataTypes.STRING(20), allowNull: true },
    customerAddress: { type: DataTypes.TEXT, allowNull: true },
    companyAddress: { type: DataTypes.TEXT, allowNull: true },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    discountType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'percentage' },
    discountValue: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    shippingCharges: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    taxTotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    terms: { type: DataTypes.TEXT, allowNull: true },
    paymentTerms: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    issuedDate: { type: DataTypes.DATEONLY, allowNull: true },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    quoteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'quotes', key: 'id' } },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'invoices', sequelize }
);

export default Invoice;
