import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ItemCategoryAttributes {
  id: number;
  code: string; // auto-generated, e.g. CAT-00001
  name: string;
  description?: string | null;
  parentCategoryId?: number | null; // supports simple category > sub-category nesting
  isActive: boolean;
  createdById?: number | null;
  deletedAt?: Date | null;
}

interface ItemCategoryCreationAttributes
  extends Optional<ItemCategoryAttributes, 'id' | 'isActive' | 'deletedAt'> {}

class ItemCategory
  extends Model<ItemCategoryAttributes, ItemCategoryCreationAttributes>
  implements ItemCategoryAttributes
{
  public id!: number;
  public code!: string;
  public name!: string;
  public description?: string | null;
  public parentCategoryId?: number | null;
  public isActive!: boolean;
  public createdById?: number | null;
  public deletedAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ItemCategory.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    parentCategoryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'item_categories',
        key: 'id',
      },
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
    tableName: 'item_categories',
    sequelize,
    paranoid: true,
  }
);

export default ItemCategory;
