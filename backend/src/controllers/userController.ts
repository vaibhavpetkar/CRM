import { Request, Response } from 'express';
import { Op } from 'sequelize';
import User from '../models/User';
import Role from '../models/Role';
import { AuthRequest } from '../middleware/authMiddleware';

const safeParsePermissions = (permissions: string | undefined) => {
  if (!permissions) return [] as string[];
  try {
    return JSON.parse(permissions) as string[];
  } catch {
    return [] as string[];
  }
};

const serializeUser = (user: any) => {
  const plain = user.toJSON ? user.toJSON() : user;
  const role = plain.role;
  return {
    id: plain.id,
    name: `${plain.firstName} ${plain.lastName}`,
    firstName: plain.firstName,
    lastName: plain.lastName,
    email: plain.email,
    phone: plain.phone,
    isSuperAdmin: plain.isSuperAdmin,
    isActive: plain.isActive,
    emailVerified: plain.emailVerified,
    status: plain.emailVerified ? (plain.isActive ? 'active' : 'inactive') : 'invited',
    roleId: plain.roleId,
    role: role ? { id: role.id, name: role.name, permissions: safeParsePermissions(role.permissions) } : null,
    createdAt: plain.createdAt,
    lastLogin: plain.lastLogin,
  };
};

// GET /api/users
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where: whereClause,
      include: [{ model: Role, as: 'role' }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ users: users.map(serializeUser), total: users.length });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ message: 'Server error while fetching users' });
  }
};

// GET /api/users/assignable
// Lightweight, permission-light endpoint: returns active users' names/emails only.
// Any authenticated user can call this — it's used to populate "Assign To"
// datalists/dropdowns (leads, deals, tasks, etc.) so that Sales Reps (who don't
// have the full users:view permission) can still see who they can assign work to.
export const getAssignableUsers = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const whereClause: any = { isActive: true };

    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'firstName', 'lastName', 'email'],
      order: [['firstName', 'ASC']],
    });

    return res.json({
      users: users.map((u: any) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
      })),
      total: users.length,
    });
  } catch (error) {
    console.error('Get assignable users error:', error);
    return res.status(500).json({ message: 'Server error while fetching assignable users' });
  }
};

// GET /api/users/:id
export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.params.id, { include: [{ model: Role, as: 'role' }] });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/users/:id — update role / active status
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { roleId, isActive, firstName, lastName, phone } = req.body;

    // Prevent locking yourself out or demoting the last super admin accidentally
    if (typeof isActive === 'boolean' && user.id === req.user?.id && !isActive) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    // Protect super admins from being demoted or deactivated by non-super-admins,
    // and never deactivate the last active super admin (would lock everyone out).
    if (user.isSuperAdmin) {
      if (req.user?.id !== user.id && !req.user?.isSuperAdmin) {
        return res.status(403).json({ message: 'Only a super admin can modify another super admin account.' });
      }
      if (typeof isActive === 'boolean' && !isActive) {
        const activeSuperAdmins = await User.count({ where: { isSuperAdmin: true, isActive: true } });
        if (activeSuperAdmins <= 1) {
          return res.status(400).json({ message: 'Cannot deactivate the last active super admin.' });
        }
      }
    }

    if (roleId !== undefined && roleId !== null && roleId !== '') {
      const roleExists = await Role.findByPk(roleId);
      if (!roleExists) {
        return res.status(400).json({ message: 'Selected role does not exist' });
      }
    }

    await user.update({
      roleId: roleId !== undefined ? (roleId === '' ? null : roleId) : user.roleId,
      isActive: typeof isActive === 'boolean' ? isActive : user.isActive,
      firstName: firstName !== undefined ? firstName : user.firstName,
      lastName: lastName !== undefined ? lastName : user.lastName,
      phone: phone !== undefined ? phone : user.phone,
    });

    const updated = await User.findByPk(user.id, { include: [{ model: Role, as: 'role' }] });
    return res.json({ message: 'User updated successfully', user: serializeUser(updated) });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ message: 'Server error while updating user' });
  }
};

// DELETE /api/users/:id — deactivate (soft delete, we never hard-delete accounts)
export const deactivateUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.id === req.user?.id) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    if (user.isSuperAdmin && !req.user?.isSuperAdmin) {
      return res.status(403).json({ message: 'Only a super admin can deactivate a super admin.' });
    }

    if (user.isSuperAdmin) {
      const activeSuperAdmins = await User.count({ where: { isSuperAdmin: true, isActive: true } });
      if (activeSuperAdmins <= 1) {
        return res.status(400).json({ message: 'Cannot deactivate the last active super admin.' });
      }
    }

    await user.update({ isActive: false });
    return res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
