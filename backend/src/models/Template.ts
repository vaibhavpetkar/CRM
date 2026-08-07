import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface TemplateAttributes {
  id: number;
  name: string;
  type: string; // 'email' | 'sms'
  category?: string | null;
  subject?: string | null;
  content?: string | null;
  usageCount: number;
  lastUsed?: Date | null;
}

interface TemplateCreationAttributes extends Optional<TemplateAttributes, 'id' | 'usageCount'> {}

class Template extends Model<TemplateAttributes, TemplateCreationAttributes> implements TemplateAttributes {
  public id!: number;
  public name!: string;
  public type!: string;
  public category?: string | null;
  public subject?: string | null;
  public content?: string | null;
  public usageCount!: number;
  public lastUsed?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Template.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'email' },
    category: { type: DataTypes.STRING(100), allowNull: true },
    subject: { type: DataTypes.STRING(255), allowNull: true },
    content: { type: DataTypes.TEXT, allowNull: true },
    usageCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    lastUsed: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'templates', sequelize }
);

export default Template;
