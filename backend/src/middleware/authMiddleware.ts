import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User from '../models/User';
import Role from '../models/Role';

export interface AuthRequest extends Request {
  user?: any;
}

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

    req.user = user;
    next();
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