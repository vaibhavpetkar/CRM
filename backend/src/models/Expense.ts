import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Feeds the Profit & Loss report (see reportController.getProfitLoss):
// Revenue there comes from actual collected Payments (cash basis), and
// Expenses come from here — there was no cost-tracking at all before this,
// so a P&L report had no "L" side to show.
interface ExpenseAttributes {
  id: number;
  category: string; // free-text, e.g. 'Rent', 'Salaries', 'Software', 'Marketing', 'Utilities', 'Other'
  description: string;
  amount: number;
  expenseDate: Date;
  paymentMethod: string; // 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'online' | 'other'
  vendor?: string | null;
  notes?: string | null;
  recordedById?: number | null;
}

interface ExpenseCreationAttributes extends Optional<ExpenseAttributes, 'id' | 'expenseDate' | 'paymentMethod'> {}

class Expense extends Model<ExpenseAttributes, ExpenseCreationAttributes> implements ExpenseAttributes {
  public id!: number;
  public category!: string;
  public description!: string;
  public amount!: number;
  public expenseDate!: Date;
  public paymentMethod!: string;
  public vendor?: string | null;
  public notes?: string | null;
  public recordedById?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Expense.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    category: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, validate: { min: 0.01 } },
    expenseDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    paymentMethod: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'bank_transfer' },
    vendor: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    recordedById: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  { tableName: 'expenses', sequelize, indexes: [{ fields: ['expenseDate'] }, { fields: ['category'] }] }
);

export default Expense;
