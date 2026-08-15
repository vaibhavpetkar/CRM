import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Persisted connection state for a third-party integration (Phase 12). Kept
// deliberately separate from any secrets: access tokens are never stored in
// this table or returned to the frontend — see integrationController.ts.
interface IntegrationAttributes {
  id: number;
  provider: string; // matches a key in PROVIDER_CATALOG, e.g. 'meta', 'calendly'
  status: string; // 'not_configured' | 'connected' | 'error' | 'disconnected'
  isEnabled: boolean;
  config?: string | null; // JSON string — non-secret configuration only
  connectedById?: number | null;
  connectedAt?: Date | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
}

interface IntegrationCreationAttributes
  extends Optional<IntegrationAttributes, 'id' | 'status' | 'isEnabled'> {}

class Integration
  extends Model<IntegrationAttributes, IntegrationCreationAttributes>
  implements IntegrationAttributes
{
  public id!: number;
  public provider!: string;
  public status!: string;
  public isEnabled!: boolean;
  public config?: string | null;
  public connectedById?: number | null;
  public connectedAt?: Date | null;
  public lastSyncAt?: Date | null;
  public lastError?: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Integration.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    provider: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'not_configured' },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    config: { type: DataTypes.TEXT, allowNull: true },
    connectedById: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    connectedAt: { type: DataTypes.DATE, allowNull: true },
    lastSyncAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
  },
  { tableName: 'integrations', sequelize }
);

export default Integration;
