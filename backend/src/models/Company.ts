import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes for the Company model
interface CompanyAttributes {
  id: number;
  name: string;
  email?: string | null;
  phone?: string;
  address?: string;
  website?: string;
  logo?: string;
  industry?: string | null;
  employeeCount?: string | null; // stored as a range label, e.g. "51-100"
  currency: string; // ISO 4217 code, e.g. "USD", "INR" — drives formatCurrency() app-wide
  isActive: boolean;

  // Social links (Settings > Company). All optional — only populated/shown
  // links should ever be surfaced in Quote-sharing messages, etc.
  whatsapp?: string | null; // business number, digits only (e.g. "919876543210")
  instagram?: string | null;
  facebook?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
  twitter?: string | null;

  // Configurable strategic message used when sharing a Quote (WhatsApp/email).
  // Supports {{customerName}}, {{quoteNumber}}, {{quoteValue}}, {{quoteLink}},
  // {{companyName}}, {{companySocialLinks}} placeholders. Null -> a sensible
  // built-in default is used instead (see QuoteService.DEFAULT_SHARE_TEMPLATE).
  quoteMessageTemplate?: string | null;
}

// Define the creation attributes (excluding auto-generated fields)
interface CompanyCreationAttributes extends Optional<CompanyAttributes, 'id' | 'currency' | 'isActive'> {}

class Company extends Model<CompanyAttributes, CompanyCreationAttributes> implements CompanyAttributes {
  public id!: number;
  public name!: string;
  public email?: string | null;
  public phone?: string;
  public address?: string;
  public website?: string;
  public logo?: string;
  public industry?: string | null;
  public employeeCount?: string | null;
  public currency!: string;
  public isActive!: boolean;

  public whatsapp?: string | null;
  public instagram?: string | null;
  public facebook?: string | null;
  public linkedin?: string | null;
  public youtube?: string | null;
  public twitter?: string | null;
  public quoteMessageTemplate?: string | null;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Company.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      // Sequelize's isEmail validator only skips validation for null, not ''.
      // Normalize '' -> null here so clearing the field in the UI doesn't
      // trip isEmail on save (see PUT /api/company 500 with value: '').
      set(value: string | null | undefined) {
        this.setDataValue('email', value === '' || value === undefined ? null : value);
      },
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    logo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    employeeCount: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INR', // Task 3.1: CRM default currency is INR
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    whatsapp: { type: DataTypes.STRING(255), allowNull: true },
    instagram: { type: DataTypes.STRING(255), allowNull: true },
    facebook: { type: DataTypes.STRING(255), allowNull: true },
    linkedin: { type: DataTypes.STRING(255), allowNull: true },
    youtube: { type: DataTypes.STRING(255), allowNull: true },
    twitter: { type: DataTypes.STRING(255), allowNull: true },
    quoteMessageTemplate: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'companies',
    sequelize,
  }
);

export default Company;