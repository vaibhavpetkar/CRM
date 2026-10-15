import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// One follow-up on a lead: the date it was planned for and the remark written
// with it. Changing a lead's Next Follow-up date starts a new row, so the
// earlier dates and remarks stay as the lead's follow-up history.
interface LeadFollowUpAttributes {
  id: number;
  leadId: number;
  followUpDate?: Date | null;
  remark?: string | null;
  createdById?: number | null;
}

interface LeadFollowUpCreationAttributes extends Optional<LeadFollowUpAttributes, 'id'> {}

class LeadFollowUp extends Model<LeadFollowUpAttributes, LeadFollowUpCreationAttributes> implements LeadFollowUpAttributes {
  public id!: number;
  public leadId!: number;
  public followUpDate?: Date | null;
  public remark?: string | null;
  public createdById?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

LeadFollowUp.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    leadId: { type: DataTypes.INTEGER, allowNull: false },
    followUpDate: { type: DataTypes.DATE, allowNull: true },
    remark: { type: DataTypes.TEXT, allowNull: true },
    createdById: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: 'lead_follow_ups',
    sequelize,
    indexes: [{ fields: ['leadId', 'createdAt'] }],
  }
);

export default LeadFollowUp;
