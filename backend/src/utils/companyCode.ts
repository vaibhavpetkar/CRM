import { Op, col, fn, where } from 'sequelize';
import Company from '../models/Company';
import { runUnscoped } from '../tenancy/context';
import { TENANT_FIELD } from '../tenancy/scoping';

/**
 * Company codes identify a company at login (web and mobile), e.g. "inveon".
 * Lowercase letters, digits and dashes, 3-30 characters, unique across all
 * companies.
 */
export const COMPANY_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export const normalizeCompanyCode = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const slugifyCompanyName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '') || 'company';

const isTenant = where(col(TENANT_FIELD), Op.eq, col('id'));

/** The tenant company with this code, or null. */
export const findCompanyByCode = async (code: string): Promise<Company | null> => {
  const normalized = normalizeCompanyCode(code);
  if (!normalized) return null;
  return runUnscoped(() =>
    Company.findOne({ where: { [Op.and]: [isTenant, where(fn('lower', col('code')), normalized)] } })
  );
};

/** True when another tenant already uses this code. */
export const isCompanyCodeTaken = async (code: string, exceptCompanyId?: number): Promise<boolean> => {
  const existing = await findCompanyByCode(code);
  return !!existing && existing.id !== exceptCompanyId;
};

/** A free code based on the company name: "acme", then "acme-2", "acme-3"... */
export const generateCompanyCode = async (name: string): Promise<string> => {
  let base = slugifyCompanyName(name);
  if (base.length < 3) base = `${base}-co`;
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await isCompanyCodeTaken(candidate))) return candidate;
  }
};
