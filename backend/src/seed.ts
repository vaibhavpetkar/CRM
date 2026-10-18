/**
 * Seed script — creates default roles and a hardcoded administrator account.
 * Safe to run multiple times (idempotent: skips anything that already exists).
 *
 * Usage: npm run seed:admin
 */
import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import sequelize from './config/database';
import User from './models/User';
import Role from './models/Role';
import { DEFAULT_ROLES } from './config/permissions';
import './models/Company';
import './models/Permission';
import './models/Contact';
import './models/Lead';
import './models/Deal';
import './models/Employee';
import './models/Task';
import './models/Meeting';
import './models/Quote';
import './models/Invoice';
import './models/Campaign';
import './models/Template';
import './models/associations';

// Local development keeps a known login. In production a missing
// SUPER_ADMIN_PASSWORD gets a random one, shown once below, never a shared default.
const DEFAULT_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@crmpro.com';
const GENERATED_ADMIN_PASSWORD = !process.env.SUPER_ADMIN_PASSWORD && process.env.NODE_ENV === 'production';
const DEFAULT_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD || (GENERATED_ADMIN_PASSWORD ? crypto.randomBytes(12).toString('base64url') : 'Admin@123456');

export const seedRoles = async () => {
  const createdRoles: Record<string, Role> = {};
  for (const roleDef of DEFAULT_ROLES) {
    const [role] = await Role.findOrCreate({
      where: { name: roleDef.name },
      defaults: {
        name: roleDef.name,
        description: roleDef.description,
        permissions: JSON.stringify(roleDef.permissions),
        isActive: true,
      },
    });
    createdRoles[roleDef.name] = role;
  }
  return createdRoles;
};

export const seedAdmin = async (adminRoleId?: number) => {
  const existing = await User.findOne({ where: { email: DEFAULT_ADMIN_EMAIL } });
  if (existing) {
    // Make sure the account stays a super admin & active even if it already existed.
    await existing.update({ isSuperAdmin: true, isActive: true, emailVerified: true, roleId: adminRoleId || existing.roleId });
    console.log(`ℹ️  Administrator already exists: ${DEFAULT_ADMIN_EMAIL} (left password unchanged).`);
    return existing;
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  const admin = await User.create({
    firstName: 'System',
    lastName: 'Administrator',
    email: DEFAULT_ADMIN_EMAIL,
    password: hashedPassword,
    isSuperAdmin: true,
    isActive: true,
    emailVerified: true,
    phoneVerified: true,
    roleId: adminRoleId || null,
  });

  console.log('✅ Administrator account created:');
  console.log(`   Email:    ${DEFAULT_ADMIN_EMAIL}`);
  if (!process.env.SUPER_ADMIN_PASSWORD) {
    console.log(`   Password: ${DEFAULT_ADMIN_PASSWORD}${GENERATED_ADMIN_PASSWORD ? '  (generated; change it after signing in)' : ''}`);
  } else {
    console.log('   Password: the SUPER_ADMIN_PASSWORD from your environment');
  }
  console.log('   ⚠️  Change this password immediately after first login (Settings → Change Password).');
  return admin;
};

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    const roles = await seedRoles();
    await seedAdmin(roles['Administrator']?.id);
    console.log('✅ Seed complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  run();
}
