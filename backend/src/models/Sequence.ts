import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

/**
 * Generic sequence counter used to generate human-friendly auto-numbers
 * (e.g. ITEM-00001, CAT-00001, LEAD-2026-00001) across the app.
 *
 * One row per "key" (e.g. 'ITEM', 'ITEM_CATEGORY', 'TAX'). Incremented
 * atomically inside a DB transaction with a row lock — see
 * utils/codeGenerator.ts — so concurrent creates never collide or skip.
 */
interface SequenceAttributes {
  id: number;
  key: string;
  currentNumber: number;
}

interface SequenceCreationAttributes extends Optional<SequenceAttributes, 'id' | 'currentNumber'> {}

class Sequence extends Model<SequenceAttributes, SequenceCreationAttributes> implements SequenceAttributes {
  public id!: number;
  public key!: string;
  public currentNumber!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Sequence.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    currentNumber: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'sequences',
    sequelize,
  }
);

export default Sequence;
