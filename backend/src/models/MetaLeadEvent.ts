import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// One row per Facebook/Instagram lead form submission (Meta's leadgen id).
// It is the dedupe key: Meta retries webhooks and a manual sync re-reads
// recent leads, so a lead that already has a row is never created twice.
// It also backs the "recent leads" list on the Integrations page.
export type MetaLeadStatus = 'processing' | 'created' | 'duplicate' | 'failed';

interface MetaLeadEventAttributes {
  id: number;
  leadgenId: string;
  pageId: string;
  formId?: string | null;
  formName?: string | null;
  adName?: string | null;
  campaignName?: string | null;
  platform?: string | null; // 'fb' | 'ig'
  status: MetaLeadStatus;
  leadId?: number | null;
  name?: string | null;
  error?: string | null;
  fieldData?: string | null; // JSON of Meta's field_data, kept for failed rows and auditing
  submittedAt?: Date | null;
}

interface MetaLeadEventCreationAttributes extends Optional<MetaLeadEventAttributes, 'id'> {}

class MetaLeadEvent
  extends Model<MetaLeadEventAttributes, MetaLeadEventCreationAttributes>
  implements MetaLeadEventAttributes
{
  public id!: number;
  public leadgenId!: string;
  public pageId!: string;
  public formId?: string | null;
  public formName?: string | null;
  public adName?: string | null;
  public campaignName?: string | null;
  public platform?: string | null;
  public status!: MetaLeadStatus;
  public leadId?: number | null;
  public name?: string | null;
  public error?: string | null;
  public fieldData?: string | null;
  public submittedAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MetaLeadEvent.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadgenId: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    pageId: { type: DataTypes.STRING(40), allowNull: false },
    formId: { type: DataTypes.STRING(40), allowNull: true },
    formName: { type: DataTypes.STRING(255), allowNull: true },
    adName: { type: DataTypes.STRING(255), allowNull: true },
    campaignName: { type: DataTypes.STRING(255), allowNull: true },
    platform: { type: DataTypes.STRING(10), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false },
    leadId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: true },
    error: { type: DataTypes.STRING(500), allowNull: true },
    fieldData: { type: DataTypes.TEXT, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'meta_lead_events', sequelize, indexes: [{ fields: ['pageId'] }] }
);

export default MetaLeadEvent;
