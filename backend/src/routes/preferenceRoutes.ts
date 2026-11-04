import { Router, Response } from 'express';
import { protect, AuthRequest } from '../middleware/authMiddleware';
import { clearPreference, getPreferenceLevels, PreferenceScope, setPreference } from '../services/preferenceService';
import { LEAD_STATUSES } from '../validations/leadValidation';
import { asyncHandler } from '../utils/errorHandler';

// Lead status colours: every user can pick their own, a company admin sets the
// company default, and the super admin sets the default for all companies.

const router = Router();
const KEY = 'lead_status_colors';
const HEX = /^#[0-9a-fA-F]{6}$/;

const canSet = (req: AuthRequest, scope: PreferenceScope) => {
  const user = req.user as any;
  if (scope === 'user') return true;
  if (user?.isSuperAdmin) return true;
  if (scope === 'global') return false;
  const role = user?.role;
  let perms: string[] = [];
  try {
    perms = typeof role?.permissions === 'string' ? JSON.parse(role.permissions) : role?.permissions || [];
  } catch {
    perms = [];
  }
  return perms.includes('*') || perms.includes('company:manage');
};

const parseScope = (value: unknown): PreferenceScope | null =>
  value === 'user' || value === 'company' || value === 'global' ? value : null;

router.get('/lead-status-colors', protect, asyncHandler(async (req: AuthRequest, res: Response) => {
  const levels = await getPreferenceLevels(KEY, req.user as any);
  res.json({ ...levels, canSetCompany: canSet(req, 'company'), canSetGlobal: canSet(req, 'global') });
}));

router.put('/lead-status-colors', protect, asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = parseScope(req.body?.scope);
  if (!scope) return res.status(400).json({ message: 'scope must be user, company or global.' });
  if (!canSet(req, scope)) return res.status(403).json({ message: 'You are not allowed to change this default.' });
  const input = req.body?.colors;
  if (!input || typeof input !== 'object') return res.status(400).json({ message: 'colors is required.' });
  const colors: Record<string, string> = {};
  for (const [status, color] of Object.entries(input)) {
    if (LEAD_STATUSES.includes(status) && typeof color === 'string' && HEX.test(color)) colors[status] = color.toLowerCase();
  }
  await setPreference(scope, KEY, colors, req.user as any);
  res.json({ message: 'Saved.', colors });
}));

router.delete('/lead-status-colors', protect, asyncHandler(async (req: AuthRequest, res: Response) => {
  const scope = parseScope(req.query.scope);
  if (!scope) return res.status(400).json({ message: 'scope must be user, company or global.' });
  if (!canSet(req, scope)) return res.status(403).json({ message: 'You are not allowed to change this default.' });
  await clearPreference(scope, KEY, req.user as any);
  res.json({ message: 'Reset.' });
}));

export default router;
