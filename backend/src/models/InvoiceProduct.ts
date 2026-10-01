import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface InvoiceProductAttributes {
  id: number;
  invoiceId: number;
  itemId?: number | null;
  productName: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number; // = quantity * rate, computed server-side
}

interface InvoiceProductCreationAttributes extends Optional<InvoiceProductAttributes, 'id' | 'quantity' | 'unit' | 'rate' | 'amount'> {}

class InvoiceProduct extends Model<InvoiceProductAttributes, InvoiceProductCreationAttributes> implements InvoiceProductAttributes {
  public id!: number;
  public invoiceId!: number;
  public itemId?: number | null;
  public productName!: string;
  public quantity!: number;
  public unit!: string;
  public rate!: number;
  public amount!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

InvoiceProduct.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    invoiceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'invoices', key: 'id' },
      onDelete: 'CASCADE',
    },
    itemId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'items', key: 'id' } },
    productName: { type: DataTypes.STRING(200), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 1 },
    unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Nos' },
    rate: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  },
  { tableName: 'invoice_products', sequelize }
);

export default InvoiceProduct;
