import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface TaskAttributes {
  id: number;
  title: string;
  type: string; // 'call' | 'email' | 'meeting' | 'task'
  priority: string; // 'low' | 'medium' | 'high'
  status: string; // 'pending' | 'in-progress' | 'completed'
  dueDate?: Date | null;
  relatedTo?: string | null;
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
  public relatedTo?: string | null;
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
    relatedTo: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'tasks', sequelize, paranoid: true }
);

export default Task;
