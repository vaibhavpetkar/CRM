import { Request, Response } from 'express';
import Role from '../models/Role';
import User from '../models/User';
import { PERMISSION_GROUPS } from '../config/permissions';

const serializeRole = async (role: any) => {
  const plain = role.toJSON ? role.toJSON() : role;
  const userCount = await User.count({ where: { roleId: plain.id } });
  let permissions: string[] = [];
  try {
    permissions = JSON.parse(plain.permissions);
  } catch {
    permissions = [];
  }
  return { ...plain, permissions, users: userCount };
};

// GET /api/roles/permissions
// NOTE: this route must be registered before /:id in roleRoutes.ts, otherwise
// Express will match "permissions" as an :id param.
export const getPermissionCatalog = async (_req: Request, res: Response) => {
  try {
    return res.json({ groups: PERMISSION_GROUPS });
  } catch (error) {
    console.error('Get permission catalog error:', error);
    return res.status(500).json({ message: 'Server error while fetching permission catalog' });
  }
};

// GET /api/roles/:id
export const getRoleById = async (req: Request, res: Response) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    return res.json({ role: await serializeRole(role) });
  } catch (error) {
    console.error('Get role by id error:', error);
    return res.status(500).json({ message: 'Server error while fetching role' });
  }
};

// GET /api/roles
export const getRoles = async (_req: Request, res: Response) => {
  try {
    const roles = await Role.findAll({ order: [['id', 'ASC']] });
    const serialized = await Promise.all(roles.map(serializeRole));
    return res.json({ roles: serialized });
  } catch (error) {
    console.error('Get roles error:', error);
    return res.status(500).json({ message: 'Server error while fetching roles' });
  }
};

// POST /api/roles
export const createRole = async (req: Request, res: Response) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name) return res.status(400).json({ message: 'Role name is required' });

    const role = await Role.create({
      name,
      description: description || '',
      permissions: JSON.stringify(permissions || []),
      isActive: true,
    });

    return res.status(201).json({ message: 'Role created successfully', role: await serializeRole(role) });
  } catch (error: any) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'A role with this name already exists' });
    }
    console.error('Create role error:', error);
    return res.status(500).json({ message: 'Server error while creating role' });
  }
};

// PUT /api/roles/:id
export const updateRole = async (req: Request, res: Response) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const { name, description, permissions, isActive } = req.body;
    await role.update({
      name: name || role.name,
      description: description !== undefined ? description : role.description,
      permissions: permissions !== undefined ? JSON.stringify(permissions) : role.permissions,
      isActive: typeof isActive === 'boolean' ? isActive : role.isActive,
    });

    return res.json({ message: 'Role updated successfully', role: await serializeRole(role) });
  } catch (error) {
    console.error('Update role error:', error);
    return res.status(500).json({ message: 'Server error while updating role' });
  }
};

// DELETE /api/roles/:id
export const deleteRole = async (req: Request, res: Response) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const assignedCount = await User.count({ where: { roleId: role.id } });
    if (assignedCount > 0) {
      return res.status(400).json({ message: `Cannot delete role: ${assignedCount} user(s) are still assigned to it.` });
    }

    await role.destroy();
    return res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
