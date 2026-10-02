import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface InvoiceTaxAttributes {
  id: number;
  invoiceId: number;
  taxId?: number | null;
  taxType: string; // e.g. "GST 18%", "IGST", "CGST"
  percentage: number;
  amount: number; // computed server-side against the discounted subtotal
}

interface InvoiceTaxCreationAttributes extends Optional<InvoiceTaxAttributes, 'id' | 'percentage' | 'amount'> {}

class InvoiceTax extends Model<InvoiceTaxAttributes, InvoiceTaxCreationAttributes> implements InvoiceTaxAttributes {
  public id!: number;
  public invoiceId!: number;
  public taxId?: number | null;
  public taxType!: string;
  public percentage!: number;
  public amount!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

InvoiceTax.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    invoiceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'invoices', key: 'id' },
      onDelete: 'CASCADE',
    },
    taxId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'tax_masters', key: 'id' } },
    taxType: { type: DataTypes.STRING(100), allowNull: false },
    percentage: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  },
  { tableName: 'invoice_taxes', sequelize }
);

export default InvoiceTax;
