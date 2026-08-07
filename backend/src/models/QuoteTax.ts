import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface QuoteTaxAttributes {
  id: number;
  quoteId: number;
  taxId?: number | null;
  taxType: string; // e.g. "GST 18%", "IGST", "CGST"
  percentage: number;
  amount: number; // computed server-side against the discounted subtotal
}

interface QuoteTaxCreationAttributes extends Optional<QuoteTaxAttributes, 'id' | 'percentage' | 'amount'> {}

class QuoteTax extends Model<QuoteTaxAttributes, QuoteTaxCreationAttributes> implements QuoteTaxAttributes {
  public id!: number;
  public quoteId!: number;
  public taxId?: number | null;
  public taxType!: string;
  public percentage!: number;
  public amount!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

QuoteTax.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    quoteId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'quotes', key: 'id' },
      onDelete: 'CASCADE',
    },
    taxId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'tax_masters', key: 'id' } },
    taxType: { type: DataTypes.STRING(100), allowNull: false },
    percentage: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  },
  { tableName: 'quote_taxes', sequelize }
);

export default QuoteTax;
