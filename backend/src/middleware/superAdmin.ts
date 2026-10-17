import type { Request, Response, NextFunction } from 'express';

/**
 * Lets only the platform owner (the super admin) through. Unlike authorize(),
 * no role or permission can grant this: an Administrator of a company still
 * gets 403. Must run after protect, which sets req.user.
 */
export const superAdminOnly = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as Request & { user?: { isSuperAdmin?: boolean } }).user;
  if (!user) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  if (user.isSuperAdmin !== true) {
    return res.status(403).json({ message: 'Only the super admin can do this.' });
  }
  return next();
};

/** Alias of superAdminOnly. */
export const requireSuperAdmin = superAdminOnly;
