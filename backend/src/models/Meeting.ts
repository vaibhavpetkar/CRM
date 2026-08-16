import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface MeetingAttributes {
  id: number;
  title: string;
  client?: string | null; // legacy free-text label, kept for display/back-compat
  leadId?: number | null; // real FK link into the Lead → Deal → Quote → Invoice chain
  dealId?: number | null;
  contactId?: number | null;
  date: Date;
  time?: string | null;
  duration?: string | null;
  type: string; // 'video' | 'in-person' | 'phone'
  status: string; // 'scheduled' | 'completed' | 'cancelled'
  notes?: string | null;
  assignedToId?: number | null;
  // Auto-email on create: client's email + a picked list of CC recipients
  // (typically other contacts at the same company). ccEmails is stored as a
  // JSON-stringified array of email addresses.
  customerEmail?: string | null;
  ccEmails?: string | null;
}

interface MeetingCreationAttributes extends Optional<MeetingAttributes, 'id'> {}

class Meeting extends Model<MeetingAttributes, MeetingCreationAttributes> implements MeetingAttributes {
  public id!: number;
  public title!: string;
  public client?: string | null;
  public leadId?: number | null;
  public dealId?: number | null;
  public contactId?: number | null;
  public date!: Date;
  public time?: string | null;
  public duration?: string | null;
  public type!: string;
  public status!: string;
  public notes?: string | null;
  public assignedToId?: number | null;
  public customerEmail?: string | null;
  public ccEmails?: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Meeting.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    client: { type: DataTypes.STRING(255), allowNull: true },
    leadId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'leads', key: 'id' } },
    dealId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'deals', key: 'id' } },
    contactId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'contacts', key: 'id' } },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    time: { type: DataTypes.STRING(20), allowNull: true },
    duration: { type: DataTypes.STRING(20), allowNull: true },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'video' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
    customerEmail: { type: DataTypes.STRING(255), allowNull: true },
    ccEmails: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'meetings', sequelize }
);

export default Meeting;
