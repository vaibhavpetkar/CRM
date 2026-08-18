import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Distinct from the existing `Template` model (marketing campaign emails —
// see Template.ts) — this is for transactional/automatic documents (quotes,
// invoices, etc.), keyed by docType, with {{field}} placeholders rendered
// via utils/templateRenderer.ts. Only one template per docType can be
// isDefault; that's the one actually used at send-time (see
// QuoteService.sendEmail for the first real integration).
interface DocumentTemplateAttributes {
  id: number;
  name: string;
  docType: string; // 'quote' | 'invoice' | 'task' | 'meeting'
  subject: string; // supports {{field}} placeholders too
  htmlBody: string;
  isDefault: boolean;
  createdById?: number | null;
}

interface DocumentTemplateCreationAttributes extends Optional<DocumentTemplateAttributes, 'id' | 'isDefault'> {}

class DocumentTemplate
  extends Model<DocumentTemplateAttributes, DocumentTemplateCreationAttributes>
  implements DocumentTemplateAttributes
{
  public id!: number;
  public name!: string;
  public docType!: string;
  public subject!: string;
  public htmlBody!: string;
  public isDefault!: boolean;
  public createdById?: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DocumentTemplate.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    docType: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    htmlBody: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '' },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'document_templates', sequelize, indexes: [{ fields: ['docType'] }] }
);

export default DocumentTemplate;
