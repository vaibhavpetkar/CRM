import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request tenant (company) context.
 *
 * Every logged-in request runs inside `runWithTenant(user.companyId, ...)`
 * (see authMiddleware), and the model hooks in ./scoping.ts read the current
 * company from here to filter every query and stamp every insert. Code that
 * runs with no context (server boot, login, public endpoints) is unscoped,
 * so those paths must either use explicit `where` clauses or enter a tenant
 * themselves (e.g. the public quote link runs as the quote's company).
 */
interface TenantContext {
  companyId: number | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const runWithTenant = <T>(companyId: number, fn: () => T): T => storage.run({ companyId }, fn);

/** Runs `fn` with tenant filtering switched off, e.g. platform-admin work. */
export const runUnscoped = <T>(fn: () => T): T => storage.run({ companyId: null }, fn);

/** The company the current request belongs to, or null when unscoped. */
export const currentCompanyId = (): number | null => storage.getStore()?.companyId ?? null;
