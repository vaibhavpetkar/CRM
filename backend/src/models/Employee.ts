import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes for the Employee model
interface EmployeeAttributes {
  id: number;
  userId: number;
  companyId: number;
  employeeId: string; // Unique employee ID (e.g., EMP001)
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId?: number;
  position?: string;
  hireDate?: Date;
  salary?: number;
  isActive: boolean;
}

// Define the creation attributes (excluding auto-generated fields)
interface EmployeeCreationAttributes extends Optional<EmployeeAttributes, 'id'> {}

class Employee extends Model<EmployeeAttributes, EmployeeCreationAttributes> implements EmployeeAttributes {
  public id!: number;
  public userId!: number;
  public companyId!: number;
  public employeeId!: string;
  public firstName!: string;
  public lastName!: string;
  public email!: string;
  public phone?: string;
  public departmentId?: number;
  public position?: string;
  public hireDate?: Date;
  public salary?: number;
  public isActive!: boolean;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Employee.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'companies',
        key: 'id',
      },
    },
    employeeId: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    departmentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    position: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    hireDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    salary: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'employees',
    sequelize,
  }
);

export default Employee;