import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface TaskAttributes {
  id: number;
  title: string;
  type: string; // 'call' | 'email' | 'online-meeting' | 'in-person-meeting' | 'field-visit' (Task 4.8)
  priority: string; // 'low' | 'medium' | 'high'
  status: string; // 'pending' | 'in-progress' | 'completed' | 'rescheduled' | 'disconnected-call' (Task 4.3)
  dueDate?: Date | null;
  dueTime?: string | null; // "HH:MM" (Task 4.7)
  relatedTo?: string | null; // a.k.a "Company Name" (Task 4.5) — legacy free-text label, kept for display/back-compat
  leadId?: number | null; // real FK link into the Lead → Deal → Quote → Invoice chain
  dealId?: number | null;
  contactId?: number | null;
  description?: string | null;
  assignedToId?: number | null;
  deletedAt?: Date | null;
}

interface TaskCreationAttributes extends Optional<TaskAttributes, 'id'> {}

class Task extends Model<TaskAttributes, TaskCreationAttributes> implements TaskAttributes {
  public id!: number;
  public title!: string;
  public type!: string;
  public priority!: string;
  public status!: string;
  public dueDate?: Date | null;
  public dueTime?: string | null;
  public relatedTo?: string | null;
  public leadId?: number | null;
  public dealId?: number | null;
  public contactId?: number | null;
  public description?: string | null;
  public assignedToId?: number | null;
  public deletedAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Task.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'task' },
    priority: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'medium' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    dueDate: { type: DataTypes.DATE, allowNull: true },
    dueTime: { type: DataTypes.STRING(8), allowNull: true },
    relatedTo: { type: DataTypes.STRING(255), allowNull: true },
    leadId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'leads', key: 'id' } },
    dealId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'deals', key: 'id' } },
    contactId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'contacts', key: 'id' } },
    description: { type: DataTypes.TEXT, allowNull: true },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'tasks', sequelize, paranoid: true }
);

export default Task;
