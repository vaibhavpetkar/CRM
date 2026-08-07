import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface TaxMasterAttributes {
  id: number;
  code: string; // auto-generated, e.g. TAX-00001
  name: string; // e.g. "GST 18%"
  taxType: string; // GST, CGST, SGST, IGST, VAT, Sales Tax, Custom
  rate: number; // percentage, e.g. 18.00
  description?: string | null;
  isActive: boolean;
  createdById?: number | null;
  deletedAt?: Date | null;
}

interface TaxMasterCreationAttributes extends Optional<TaxMasterAttributes, 'id' | 'isActive' | 'deletedAt'> {}

class TaxMaster extends Model<TaxMasterAttributes, TaxMasterCreationAttributes> implements TaxMasterAttributes {
  public id!: number;
  public code!: string;
  public name!: string;
  public taxType!: string;
  public rate!: number;
  public description?: string | null;
  public isActive!: boolean;
  public createdById?: number | null;
  public deletedAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

TaxMaster.init(
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
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    taxType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'GST',
    },
    rate: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'tax_masters',
    sequelize,
    paranoid: true,
  }
);

export default TaxMaster;
