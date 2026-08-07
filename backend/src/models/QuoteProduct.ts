import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface QuoteProductAttributes {
  id: number;
  quoteId: number;
  itemId?: number | null;
  productName: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number; // = quantity * rate, computed server-side
}

interface QuoteProductCreationAttributes extends Optional<QuoteProductAttributes, 'id' | 'quantity' | 'unit' | 'rate' | 'amount'> {}

class QuoteProduct extends Model<QuoteProductAttributes, QuoteProductCreationAttributes> implements QuoteProductAttributes {
  public id!: number;
  public quoteId!: number;
  public itemId?: number | null;
  public productName!: string;
  public quantity!: number;
  public unit!: string;
  public rate!: number;
  public amount!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

QuoteProduct.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    quoteId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'quotes', key: 'id' },
      onDelete: 'CASCADE',
    },
    itemId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'items', key: 'id' } },
    productName: { type: DataTypes.STRING(200), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 1 },
    unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Nos' },
    rate: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  },
  { tableName: 'quote_products', sequelize }
);

export default QuoteProduct;
