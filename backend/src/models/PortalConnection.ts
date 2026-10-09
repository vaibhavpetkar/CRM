import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// A company's link to a property portal (99acres, MagicBricks, Housing.com).
// Leads arrive either pushed to our webhook (the secret token in the URL
// identifies the company) or pulled from the portal's API with the
// company's portal login, kept in `credentials` and never sent to the browser.
interface PortalConnectionAttributes {
  id: number;
  source: string; // '99acres' | 'magicbricks' | 'housing.com'
  webhookToken: string;
  isEnabled: boolean;
  credentials?: string | null; // JSON, secret
  leadsReceived: number;
  lastLeadAt?: Date | null;
  lastPolledAt?: Date | null;
  lastError?: string | null;
}

interface PortalConnectionCreationAttributes extends Optional<PortalConnectionAttributes, 'id' | 'isEnabled' | 'leadsReceived'> {}

class PortalConnection extends Model<PortalConnectionAttributes, PortalConnectionCreationAttributes> implements PortalConnectionAttributes {
  public id!: number;
  public source!: string;
  public webhookToken!: string;
  public isEnabled!: boolean;
  public credentials?: string | null;
  public leadsReceived!: number;
  public lastLeadAt?: Date | null;
  public lastPolledAt?: Date | null;
  public lastError?: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PortalConnection.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    source: { type: DataTypes.STRING(30), allowNull: false },
    webhookToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    credentials: { type: DataTypes.TEXT, allowNull: true },
    leadsReceived: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastLeadAt: { type: DataTypes.DATE, allowNull: true },
    lastPolledAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
  },
  { tableName: 'portal_connections', sequelize }
);

export default PortalConnection;
