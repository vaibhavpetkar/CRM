import { Request, Response } from 'express';
import DocumentTemplate from '../models/DocumentTemplate';
import User from '../models/User';
import { DOC_TYPES, MERGE_FIELDS, getSampleData, DocType } from '../config/documentTemplateFields';
import { renderTemplate, extractPlaceholders } from '../utils/templateRenderer';

const VALID_DOC_TYPES = DOC_TYPES.map((d) => d.value);

const serialize = (template: any) => {
  const plain = template.toJSON ? template.toJSON() : template;
  return { ...plain, createdBy: plain.createdBy ? `${plain.createdBy.firstName} ${plain.createdBy.lastName}` : null };
};

export const getDocTypes = async (_req: Request, res: Response) => {
  return res.json({ docTypes: DOC_TYPES });
};

export const getMergeFields = async (req: Request, res: Response) => {
  const docType = req.params.docType as DocType;
  if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `Unknown document type '${docType}'.` });
  return res.json({ fields: MERGE_FIELDS[docType], sample: getSampleData(docType) });
};

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { docType } = req.query as { docType?: string };
    const where: any = {};
    if (docType) where.docType = docType;

    const templates = await DocumentTemplate.findAll({
      where,
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'], required: false }],
      order: [['docType', 'ASC'], ['name', 'ASC']],
    });
    return res.json({ templates: templates.map(serialize) });
  } catch (error) {
    console.error('Get document templates error:', error);
    return res.status(500).json({ message: 'Server error while fetching templates' });
  }
};

export const getTemplate = async (req: Request, res: Response) => {
  try {
    const template = await DocumentTemplate.findByPk(req.params.id, {
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'], required: false }],
    });
    if (!template) return res.status(404).json({ message: 'Template not found' });
    return res.json({ template: serialize(template) });
  } catch (error) {
    console.error('Get document template error:', error);
    return res.status(500).json({ message: 'Server error while fetching the template' });
  }
};

export const createTemplate = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { name, docType, subject, htmlBody, isDefault } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `docType must be one of: ${VALID_DOC_TYPES.join(', ')}` });

    if (isDefault) {
      await DocumentTemplate.update({ isDefault: false }, { where: { docType } });
    }

    const template = await DocumentTemplate.create({
      name: String(name).trim(),
      docType,
      subject: subject || '',
      htmlBody: htmlBody || '',
      isDefault: !!isDefault,
      createdById: req.user?.id || null,
    });

    const withUser = await DocumentTemplate.findByPk(template.id, {
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'], required: false }],
    });
    return res.status(201).json({ template: serialize(withUser) });
  } catch (error) {
    console.error('Create document template error:', error);
    return res.status(500).json({ message: 'Server error while creating the template' });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const template = await DocumentTemplate.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    const { name, subject, htmlBody, isDefault } = req.body;

    if (isDefault === true) {
      await DocumentTemplate.update({ isDefault: false }, { where: { docType: template.docType } });
    }

    if (name !== undefined) template.name = String(name).trim();
    if (subject !== undefined) template.subject = subject;
    if (htmlBody !== undefined) template.htmlBody = htmlBody;
    if (isDefault !== undefined) template.isDefault = !!isDefault;

    await template.save();

    const withUser = await DocumentTemplate.findByPk(template.id, {
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'], required: false }],
    });
    return res.json({ template: serialize(withUser) });
  } catch (error) {
    console.error('Update document template error:', error);
    return res.status(500).json({ message: 'Server error while updating the template' });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const template = await DocumentTemplate.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    await template.destroy();
    return res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete document template error:', error);
    return res.status(500).json({ message: 'Server error while deleting the template' });
  }
};

/** Renders subject+htmlBody with sample data (or a provided id's saved content) so the editor can show a live preview. */
export const previewTemplate = async (req: Request, res: Response) => {
  try {
    const { docType, subject, htmlBody } = req.body as { docType: DocType; subject: string; htmlBody: string };
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `docType must be one of: ${VALID_DOC_TYPES.join(', ')}` });

    const sample = getSampleData(docType);
    const renderedSubject = renderTemplate(subject || '', sample);
    const renderedHtml = renderTemplate(htmlBody || '', sample);
    const unknownFields = extractPlaceholders(`${subject || ''} ${htmlBody || ''}`).filter(
      (f) => !MERGE_FIELDS[docType]?.some((mf) => mf.key === f)
    );

    return res.json({ subject: renderedSubject, html: renderedHtml, unknownFields });
  } catch (error) {
    console.error('Preview document template error:', error);
    return res.status(500).json({ message: 'Server error while rendering the preview' });
  }
};
