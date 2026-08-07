import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface LeadProductAttributes {
  id: number;
  leadId: number;
  itemId?: number | null; // optional link to the Items master
  productName: string; // snapshot label, so history reads correctly even if the Item is renamed later
  quantity: number;
  unit: string;
  expectedPrice: number;
  amount: number; // = quantity * expectedPrice, computed server-side
}

interface LeadProductCreationAttributes extends Optional<LeadProductAttributes, 'id' | 'quantity' | 'unit' | 'expectedPrice' | 'amount'> {}

class LeadProduct extends Model<LeadProductAttributes, LeadProductCreationAttributes> implements LeadProductAttributes {
  public id!: number;
  public leadId!: number;
  public itemId?: number | null;
  public productName!: string;
  public quantity!: number;
  public unit!: string;
  public expectedPrice!: number;
  public amount!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

LeadProduct.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
      onDelete: 'CASCADE',
    },
    itemId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'items', key: 'id' },
    },
    productName: { type: DataTypes.STRING(200), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 1 },
    unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Nos' },
    expectedPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  },
  { tableName: 'lead_products', sequelize }
);

export default LeadProduct;
