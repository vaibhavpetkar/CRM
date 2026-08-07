import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface NotificationAttributes {
  id: number;
  userId: number; // recipient
  type: string; // 'task_assigned' | 'task_overdue' | 'quote_approved' | 'quote_rejected' | 'invoice_paid' | 'lead_converted' | 'general'
  title: string;
  message: string;
  entityType?: string | null; // e.g. 'Task', 'Quote', 'Invoice'
  entityId?: number | null;
  isRead: boolean;
  readAt?: Date | null;
}

interface NotificationCreationAttributes extends Optional<NotificationAttributes, 'id' | 'isRead'> {}

class Notification extends Model<NotificationAttributes, NotificationCreationAttributes> implements NotificationAttributes {
  public id!: number;
  public userId!: number;
  public type!: string;
  public title!: string;
  public message!: string;
  public entityType?: string | null;
  public entityId?: number | null;
  public isRead!: boolean;
  public readAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Notification.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'general' },
    title: { type: DataTypes.STRING(255), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    entityType: { type: DataTypes.STRING(50), allowNull: true },
    entityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    readAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'notifications', sequelize }
);

export default Notification;
