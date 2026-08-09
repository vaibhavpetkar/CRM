import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes for the Deal model
interface DealAttributes {
  id: number;
  title: string;
  client: string;
  value: number;
  currency: string;
  stage: string; // 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed-won' | 'closed-lost'
  probability: number; // percentage (0-100)
  expectedCloseDate?: Date | null;
  actualCloseDate?: Date | null;
  leadId?: number | null;
  quoteId?: number | null; // links back to the Quotation this Deal was created/updated from on acceptance
  accountId?: number | null;   // Made nullable — frontend doesn't send this
  contactId?: number | null;
  assignedToId?: number | null;
  source?: string | null;
  description?: string | null;
  nextStep?: string | null;
  isActive: boolean;
  deletedAt?: Date | null;
}

// Define the creation attributes (excluding auto-generated fields)
interface DealCreationAttributes extends Optional<DealAttributes, 'id'> {}

class Deal extends Model<DealAttributes, DealCreationAttributes> implements DealAttributes {
  public id!: number;
  public title!: string;
  public client!: string;
  public value!: number;
  public currency!: string;
  public stage!: string;
  public probability!: number;
  public expectedCloseDate?: Date | null;
  public actualCloseDate?: Date | null;
  public leadId?: number | null;
  public quoteId?: number | null;
  public accountId?: number | null;
  public contactId?: number | null;
  public assignedToId?: number | null;
  public source?: string | null;
  public description?: string | null;
  public nextStep?: string | null;
  public isActive!: boolean;
  public deletedAt?: Date | null;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Deal.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    value: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'INR',
    },
    client: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    stage: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'prospecting',
    },
    probability: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100,
      },
    },
    expectedCloseDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    actualCloseDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    leadId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'leads',
        key: 'id',
      },
    },
    quoteId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    accountId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,    // Was NOT NULL — frontend never sends this, so made nullable
      references: {
        model: 'companies',
        key: 'id',
      },
    },
    contactId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'contacts',
        key: 'id',
      },
    },
    assignedToId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    nextStep: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'deals',
    sequelize,
    paranoid: true,
  }
);

export default Deal;