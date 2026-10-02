import { Op, col, where } from 'sequelize';
import Company from '../models/Company';
import Role from '../models/Role';
import User from '../models/User';
import { DEFAULT_ROLES } from '../config/permissions';
import { PLANS, TRIAL_DAYS } from '../config/plans';
import { runUnscoped, runWithTenant } from './context';
import { TENANT_FIELD } from './scoping';
import { generateCompanyCode } from '../utils/companyCode';

/** Makes sure a company has the built-in roles; returns them by name. */
export const seedRolesForCompany = async (companyId: number): Promise<Record<string, Role>> =>
  runWithTenant(companyId, async () => {
    const roles: Record<string, Role> = {};
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
      roles[roleDef.name] = role;
    }
    return roles;
  });

/** Every tenant company (customer "account" rows excluded). */
export const listTenantCompanies = async (): Promise<Company[]> =>
  runUnscoped(() => Company.findAll({ where: where(col(TENANT_FIELD), Op.eq, col('id')), order: [['id', 'ASC']] }));

/** Creates a new tenant company on a free trial, with its built-in roles. */
export const createTrialCompany = async (name: string, extra: Partial<Company> = {}) => {
  const code = extra.code || (await generateCompanyCode(name));
  const company = await runUnscoped(async () => {
    const created = await Company.create({ name, currency: 'INR', isActive: true, ...(extra as any) });
    await created.update({
      [TENANT_FIELD]: created.id,
      code,
      plan: 'trial',
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      maxUsers: PLANS.trial.maxUsers,
    } as any);
    return created;
  });
  const roles = await seedRolesForCompany(company.id);
  return { company, roles };
};

/**
 * Runs `fn` as the given user's company. For flows that arrive without a
 * login (Google OAuth callbacks) but carry a verified user id.
 */
export const runAsUser = async <T>(userId: number, fn: () => Promise<T>): Promise<T> => {
  const user = await runUnscoped(() => User.findByPk(userId, { attributes: ['id', 'companyId'] }));
  if (!user?.companyId) throw new Error('This connection link is no longer valid. Please try connecting again.');
  return runWithTenant(user.companyId, fn);
};
