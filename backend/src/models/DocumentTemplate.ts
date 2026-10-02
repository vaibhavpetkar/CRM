import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

// Distinct from the existing `Template` model (marketing campaign emails —
// see Template.ts) — this is for transactional/automatic documents (quotes,
// invoices, etc.), keyed by docType, with {{field}} placeholders rendered
// via utils/templateRenderer.ts. `purpose` says whether it is the email sent
// with the document or the printable document itself (its "print format").
// Only one template per docType + purpose can be isDefault; that's the one
// actually used (QuoteService.sendEmail for email, utils/documentPrint.ts
// for every print view).
interface DocumentTemplateAttributes {
  id: number;
  name: string;
  docType: string; // 'quote' | 'invoice' | 'task' | 'meeting'
  purpose: string; // 'email' | 'print'
  // Drag-and-drop builder design (JSON). htmlBody is always the rendered
  // result, so printing never needs to understand the layout itself.
  layout?: string | null;
  subject: string; // supports {{field}} placeholders too
  htmlBody: string;
  isDefault: boolean;
  createdById?: number | null;
}

interface DocumentTemplateCreationAttributes extends Optional<DocumentTemplateAttributes, 'id' | 'isDefault' | 'purpose'> {}

class DocumentTemplate
  extends Model<DocumentTemplateAttributes, DocumentTemplateCreationAttributes>
  implements DocumentTemplateAttributes
{
  public id!: number;
  public name!: string;
  public docType!: string;
  public purpose!: string;
  public layout?: string | null;
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
    purpose: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'email' },
    layout: { type: DataTypes.TEXT, allowNull: true },
    subject: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    htmlBody: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '' },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  { tableName: 'document_templates', sequelize, indexes: [{ fields: ['docType'] }] }
);

export default DocumentTemplate;
