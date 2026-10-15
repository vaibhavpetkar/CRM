/**
 * Modules switched off for this build of the CRM. A switched-off module is
 * hidden everywhere (sidebar, quick create, dashboard, reports, lead page)
 * and its pages redirect to the dashboard. The backend refuses its API too
 * (DISABLED_MODULES in backend/src/middleware/moduleGate.ts).
 *
 * To bring a module back, remove it from DISABLED_MODULES here and in the
 * backend's DISABLED_MODULES env var. Nothing in the database is deleted.
 * Deals, Pipeline, Quotes, Invoices, Contacts and Tax Master pages were
 * removed from the app entirely; bringing those back means restoring their
 * pages from git history.
 */
export type ModuleKey = 'deals' | 'quotes' | 'tasks' | 'meetings' | 'invoices' | 'marketing' | 'inventory' | 'finance' | 'contacts';

const ALL_MODULES: ModuleKey[] = ['deals', 'quotes', 'tasks', 'meetings', 'invoices', 'marketing', 'inventory', 'finance', 'contacts'];

// NEXT_PUBLIC_DISABLED_MODULES (comma separated, "none" for none) overrides the default.
const fromEnv = process.env.NEXT_PUBLIC_DISABLED_MODULES;
export const DISABLED_MODULES: ModuleKey[] =
  fromEnv === undefined
    ? ALL_MODULES
    : fromEnv
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .filter((m): m is ModuleKey => (ALL_MODULES as string[]).includes(m));

/** Page paths owned by each module. Pipeline is the deals board. */
const MODULE_PATHS: Record<ModuleKey, string[]> = {
  deals: ['/deals', '/pipeline'],
  quotes: ['/quotes'],
  tasks: ['/tasks'],
  meetings: ['/meetings'],
  invoices: ['/invoices'],
  marketing: ['/marketing'],
  inventory: ['/items'],
  finance: ['/expenses'],
  contacts: ['/contacts'],
};

export const isModuleEnabled = (key: ModuleKey) => !DISABLED_MODULES.includes(key);

/** True when `path` (no query string needed) belongs to a switched-off module. */
export function isPathDisabled(path: string): boolean {
  const pathname = path.split('?')[0];
  return DISABLED_MODULES.some((key) =>
    MODULE_PATHS[key].some((p) => pathname === p || pathname.startsWith(p + '/'))
  );
}
