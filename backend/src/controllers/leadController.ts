import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import leadService from '../services/LeadService';

export const getLeads = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await leadService.list(req.query as any);
  return res.json(result);
});

export const getLeadById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.getById(req.params.id);
  return res.json(lead);
});

// Task 2.6: GET /api/leads/check-duplicate?email=&mobile=&excludeId=
export const checkDuplicateLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, mobile, excludeId } = req.query as { email?: string; mobile?: string; excludeId?: string };
  const result = await leadService.checkDuplicate(email || null, mobile || null, excludeId);
  return res.json(result);
});

export const createLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.create(req.body, req.user?.id);
  return res.status(201).json({ message: 'Lead created successfully', lead });
});

export const updateLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.update(req.params.id, req.body, req.user?.id);
  return res.json({ message: 'Lead updated successfully', lead });
});

export const deleteLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  await leadService.delete(req.params.id, req.user?.id);
  return res.json({ message: 'Lead deleted successfully' });
});

export const convertLead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await leadService.convert(req.params.id, req.body || {}, req.user?.id);
  return res.json({ message: 'Lead converted successfully', ...result });
});

export const getLeadStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = await leadService.getStats();
  return res.json(stats);
});

export const getLeadTimeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const timeline = await leadService.getTimeline(req.params.id);
  return res.json({ timeline });
});

export const revertLeadChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lead = await leadService.revert(req.params.id, req.params.logId, req.user?.id);
  return res.json({ message: 'Change reverted successfully', lead });
});
