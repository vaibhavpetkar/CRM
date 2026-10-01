import { Request, Response } from 'express';
import DocumentTemplate from '../models/DocumentTemplate';
import User from '../models/User';
import { DOC_TYPES, MERGE_FIELDS, MERGE_LISTS, TEMPLATE_PURPOSES, DocType, TemplatePurpose } from '../config/documentTemplateFields';
import { getStarter } from '../config/printStarters';
import { renderTemplate, extractPlaceholders } from '../utils/templateRenderer';
import { buildDocumentData, getPreviewData, renderDocumentPrint, wrapPrintPage } from '../utils/documentPrint';
import { AppError } from '../errors/AppError';

const VALID_DOC_TYPES = DOC_TYPES.map((d) => d.value);
const VALID_PURPOSES = TEMPLATE_PURPOSES.map((p) => p.value);

const knownKeys = (docType: DocType) => {
  const keys = new Set(MERGE_FIELDS[docType]?.map((f) => f.key));
  for (const list of MERGE_LISTS[docType] || []) {
    keys.add(list.key);
    list.fields.forEach((f) => keys.add(f.key));
  }
  return keys;
};

/** Builder layouts arrive as objects or JSON strings; stored as JSON text, null when absent or invalid. */
const normalizeLayout = (layout: unknown): string | null => {
  if (layout === undefined || layout === null || layout === '') return null;
  if (typeof layout === 'string') {
    try {
      JSON.parse(layout);
      return layout;
    } catch {
      return null;
    }
  }
  return JSON.stringify(layout);
};

const sendError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

const serialize = (template: any) => {
  const plain = template.toJSON ? template.toJSON() : template;
  return { ...plain, createdBy: plain.createdBy ? `${plain.createdBy.firstName} ${plain.createdBy.lastName}` : null };
};

export const getDocTypes = async (_req: Request, res: Response) => {
  return res.json({ docTypes: DOC_TYPES, purposes: TEMPLATE_PURPOSES });
};

/** The built-in layout (print) or default email for a doc type, so a new template starts from something that works. */
export const getStarterTemplate = async (req: Request, res: Response) => {
  const docType = req.params.docType as DocType;
  const purpose = (req.query.purpose as TemplatePurpose) || 'email';
  if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `Unknown document type '${docType}'.` });
  if (!VALID_PURPOSES.includes(purpose)) return res.status(400).json({ message: `purpose must be one of: ${VALID_PURPOSES.join(', ')}` });
  return res.json(getStarter(docType, purpose));
};

export const getMergeFields = async (req: Request, res: Response) => {
  const docType = req.params.docType as DocType;
  if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `Unknown document type '${docType}'.` });
  const sample = getPreviewData(docType);
  // Pre-rendered tables are HTML objects server-side; the editor's instant
  // preview only needs their markup.
  const plainSample = Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? String(v) : v]));
  return res.json({ fields: MERGE_FIELDS[docType], lists: MERGE_LISTS[docType], sample: plainSample });
};

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { docType, purpose } = req.query as { docType?: string; purpose?: string };
    const where: any = {};
    if (docType) where.docType = docType;
    if (purpose) where.purpose = purpose;

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
    const purpose = req.body.purpose || 'email';
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `docType must be one of: ${VALID_DOC_TYPES.join(', ')}` });
    if (!VALID_PURPOSES.includes(purpose)) return res.status(400).json({ message: `purpose must be one of: ${VALID_PURPOSES.join(', ')}` });

    if (isDefault) {
      await DocumentTemplate.update({ isDefault: false }, { where: { docType, purpose } });
    }

    const template = await DocumentTemplate.create({
      name: String(name).trim(),
      docType,
      purpose,
      subject: subject || '',
      htmlBody: htmlBody || '',
      layout: normalizeLayout(req.body.layout),
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
      await DocumentTemplate.update({ isDefault: false }, { where: { docType: template.docType, purpose: template.purpose } });
    }

    if (name !== undefined) template.name = String(name).trim();
    if (subject !== undefined) template.subject = subject;
    if (htmlBody !== undefined) template.htmlBody = htmlBody;
    // Editing the HTML by hand detaches it from a builder design, unless a new design is sent with it.
    if (req.body.layout !== undefined) template.layout = normalizeLayout(req.body.layout);
    else if (htmlBody !== undefined && htmlBody !== template.previous('htmlBody')) template.layout = null;
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

/**
 * Renders subject+htmlBody with sample data, or with a real record's data when
 * `recordId` is given, so the editor can show exactly what will print/send.
 */
export const previewTemplate = async (req: Request, res: Response) => {
  try {
    const { docType, subject, htmlBody, recordId } = req.body as { docType: DocType; subject: string; htmlBody: string; recordId?: number | string };
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `docType must be one of: ${VALID_DOC_TYPES.join(', ')}` });

    const data = recordId ? await buildDocumentData(docType, recordId) : getPreviewData(docType);
    const renderedSubject = renderTemplate(subject || '', data);
    const renderedHtml = renderTemplate(htmlBody || '', data, { escapeHtml: true });
    const keys = knownKeys(docType);
    const unknownFields = extractPlaceholders(`${subject || ''} ${htmlBody || ''}`).filter((f) => !keys.has(f));

    return res.json({ subject: renderedSubject, html: renderedHtml, unknownFields });
  } catch (error) {
    return sendError(res, error, 'Server error while rendering the preview');
  }
};

/**
 * GET /document-templates/print/:docType/:id?templateId=&autoPrint=1 — the
 * print view for any document type. Uses the chosen print format, else the
 * default print format for that type, else the built-in layout.
 */
export const printDocument = async (req: Request, res: Response) => {
  try {
    const docType = req.params.docType as DocType;
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `Unknown document type '${docType}'.` });
    const html = await renderDocumentPrint(docType, req.params.id, {
      templateId: (req.query.templateId as string) || null,
      autoPrint: req.query.autoPrint === '1',
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    return sendError(res, error, 'Server error while rendering the print format');
  }
};

/** A record's merge data as JSON, so the print builder canvas can show real values. */
export const getRecordData = async (req: Request, res: Response) => {
  try {
    const docType = req.params.docType as DocType;
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `Unknown document type '${docType}'.` });
    const data = await buildDocumentData(docType, req.params.id);
    const plain = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? String(v) : v]));
    return res.json({ data: plain });
  } catch (error) {
    return sendError(res, error, 'Server error while loading the record');
  }
};

/** Full-page preview of an unsaved print format (sample or real data), as the print window would show it. */
export const previewPrintPage = async (req: Request, res: Response) => {
  try {
    const { docType, htmlBody, recordId } = req.body as { docType: DocType; htmlBody: string; recordId?: number | string };
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ message: `docType must be one of: ${VALID_DOC_TYPES.join(', ')}` });
    const data = recordId ? await buildDocumentData(docType, recordId) : getPreviewData(docType);
    const html = wrapPrintPage(renderTemplate(htmlBody || '', data, { escapeHtml: true }), 'Preview', req.body.autoPrint === true);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    return sendError(res, error, 'Server error while rendering the preview');
  }
};
