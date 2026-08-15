// Central catalog of all permission strings recognized by `authorize()`.
// Keep this in sync with any `authorize('module:action')` calls in the routes.
// Frontend fetches this via GET /api/roles/permissions to render the role editor.

export interface PermissionDef {
  key: string; // e.g. "leads:create"
  module: string; // e.g. "leads"
  action: string; // e.g. "create"
  label: string; // human readable
}

const modules: { module: string; label: string; actions: { action: string; label: string }[] }[] = [
  {
    module: 'leads',
    label: 'Leads',
    actions: [
      { action: 'read', label: 'View leads' },
      { action: 'create', label: 'Create leads' },
      { action: 'update', label: 'Edit leads' },
      { action: 'delete', label: 'Delete leads' },
    ],
  },
  {
    module: 'deals',
    label: 'Deals',
    actions: [
      { action: 'read', label: 'View deals' },
      { action: 'create', label: 'Create deals' },
      { action: 'update', label: 'Edit deals' },
      { action: 'delete', label: 'Delete deals' },
    ],
  },
  {
    module: 'contacts',
    label: 'Contacts',
    actions: [
      { action: 'read', label: 'View contacts' },
      { action: 'create', label: 'Create contacts' },
      { action: 'update', label: 'Edit contacts' },
      { action: 'delete', label: 'Delete contacts' },
    ],
  },
  {
    module: 'users',
    label: 'Team members',
    actions: [
      { action: 'read', label: 'View team' },
      { action: 'invite', label: 'Invite team members' },
      { action: 'update', label: 'Edit team members' },
      { action: 'delete', label: 'Remove team members' },
    ],
  },
  {
    module: 'roles',
    label: 'Roles & permissions',
    actions: [
      { action: 'read', label: 'View roles' },
      { action: 'create', label: 'Create roles' },
      { action: 'update', label: 'Edit roles' },
      { action: 'delete', label: 'Delete roles' },
    ],
  },
  {
    module: 'quotes',
    label: 'Quotes',
    actions: [{ action: 'view', label: 'View & manage quotes' }],
  },
  {
    module: 'invoices',
    label: 'Invoices',
    actions: [{ action: 'view', label: 'View & manage invoices' }],
  },
  {
    module: 'meetings',
    label: 'Meetings',
    actions: [{ action: 'view', label: 'View & manage meetings' }],
  },
  {
    module: 'tasks',
    label: 'Tasks',
    actions: [{ action: 'view', label: 'View & manage tasks' }],
  },
  {
    module: 'marketing',
    label: 'Marketing (campaigns & templates)',
    actions: [{ action: 'view', label: 'View & manage marketing' }],
  },
  {
    module: 'reports',
    label: 'Reports & analytics',
    actions: [{ action: 'view', label: 'View reports' }],
  },
  {
    module: 'items',
    label: 'Items',
    actions: [
      { action: 'read', label: 'View items' },
      { action: 'create', label: 'Create items' },
      { action: 'update', label: 'Edit items' },
      { action: 'delete', label: 'Delete items' },
    ],
  },
  {
    module: 'item_categories',
    label: 'Item Categories',
    actions: [
      { action: 'read', label: 'View item categories' },
      { action: 'create', label: 'Create item categories' },
      { action: 'update', label: 'Edit item categories' },
      { action: 'delete', label: 'Delete item categories' },
    ],
  },
  {
    module: 'taxes',
    label: 'Tax Master',
    actions: [
      { action: 'read', label: 'View taxes' },
      { action: 'create', label: 'Create taxes' },
      { action: 'update', label: 'Edit taxes' },
      { action: 'delete', label: 'Delete taxes' },
    ],
  },
  {
    module: 'company',
    label: 'Company Settings',
    actions: [{ action: 'manage', label: 'Manage company settings (name, currency, etc.)' }],
  },
  {
    module: 'settings',
    label: 'System Settings',
    actions: [{ action: 'manage', label: 'Manage environment variables & system settings' }],
  },
  {
    module: 'integrations',
    label: 'Integrations',
    actions: [{ action: 'manage', label: 'Connect/disconnect third-party integrations' }],
  },
  {
    module: 'ai',
    label: 'AI Assistant',
    actions: [{ action: 'use', label: 'Generate AI summaries & suggestions (leads, deals, quotes)' }],
  },
];

export const PERMISSION_CATALOG: PermissionDef[] = modules.flatMap((m) =>
  m.actions.map((a) => ({
    key: `${m.module}:${a.action}`,
    module: m.module,
    action: a.action,
    label: a.label,
  }))
);

export const PERMISSION_GROUPS = modules.map((m) => ({
  module: m.module,
  label: m.label,
  permissions: m.actions.map((a) => ({ key: `${m.module}:${a.action}`, label: a.label })),
}));

export const DEFAULT_ROLES: { name: string; description: string; permissions: string[] }[] = [
  {
    name: 'Administrator',
    description: 'Full access to every module',
    permissions: ['*'],
  },
  {
    name: 'Sales Manager',
    description: 'Manage the sales team, leads, deals, contacts, and reports',
    permissions: [
      'leads:read', 'leads:create', 'leads:update', 'leads:delete',
      'deals:read', 'deals:create', 'deals:update', 'deals:delete',
      'contacts:read', 'contacts:create', 'contacts:update', 'contacts:delete',
      'quotes:view', 'invoices:view', 'tasks:view', 'meetings:view',
      'users:read',
      'reports:view',
      'items:read', 'items:create', 'items:update',
      'item_categories:read', 'item_categories:create', 'item_categories:update',
      'taxes:read', 'taxes:create', 'taxes:update',
      'ai:use',
    ],
  },
  {
    name: 'Sales Rep',
    description: 'Manage assigned leads, deals, and contacts',
    permissions: [
      'leads:read', 'leads:create', 'leads:update',
      'deals:read', 'deals:create', 'deals:update',
      'contacts:read', 'contacts:create', 'contacts:update',
      'quotes:view', 'tasks:view', 'meetings:view',
      'items:read', 'item_categories:read', 'taxes:read',
      'ai:use',
    ],
  },
  {
    name: 'Marketing Manager',
    description: 'Manage marketing campaigns, templates, and analytics',
    permissions: ['marketing:view', 'reports:view', 'contacts:read'],
  },
];
