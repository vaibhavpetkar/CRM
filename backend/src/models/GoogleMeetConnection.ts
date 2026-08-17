import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Org-wide connection (one admin connects on behalf of the company) — unlike
// UserGoogleTasksConnection, which is per-user. Deliberately its own table
// rather than a row in the generic `integrations` table, since that table's
// own comment says access tokens are never stored there.
interface GoogleMeetConnectionAttributes {
  id: number;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  isEnabled: boolean;
  connectedById?: number | null;
  connectedAt?: Date | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
}

interface GoogleMeetConnectionCreationAttributes extends Optional<GoogleMeetConnectionAttributes, 'id' | 'isEnabled'> {}

class GoogleMeetConnection
  extends Model<GoogleMeetConnectionAttributes, GoogleMeetConnectionCreationAttributes>
  implements GoogleMeetConnectionAttributes
{
  public id!: number;
  public accessToken?: string | null;
  public refreshToken?: string | null;
  public tokenExpiresAt?: Date | null;
  public isEnabled!: boolean;
  public connectedById?: number | null;
  public connectedAt?: Date | null;
  public lastSyncAt?: Date | null;
  public lastError?: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

GoogleMeetConnection.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    accessToken: { type: DataTypes.TEXT, allowNull: true },
    refreshToken: { type: DataTypes.TEXT, allowNull: true },
    tokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    connectedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
    connectedAt: { type: DataTypes.DATE, allowNull: true },
    lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
  },
  { tableName: 'google_meet_connection', sequelize }
);

export default GoogleMeetConnection;
