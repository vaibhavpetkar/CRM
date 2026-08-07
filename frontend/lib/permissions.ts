export type StoredUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  isSuperAdmin: boolean;
  role?: { id: number; name: string; permissions: string[] } | null;
} | null;

/**
 * Returns true if the given user is allowed to access a feature guarded by `permission`.
 * - Super admins and users whose role has the wildcard '*' permission can access everything.
 * - `permission` being undefined means the feature has no restriction (e.g. Dashboard).
 */
export function hasPermission(user: StoredUser, permission?: string): boolean {
  if (!permission) return true;
  if (!user) return false;
  if (user.isSuperAdmin) return true;

  const permissions = user.role?.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function hasAnyPermission(user: StoredUser, permissions: string[]): boolean {
  if (permissions.length === 0) return true;
  return permissions.some((p) => hasPermission(user, p));
}
