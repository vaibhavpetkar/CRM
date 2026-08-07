import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import { NotFoundError, ValidationError } from '../errors/AppError';
import Attachment from '../models/Attachment';
import { logActivity, ActivityEntityType } from '../services/activityLogger';

const ALLOWED_ENTITY_TYPES = ['Lead', 'Deal', 'Quote', 'Invoice', 'Contact', 'Task'];

const assertValidEntityType = (entityType: unknown): ActivityEntityType => {
  if (typeof entityType !== 'string' || !ALLOWED_ENTITY_TYPES.includes(entityType)) {
    throw new ValidationError(`entityType must be one of: ${ALLOWED_ENTITY_TYPES.join(', ')}`);
  }
  return entityType as ActivityEntityType;
};

export const listAttachments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const entityType = assertValidEntityType(req.query.entityType);
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

  const filePath = path.join(__dirname, '../../uploads', attachment.fileName);
  fs.unlink(filePath, () => {
    // Best-effort: if the file is already gone, we still want the DB record removed.
  });

  await attachment.destroy();
  return res.json({ message: 'Attachment deleted successfully' });
});
