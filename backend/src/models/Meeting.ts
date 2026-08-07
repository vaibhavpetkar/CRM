import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface MeetingAttributes {
  id: number;
  title: string;
  client?: string | null;
  date: Date;
  time?: string | null;
  duration?: string | null;
  type: string; // 'video' | 'in-person' | 'phone'
  status: string; // 'scheduled' | 'completed' | 'cancelled'
  notes?: string | null;
  assignedToId?: number | null;
}

interface MeetingCreationAttributes extends Optional<MeetingAttributes, 'id'> {}

class Meeting extends Model<MeetingAttributes, MeetingCreationAttributes> implements MeetingAttributes {
  public id!: number;
  public title!: string;
  public client?: string | null;
  public date!: Date;
  public time?: string | null;
  public duration?: string | null;
  public type!: string;
  public status!: string;
  public notes?: string | null;
  public assignedToId?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Meeting.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    client: { type: DataTypes.STRING(255), allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    time: { type: DataTypes.STRING(20), allowNull: true },
    duration: { type: DataTypes.STRING(20), allowNull: true },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'video' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'meetings', sequelize }
);

export default Meeting;
