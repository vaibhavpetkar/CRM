import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ItemAttributes {
  id: number;
  itemCode: string; // auto-generated, e.g. ITEM-00001
  itemName: string;
  categoryId?: number | null;
  taxId?: number | null;
  unit: string; // UOM: Nos, Kg, Box, Hour, Litre, etc.
  hsnCode?: string | null; // HSN/SAC code for tax filing
  sku?: string | null;
  sellingPrice: number;
  purchasePrice?: number | null;
  description?: string | null;
  isActive: boolean;
  createdById?: number | null;
  deletedAt?: Date | null;
}

interface ItemCreationAttributes
  extends Optional<ItemAttributes, 'id' | 'unit' | 'sellingPrice' | 'isActive' | 'deletedAt'> {}

class Item extends Model<ItemAttributes, ItemCreationAttributes> implements ItemAttributes {
  public id!: number;
  public itemCode!: string;
  public itemName!: string;
  public categoryId?: number | null;
  public taxId?: number | null;
  public unit!: string;
  public hsnCode?: string | null;
  public sku?: string | null;
  public sellingPrice!: number;
  public purchasePrice?: number | null;
  public description?: string | null;
  public isActive!: boolean;
  public createdById?: number | null;
  public deletedAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Item.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    itemCode: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    itemName: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'item_categories',
        key: 'id',
      },
    },
    taxId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'tax_masters',
        key: 'id',
      },
    },
    unit: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'Nos',
    },
    hsnCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    sku: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    sellingPrice: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    purchasePrice: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdById: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  },
  {
    tableName: 'items',
    sequelize,
    paranoid: true,
  }
);

export default Item;
