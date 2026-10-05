import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// A company's virtual number (Exotel "ExoPhone") that customers see as the
// caller ID. A number with a userId belongs to that sales person only; one
// without is in the shared pool, handed out automatically so team members
// calling at the same time show different numbers. See callerNumbers.ts.
interface CallerNumberAttributes {
  id: number;
  number: string; // E.164
  label?: string | null;
  userId?: number | null; // dedicated to this user; null = shared pool
  isActive: boolean;
  lastUsedAt?: Date | null;
}

interface CallerNumberCreationAttributes extends Optional<CallerNumberAttributes, 'id' | 'isActive'> {}

class CallerNumber extends Model<CallerNumberAttributes, CallerNumberCreationAttributes> implements CallerNumberAttributes {
  public id!: number;
  public number!: string;
  public label?: string | null;
  public userId?: number | null;
  public isActive!: boolean;
  public lastUsedAt?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

CallerNumber.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    number: { type: DataTypes.STRING(20), allowNull: false },
    label: { type: DataTypes.STRING(60), allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'caller_numbers',
    sequelize,
    indexes: [{ fields: ['userId'] }],
  }
);

export default CallerNumber;
