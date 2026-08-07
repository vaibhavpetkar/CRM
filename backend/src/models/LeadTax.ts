import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface LeadTaxAttributes {
  id: number;
  leadId: number;
  taxId?: number | null; // optional link to the Tax Master
  taxType: string; // snapshot label, e.g. "GST 18%"
  percentage: number;
  amount: number; // = lead subtotal * percentage / 100, computed server-side
}

interface LeadTaxCreationAttributes extends Optional<LeadTaxAttributes, 'id' | 'percentage' | 'amount'> {}

class LeadTax extends Model<LeadTaxAttributes, LeadTaxCreationAttributes> implements LeadTaxAttributes {
  public id!: number;
  public leadId!: number;
  public taxId?: number | null;
  public taxType!: string;
  public percentage!: number;
  public amount!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

LeadTax.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
      onDelete: 'CASCADE',
    },
    taxId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'tax_masters', key: 'id' },
    },
    taxType: { type: DataTypes.STRING(100), allowNull: false },
    percentage: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  },
  { tableName: 'lead_taxes', sequelize }
);

export default LeadTax;
