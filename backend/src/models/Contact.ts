import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes for the Contact model
interface ContactAttributes {
  id: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;   // maps to "title" in frontend
  leadSource?: string | null; // e.g., 'website', 'linkedin', 'referral', 'event', 'social-media'
  notes?: string | null;
  assignedToId?: number | null;
  leadId?: number | null;
  lastContacted?: Date | null;
  isActive: boolean;
  deletedAt?: Date | null;
}

// Define the creation attributes (excluding auto-generated fields)
interface ContactCreationAttributes extends Optional<ContactAttributes, 'id'> {}

class Contact extends Model<ContactAttributes, ContactCreationAttributes> implements ContactAttributes {
  public id!: number;
  public firstName!: string;
  public lastName!: string;
  public email?: string | null;
  public phone?: string | null;
  public company?: string | null;
  public jobTitle?: string | null;
  public leadSource?: string | null;
  public notes?: string | null;
  public assignedToId?: number | null;
  public leadId?: number | null;
  public lastContacted?: Date | null;
  public isActive!: boolean;
  public deletedAt?: Date | null;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Contact.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    jobTitle: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    leadSource: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assignedToId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    leadId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'leads',
        key: 'id',
      },
    },
    lastContacted: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'contacts',
    sequelize,
    paranoid: true,
  }
);

export default Contact;
