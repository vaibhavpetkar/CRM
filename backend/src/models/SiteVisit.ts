import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// A property site visit: a sales person taking a lead to see a project or
// flat. Counted next to calls in the per-agent activity view (Sales activity).
export type SiteVisitStatus = 'scheduled' | 'completed' | 'revisit-done' | 'cancelled' | 'no-show';
/** A visit that took place: the first site visit or a revisit. */
export const DONE_VISIT_STATUSES: SiteVisitStatus[] = ['completed', 'revisit-done'];
export const SITE_VISIT_STATUSES: SiteVisitStatus[] = ['scheduled', 'completed', 'revisit-done', 'cancelled', 'no-show'];

interface SiteVisitAttributes {
  id: number;
  leadId?: number | null;
  userId: number; // the sales person who takes (or took) the visit
  scheduledAt: Date;
  status: SiteVisitStatus;
  projectName?: string | null;
  location?: string | null;
  notes?: string | null; // feedback after the visit
  completedAt?: Date | null;
  createdById?: number | null;
  autoCreated?: boolean; // logged by the CRM because the lead's status says the visit happened
}

interface SiteVisitCreationAttributes extends Optional<SiteVisitAttributes, 'id' | 'status'> {}

class SiteVisit extends Model<SiteVisitAttributes, SiteVisitCreationAttributes> implements SiteVisitAttributes {
  public id!: number;
  public leadId?: number | null;
  public userId!: number;
  public scheduledAt!: Date;
  public status!: SiteVisitStatus;
  public projectName?: string | null;
  public location?: string | null;
  public notes?: string | null;
  public completedAt?: Date | null;
  public createdById?: number | null;
  public autoCreated?: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SiteVisit.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadId: { type: DataTypes.INTEGER, allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
    projectName: { type: DataTypes.STRING(255), allowNull: true },
    location: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    createdById: { type: DataTypes.INTEGER, allowNull: true },
    autoCreated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: 'site_visits',
    sequelize,
    indexes: [{ fields: ['leadId'] }, { fields: ['userId'] }, { fields: ['scheduledAt'] }],
  }
);

export default SiteVisit;
