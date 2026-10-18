/**
 * The same rule authorize() applies, for checks that depend on the request
 * body or a loaded record and so can't run as route middleware.
 */
export const userHasPermission = (user: any, permission: string): boolean => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const role = user.role;
  if (!role) return false;
  if (role.name === permission) return true;
  let perms: string[] = [];
  try {
    perms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions || [];
  } catch {
    perms = [];
  }
  return perms.includes(permission) || perms.includes('*');
};
