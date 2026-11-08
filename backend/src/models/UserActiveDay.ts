import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// How long each person had the CRM open and in use on a day (India time).
// The app sends a heartbeat once a minute while its tab is visible and the
// person has clicked, typed or scrolled in the last few minutes; each one
// adds a minute. Sales Activity shows it as "Active in CRM".
interface UserActiveDayAttributes {
  id: number;
  userId: number;
  day: string; // YYYY-MM-DD, India time
  activeMinutes: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface UserActiveDayCreationAttributes extends Optional<UserActiveDayAttributes, 'id' | 'activeMinutes'> {}

class UserActiveDay extends Model<UserActiveDayAttributes, UserActiveDayCreationAttributes> implements UserActiveDayAttributes {
  public id!: number;
  public userId!: number;
  public day!: string;
  public activeMinutes!: number;
  public firstSeenAt!: Date;
  public lastSeenAt!: Date;
}

UserActiveDay.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    day: { type: DataTypes.DATEONLY, allowNull: false },
    activeMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    firstSeenAt: { type: DataTypes.DATE, allowNull: false },
    lastSeenAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: 'user_active_days',
    sequelize,
    indexes: [{ unique: true, fields: ['userId', 'day'] }, { fields: ['day'] }],
  }
);

export default UserActiveDay;
