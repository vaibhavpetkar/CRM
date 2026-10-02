import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User from '../models/User';
import Role from '../models/Role';
import { runWithTenant } from '../tenancy/context';
import { getDefaultCompanyId } from '../tenancy/migration';
import Company from '../models/Company';
import { getSubscriptionState, SubscriptionState } from '../utils/subscription';

export interface AuthRequest extends Request {
  user?: any;
  company?: Company;
  subscription?: SubscriptionState;
}

// What a locked company (trial over, unpaid, blocked) can still reach: enough
// to see why and ask for a renewal. Everything else answers 402.
const allowedWhileLocked = (req: Request) => {
  const path = req.originalUrl.split('?')[0];
  if (path.startsWith('/api/subscription')) return true;
  if (req.method !== 'GET') return false;
  return ['/api/profile', '/api/auth/me', '/api/company'].includes(path) || path.startsWith('/api/notifications');
};

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    const user = await User.findByPk(decoded.id, {
      include: [{ model: Role, as: 'role' }],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is inactive.' });
    }

    // Every user works inside one company; everything after this point only
    // sees that company's records (see tenancy/scoping.ts).
    if (!user.companyId) {
      if (!user.isSuperAdmin) {
        return res.status(403).json({ message: 'Your account is not linked to a company. Please contact your administrator.' });
      }
      await user.update({ companyId: await getDefaultCompanyId() });
    }

    // Outside any tenant context yet, so this reads the user's company directly.
    const company = await Company.findByPk(user.companyId as number);
    if (!company) {
      return res.status(403).json({ message: 'Your company account no longer exists. Please contact support.' });
    }
    const subscription = getSubscriptionState(company);
    // The platform owner (super admin) is never locked out.
    if (subscription.locked && !user.isSuperAdmin && !allowedWhileLocked(req)) {
      return res.status(402).json({
        code: 'SUBSCRIPTION_LOCKED',
        status: subscription.status,
        message: subscription.alert?.message || 'Your subscription is not active.',
      });
    }

    req.user = user;
    req.company = company;
    req.subscription = subscription;
    return runWithTenant(user.companyId as number, () => next());
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

export const authorize = (...permissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    if (!permissions || permissions.length === 0) {
      return next();
    }

    const role = (req.user as any).role;
    if (!role) {
      return res.status(403).json({ message: 'Access forbidden.' });
    }

    // Check if the user's role name matches any of the allowed role names
    if (permissions.includes(role.name)) {
      return next();
    }

    // Check if any permission key matches role's permissions array
    let rolePermissions: string[] = [];
    try {
      rolePermissions = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : (role.permissions || []);
    } catch {
      rolePermissions = [];
    }

    const hasPermission = permissions.some(
      (p) => rolePermissions.includes(p) || rolePermissions.includes('*')
    );

    if (hasPermission) {
      return next();
    }

    return res.status(403).json({ message: 'Access forbidden.' });
  };
};

// Alias — routes use `protect`
export const protect = authMiddleware;