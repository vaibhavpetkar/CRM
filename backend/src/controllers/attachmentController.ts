import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError';
import Attachment from '../models/Attachment';
import { logActivity, ActivityEntityType } from '../services/activityLogger';
import { userHasPermission } from '../utils/permissionCheck';

const ALLOWED_ENTITY_TYPES = ['Lead', 'Deal', 'Quote', 'Invoice', 'Contact', 'Task'];

const assertValidEntityType = (entityType: unknown): ActivityEntityType => {
  if (typeof entityType !== 'string' || !ALLOWED_ENTITY_TYPES.includes(entityType)) {
    throw new ValidationError(`entityType must be one of: ${ALLOWED_ENTITY_TYPES.join(', ')}`);
  }
  return entityType as ActivityEntityType;
};

// An attachment is part of its record, so it needs the record's own permission:
// viewing the record to list files, editing it to add or remove one.
const RECORD_PERMISSION: Record<string, { read: string; write: string }> = {
  Lead: { read: 'leads:read', write: 'leads:update' },
  Deal: { read: 'deals:read', write: 'deals:update' },
  Contact: { read: 'contacts:read', write: 'contacts:update' },
  Quote: { read: 'quotes:view', write: 'quotes:view' },
  Invoice: { read: 'invoices:view', write: 'invoices:view' },
  Task: { read: 'tasks:view', write: 'tasks:view' },
};

const assertCan = (req: AuthRequest, entityType: string, access: 'read' | 'write') => {
  const permission = RECORD_PERMISSION[entityType]?.[access];
  if (!permission || !userHasPermission(req.user, permission)) {
    throw new ForbiddenError('You do not have access to this record\'s files');
  }
};

export const listAttachments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const entityType = assertValidEntityType(req.query.entityType);
  assertCan(req, entityType, 'read');
  const entityId = parseInt(String(req.query.entityId), 10);
  if (!entityId) throw new ValidationError('entityId is required');

  const attachments = await Attachment.findAll({
    where: { entityType, entityId },
    order: [['createdAt', 'DESC']],
  });

  return res.json({ attachments });
});

export const uploadAttachment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const entityType = assertValidEntityType(req.body.entityType);
  try {
    assertCan(req, entityType, 'write');
  } catch (err) {
    // multer has already saved the file; don't leave it behind.
    if (req.file) fs.unlink(req.file.path, () => undefined);
    throw err;
  }
  const entityId = parseInt(req.body.entityId, 10);
  if (!entityId) throw new ValidationError('entityId is required');
  if (!req.file) throw new ValidationError('No file was uploaded');

  const attachment = await Attachment.create({
    entityType,
    entityId,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    filePath: `/uploads/${req.file.filename}`,
    uploadedById: req.user?.id || null,
  });

  await logActivity({
    action: 'attachment_added',
    entityType,
    entityId,
    performedById: req.user?.id,
    details: `Attached file "${req.file.originalname}"`,
  });

  return res.status(201).json({ message: 'File uploaded successfully', attachment });
});

export const deleteAttachment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const attachment = await Attachment.findByPk(req.params.id);
  if (!attachment) throw new NotFoundError('Attachment', req.params.id);
  assertCan(req, attachment.entityType, 'write');

  const filePath = path.join(__dirname, '../../uploads', attachment.fileName);
  fs.unlink(filePath, () => {
    // Best-effort: if the file is already gone, we still want the DB record removed.
  });

  await attachment.destroy();
  return res.json({ message: 'Attachment deleted successfully' });
});
