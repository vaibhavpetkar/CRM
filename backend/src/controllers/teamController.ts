import { Request, Response } from 'express';
import { Op } from 'sequelize';
import User from '../models/User';
import Role from '../models/Role';
import { AuthRequest } from '../middleware/authMiddleware';

// Serialize a user to the shape the frontend Team page expects
const serializeMember = (user: any) => {
  const plain = user.toJSON ? user.toJSON() : user;
  return {
    id: plain.id,
    name: `${plain.firstName} ${plain.lastName}`.trim(),
    firstName: plain.firstName,
    lastName: plain.lastName,
    email: plain.email,
    phone: plain.phone,
    department: plain.department || 'Unassigned',
    position: plain.position || null,
    role: plain.role ? plain.role.name : 'No role assigned',
    roleId: plain.roleId,
    status: plain.isActive ? 'active' : 'inactive',
    isActive: plain.isActive,
    isSuperAdmin: plain.isSuperAdmin,
    lastLogin: plain.lastLogin,
    createdAt: plain.createdAt,
  };
};

export const getTeamMembers = async (req: Request, res: Response) => {
  try {
    const { search, department, status, roleId } = req.query;

    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (department && department !== 'all') {
      whereClause.department = department;
    }

    if (status && status !== 'all') {
      whereClause.isActive = status === 'active';
    }

    if (roleId && roleId !== 'all') {
      whereClause.roleId = roleId;
    }

    const members = await User.findAll({
      where: whereClause,
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      members: members.map(serializeMember),
      total: members.length,
    });
  } catch (error) {
    console.error('Get team members error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getTeamStats = async (_req: Request, res: Response) => {
  try {
    const totalMembers = await User.count();
    const activeMembers = await User.count({ where: { isActive: true } });

    const byDepartment = await User.findAll({
      attributes: ['department', [User.sequelize!.fn('COUNT', User.sequelize!.col('id')), 'count']],
      group: ['department'],
    });

    return res.json({
      totalMembers,
      activeMembers,
      inactiveMembers: totalMembers - activeMembers,
      byDepartment: byDepartment.map((row: any) => ({
        // COUNT comes back as a string from Postgres; normalize to a number
        // and give the null bucket a friendly name.
        department: row.department || 'Unassigned',
        count: Number(row.get('count')) || 0,
      })),
    });
  } catch (error) {
    console.error('Get team stats error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getTeamMemberById = async (req: Request, res: Response) => {
  try {
    const member = await User.findByPk(req.params.id, {
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
    });

    if (!member) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    return res.json(serializeMember(member));
  } catch (error) {
    console.error('Get team member error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateTeamMember = async (req: AuthRequest, res: Response) => {
  try {
    const member = await User.findByPk(req.params.id);

    if (!member) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    const { firstName, lastName, phone, department, position, roleId, isActive } = req.body;

    // Prevent a non-super-admin from deactivating themselves or removing the only admin's access
    if (String(req.user?.id) === String(member.id) && isActive === false) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    // Protect super admins: only a super admin can change a super admin's role/status,
    // and never deactivate the last active super admin.
    if (member.isSuperAdmin) {
      if (String(req.user?.id) !== String(member.id) && !req.user?.isSuperAdmin) {
        return res.status(403).json({ message: 'Only a super admin can modify another super admin account.' });
      }
      if (isActive === false) {
        const activeSuperAdmins = await User.count({ where: { isSuperAdmin: true, isActive: true } });
        if (activeSuperAdmins <= 1) {
          return res.status(400).json({ message: 'Cannot deactivate the last active super admin.' });
        }
      }
    }

    const normalizedRoleId = roleId === '' ? null : roleId;
    if (normalizedRoleId !== undefined) {
      const roleExists = normalizedRoleId === null || (await Role.findByPk(normalizedRoleId));
      if (normalizedRoleId !== null && !roleExists) {
        return res.status(400).json({ message: 'Selected role does not exist.' });
      }
    }

    await member.update({
      firstName: firstName !== undefined ? firstName : member.firstName,
      lastName: lastName !== undefined ? lastName : member.lastName,
      phone: phone !== undefined ? phone : member.phone,
      department: department !== undefined ? department : member.department,
      position: position !== undefined ? position : member.position,
      roleId: normalizedRoleId !== undefined ? normalizedRoleId : member.roleId,
      isActive: isActive !== undefined ? isActive : member.isActive,
    });

    await member.reload({ include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }] });

    return res.json({
      message: 'Team member updated successfully',
      member: serializeMember(member),
    });
  } catch (error) {
    console.error('Update team member error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteTeamMember = async (req: AuthRequest, res: Response) => {
  try {
    const member = await User.findByPk(req.params.id);

    if (!member) {
      return res.status(404).json({ message: 'Team member not found' });
    }

    if (String(req.user?.id) === String(member.id)) {
      return res.status(400).json({ message: 'You cannot remove your own account.' });
    }

    if (member.isSuperAdmin) {
      return res.status(400).json({ message: 'The super admin account cannot be removed.' });
    }

    // Soft-delete: deactivate instead of destroying, to preserve historical
    // assignment/audit references on leads, deals, and contacts.
    await member.update({ isActive: false });

    return res.json({ message: 'Team member removed successfully' });
  } catch (error) {
    console.error('Delete team member error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
