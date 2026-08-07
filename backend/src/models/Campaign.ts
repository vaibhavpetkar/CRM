import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface CampaignAttributes {
  id: number;
  name: string;
  type: string; // 'email' | 'sms' | 'social'
  status: string; // 'draft' | 'scheduled' | 'active' | 'completed'
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  startDate?: Date | null;
  assignedToId?: number | null;
}

interface CampaignCreationAttributes extends Optional<CampaignAttributes, 'id' | 'sent' | 'opened' | 'clicked' | 'converted'> {}

class Campaign extends Model<CampaignAttributes, CampaignCreationAttributes> implements CampaignAttributes {
  public id!: number;
  public name!: string;
  public type!: string;
  public status!: string;
  public sent!: number;
  public opened!: number;
  public clicked!: number;
  public converted!: number;
  public startDate?: Date | null;
  public assignedToId?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Campaign.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'email' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    sent: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    opened: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    clicked: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    converted: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    assignedToId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'campaigns', sequelize }
);

export default Campaign;
