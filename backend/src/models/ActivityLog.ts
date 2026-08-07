import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ActivityLogAttributes {
  id: number;
  action: string; // e.g., 'created', 'updated', 'deleted', 'assigned'
  entityType: string; // e.g., 'Lead', 'Task', 'Deal'
  entityId: number;
  performedById?: number | null;
  details?: string | null;
  // Structured per-field diff, e.g. { company: { before: 'Acme', after: 'Acme Inc' } }.
  // Populated on 'updated' entries so the timeline UI can show a real diff and
  // offer a "Revert" action that re-applies every field's `before` value.
  changes?: Record<string, { before: unknown; after: unknown }> | null;
  // Set once this entry has been reverted, so it can't be reverted twice and the
  // UI can show it as already-reverted.
  revertedAt?: Date | null;
  createdAt?: Date;
}

interface ActivityLogCreationAttributes extends Optional<ActivityLogAttributes, 'id'> {}

class ActivityLog extends Model<ActivityLogAttributes, ActivityLogCreationAttributes> implements ActivityLogAttributes {
  public id!: number;
  public action!: string;
  public entityType!: string;
  public entityId!: number;
  public performedById?: number | null;
  public details?: string | null;
  public changes?: Record<string, { before: unknown; after: unknown }> | null;
  public revertedAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ActivityLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    action: { type: DataTypes.STRING(50), allowNull: false },
    entityType: { type: DataTypes.STRING(50), allowNull: false },
    entityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    performedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
    details: { type: DataTypes.TEXT, allowNull: true },
    changes: { type: DataTypes.JSON, allowNull: true },
    revertedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'activity_logs', sequelize, updatedAt: false }
);

export default ActivityLog;
