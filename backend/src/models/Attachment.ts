import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface AttachmentAttributes {
  id: number;
  entityType: string; // 'Lead' | 'Deal' | 'Quote' | 'Invoice' | ...
  entityId: number;
  fileName: string; // stored filename on disk (randomized to avoid collisions)
  originalName: string; // filename as uploaded by the user
  mimeType: string;
  fileSize: number; // bytes
  filePath: string; // relative path under /uploads, served statically
  uploadedById?: number | null;
}

interface AttachmentCreationAttributes extends Optional<AttachmentAttributes, 'id'> {}

class Attachment extends Model<AttachmentAttributes, AttachmentCreationAttributes> implements AttachmentAttributes {
  public id!: number;
  public entityType!: string;
  public entityId!: number;
  public fileName!: string;
  public originalName!: string;
  public mimeType!: string;
  public fileSize!: number;
  public filePath!: string;
  public uploadedById?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Attachment.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    entityType: { type: DataTypes.STRING(50), allowNull: false },
    entityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    originalName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(150), allowNull: false },
    fileSize: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    filePath: { type: DataTypes.STRING(500), allowNull: false },
    uploadedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'attachments', sequelize }
);

export default Attachment;
