import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// One row per lead a property portal sent us. The (source, externalId) pair
// is the dedupe key: portals retry pushes and our poller re-reads an
// overlapping window, so a lead that already has a row is never created twice.
export type PortalLeadStatus = 'created' | 'duplicate' | 'failed';

interface PortalLeadEventAttributes {
  id: number;
  source: string;
  externalId: string;
  status: PortalLeadStatus;
  leadId?: number | null;
  name?: string | null;
  mobile?: string | null;
  projectName?: string | null;
  error?: string | null;
  payload?: string | null; // raw JSON, kept for failed rows and auditing
}

interface PortalLeadEventCreationAttributes extends Optional<PortalLeadEventAttributes, 'id'> {}

class PortalLeadEvent extends Model<PortalLeadEventAttributes, PortalLeadEventCreationAttributes> implements PortalLeadEventAttributes {
  public id!: number;
  public source!: string;
  public externalId!: string;
  public status!: PortalLeadStatus;
  public leadId?: number | null;
  public name?: string | null;
  public mobile?: string | null;
  public projectName?: string | null;
  public error?: string | null;
  public payload?: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PortalLeadEvent.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    source: { type: DataTypes.STRING(30), allowNull: false },
    externalId: { type: DataTypes.STRING(100), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    leadId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: true },
    mobile: { type: DataTypes.STRING(20), allowNull: true },
    projectName: { type: DataTypes.STRING(255), allowNull: true },
    error: { type: DataTypes.STRING(500), allowNull: true },
    payload: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'portal_lead_events', sequelize, indexes: [{ fields: ['source', 'externalId'] }] }
);

export default PortalLeadEvent;
