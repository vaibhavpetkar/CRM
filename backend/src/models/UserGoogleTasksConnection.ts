import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Item 2 — per-user Google Tasks sync. Deliberately a separate table from
// the org-level `integrations` table (Phase 12): this is one connection
// PER USER (each person authorizes their own Google account), not one
// connection for the whole org.
interface UserGoogleTasksConnectionAttributes {
  id: number;
  userId: number;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  isEnabled: boolean;
  lastSyncAt?: Date | null;
  lastError?: string | null;
}

interface UserGoogleTasksConnectionCreationAttributes
  extends Optional<UserGoogleTasksConnectionAttributes, 'id' | 'isEnabled'> {}

class UserGoogleTasksConnection
  extends Model<UserGoogleTasksConnectionAttributes, UserGoogleTasksConnectionCreationAttributes>
  implements UserGoogleTasksConnectionAttributes
{
  public id!: number;
  public userId!: number;
  public accessToken?: string | null;
  public refreshToken?: string | null;
  public tokenExpiresAt?: Date | null;
  public isEnabled!: boolean;
  public lastSyncAt?: Date | null;
  public lastError?: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserGoogleTasksConnection.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
      references: { model: 'users', key: 'id' },
    },
    accessToken: { type: DataTypes.TEXT, allowNull: true },
    refreshToken: { type: DataTypes.TEXT, allowNull: true },
    tokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
  },
  { tableName: 'user_google_tasks_connections', sequelize }
);

export default UserGoogleTasksConnection;
