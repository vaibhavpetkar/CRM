import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes for the Lead model
interface LeadAttributes {
  id: number;
  leadNumber: string; // Auto-generated Series ID, e.g. LD-000001 (see codeGenerator.ts)
  date: Date; // Editable "Lead Date", distinct from the createdAt system timestamp
  territory?: string | null;
  alternateMobile?: string | null;
  // Lead Information
  firstName: string;
  lastName: string;
  prefix?: string | null; // Mr., Mrs., Ms., Miss, Dr., Prof., Sir — a.k.a "Salutation"
  email?: string | null;
  phone?: string | null; // Landline
  fax?: string | null;
  mobile?: string | null;
  company?: string | null;
  website?: string | null;
  jobTitle?: string | null; // a.k.a "Designation"
  leadSource: string; // e.g., 'website', 'social-media', 'referral', 'event', 'linkedin'
  status: string;     // 'new' | 'contacted' | 'working' | 'qualified' | 'unqualified' | 'converted' | 'lost'
  industry?: string | null;
  noOfEmployees?: number | null;
  annualRevenue?: string | null; // a.k.a "Annual Turnover" — fixed range label, e.g. "₹1–5 Crores" (Task 2.2)
  rating?: string | null; // Hot, Warm, Cold, etc.
  emailOptOut?: boolean;
  skypeId?: string | null;
  secondaryEmail?: string | null;
  leadImage?: string | null; // Image URL
  leadOwnerId?: number | null; // Assigned user
  
  // Address Information
  country?: string | null;
  state?: string | null;
  city?: string | null;
  street?: string | null;
  zipCode?: string | null; // a.k.a "Pincode"
  latitude?: number | null;
  longitude?: number | null;
  
  // Description
  description?: string | null;
  
  // Scoring & Value
  score: number;      // Lead score (0-100)
  value?: number | null;    // Estimated deal value — used by frontend

  // Products Interested / Taxes totals — recalculated by LeadService whenever
  // the child rows change (see services/LeadService.ts::recalculateTotals).
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  
  // Conversion
  isConverted: boolean;
  convertedAt?: Date | null;
  convertedToContactId?: number | null;
  convertedToAccountId?: number | null;
  convertedToDealId?: number | null;
  
  // System fields
  notes?: string | null; // Rich text / HTML notes
  assignedToId?: number | null;
  sourceDetails?: string | null;
  lastContacted?: Date | null;
  nextFollowUp?: Date | null;

  // RFQ Details
  interestedIn?: string | null; // deprecated — see interestedInServices/interestedInProducts (Task 2.9)
  interestedInServices?: string | null;
  interestedInProducts?: string | null;
  timelineToPurchase?: string | null; // e.g. 'immediate', '1-3-months', '3-6-months', '6-12-months'
  qualifiedById?: number | null; // user who qualified the lead
  meetingStatus?: string | null; // 'unassigned' | 'pending' | 'scheduled' | 'completed' | 'rescheduled' | 'cancelled' | 'no-show' (Task 2.10)

  createdById?: number | null;
  modifiedById?: number | null;
  deletedAt?: Date | null;
}

// Define the creation attributes (excluding auto-generated fields)
interface LeadCreationAttributes extends Optional<LeadAttributes, 
  'id' | 'leadNumber' | 'date' | 'leadSource' | 'status' | 'score' | 'isConverted' | 'emailOptOut' |
  'subtotal' | 'taxTotal' | 'grandTotal' | 'createdById' | 'modifiedById' | 'deletedAt'
> {}

class Lead extends Model<LeadAttributes, LeadCreationAttributes> implements LeadAttributes {
  public id!: number;
  public leadNumber!: string;
  public date!: Date;
  public territory?: string | null;
  public alternateMobile?: string | null;
  // Lead Information
  public firstName!: string;
  public lastName!: string;
  public prefix?: string | null;
  public email?: string | null;
  public phone?: string | null;
  public fax?: string | null;
  public mobile?: string | null;
  public company?: string | null;
  public website?: string | null;
  public jobTitle?: string | null;
  public leadSource!: string;
  public status!: string;
  public industry?: string | null;
  public noOfEmployees?: number | null;
  public annualRevenue?: string | null;
  public rating?: string | null;
  public emailOptOut?: boolean;
  public skypeId?: string | null;
  public secondaryEmail?: string | null;
  public leadImage?: string | null;
  public leadOwnerId?: number | null;
  
  // Address Information
  public country?: string | null;
  public state?: string | null;
  public city?: string | null;
  public street?: string | null;
  public zipCode?: string | null;
  public latitude?: number | null;
  public longitude?: number | null;
  
  // Description
  public description?: string | null;
  
  // Scoring & Value
  public score!: number;
  public value?: number | null;

  // Computed totals
  public subtotal!: number;
  public taxTotal!: number;
  public grandTotal!: number;
  
  // Conversion
  public isConverted!: boolean;
  public convertedAt?: Date | null;
  public convertedToContactId?: number | null;
  public convertedToAccountId?: number | null;
  public convertedToDealId?: number | null;
  
  // System fields
  public notes?: string | null;
  public assignedToId?: number | null;
  public sourceDetails?: string | null;
  public lastContacted?: Date | null;
  public nextFollowUp?: Date | null;
  public interestedIn?: string | null;
  public interestedInServices?: string | null;
  public interestedInProducts?: string | null;
  public timelineToPurchase?: string | null;
  public qualifiedById?: number | null;
  public meetingStatus?: string | null;
  public createdById?: number | null;
  public modifiedById?: number | null;
  public deletedAt?: Date | null;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Lead.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    leadNumber: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    territory: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    alternateMobile: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    // Lead Information
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    prefix: {
      type: DataTypes.STRING(20),
      allowNull: true,
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
    fax: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    mobile: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    jobTitle: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    leadSource: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'website',
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'new',
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    noOfEmployees: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    annualRevenue: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    rating: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    emailOptOut: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    skypeId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    secondaryEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    leadImage: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    leadOwnerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    
    // Address Information
    country: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    street: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    zipCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
    
    // Description
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    
    // Scoring & Value
    score: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    value: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    subtotal: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    taxTotal: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grandTotal: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    
    // Conversion
    isConverted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    convertedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    convertedToContactId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    convertedToAccountId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    convertedToDealId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    
    // System fields
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sourceDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastContacted: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    nextFollowUp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    interestedIn: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    interestedInServices: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    interestedInProducts: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    timelineToPurchase: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    qualifiedById: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    meetingStatus: {
      type: DataTypes.STRING(30),
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
    createdById: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    modifiedById: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  },
  {
    tableName: 'leads',
    sequelize,
    paranoid: true, // Soft deletes
  }
);

export default Lead;