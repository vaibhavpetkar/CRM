import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface PaymentAttributes {
  id: number;
  invoiceId: number;
  amount: number;
  method: string; // 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'online' | 'other'
  reference?: string | null; // transaction id / cheque no.
  paidOn: Date;
  notes?: string | null;
  recordedById?: number | null;
}

interface PaymentCreationAttributes extends Optional<PaymentAttributes, 'id' | 'paidOn'> {}

class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> implements PaymentAttributes {
  public id!: number;
  public invoiceId!: number;
  public amount!: number;
  public method!: string;
  public reference?: string | null;
  public paidOn!: Date;
  public notes?: string | null;
  public recordedById?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Payment.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    invoiceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'invoices', key: 'id' },
    },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, validate: { min: 0.01 } },
    method: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'bank_transfer' },
    reference: { type: DataTypes.STRING(255), allowNull: true },
    paidOn: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.TEXT, allowNull: true },
    recordedById: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  { tableName: 'payments', sequelize }
);

export default Payment;
