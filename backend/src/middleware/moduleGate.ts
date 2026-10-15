import { Request, Response, NextFunction } from 'express';

/**
 * Switched-off CRM modules. Their API answers 404 and features that would
 * create their records (lead → deal conversion, quote from lead, global
 * search results) skip them. No data is deleted, so a module comes back by
 * taking it out of DISABLED_MODULES.
 *
 * DISABLED_MODULES env: comma separated keys, or "none". Unset means all of
 * them are off, matching the frontend default (frontend/lib/modules.ts).
 */
export type ModuleKey = 'deals' | 'quotes' | 'tasks' | 'meetings' | 'invoices' | 'marketing' | 'inventory' | 'finance';

const ALL_MODULES: ModuleKey[] = ['deals', 'quotes', 'tasks', 'meetings', 'invoices', 'marketing', 'inventory', 'finance'];

const parseDisabled = (raw: string | undefined): ModuleKey[] =>
  raw === undefined
    ? ALL_MODULES
    : raw
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .filter((m): m is ModuleKey => (ALL_MODULES as string[]).includes(m));

export const DISABLED_MODULES = parseDisabled(process.env.DISABLED_MODULES);

export const isModuleEnabled = (key: ModuleKey) => !DISABLED_MODULES.includes(key);

/** API prefixes owned by each module. */
const MODULE_API_PREFIXES: Record<ModuleKey, string[]> = {
  deals: ['/api/deals'],
  quotes: ['/api/quotes'],
  tasks: ['/api/tasks', '/api/integrations/google-tasks'],
  meetings: ['/api/meetings', '/api/integrations/google-meet'],
  invoices: ['/api/invoices', '/api/payments'],
  marketing: ['/api/campaigns', '/api/templates'],
  inventory: ['/api/items', '/api/item-categories', '/api/taxes'],
  finance: ['/api/expenses'],
};

const blockedPrefixes = DISABLED_MODULES.flatMap((key) => MODULE_API_PREFIXES[key]);

/** Mount before the module routers: refuses requests to switched-off modules. */
export function moduleGate(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  if (blockedPrefixes.some((p) => path === p || path.startsWith(p + '/'))) {
    return res.status(404).json({ message: 'This module is turned off.' });
  }
  next();
}
