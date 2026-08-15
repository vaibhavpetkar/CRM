'use strict';

/**
 * findOrCreate in seedDefaultRoles only sets permissions when a role is first
 * created, so existing deployments' Sales Manager / Sales Rep rows won't
 * pick up the new 'ai:use' permission on their own. This additively patches
 * just those two roles' existing permissions array — never touches any
 * other role, and skips a role entirely if it already has '*' (wildcard) or
 * already lists 'ai:use'.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, name, permissions FROM roles WHERE name IN ('Sales Manager', 'Sales Rep')`
    );

    for (const role of roles) {
      let permissions;
      try {
        permissions = JSON.parse(role.permissions || '[]');
      } catch {
        continue; // leave malformed data untouched rather than guessing
      }

      if (!Array.isArray(permissions) || permissions.includes('*') || permissions.includes('ai:use')) {
        continue;
      }

      permissions.push('ai:use');
      await queryInterface.sequelize.query(`UPDATE roles SET permissions = :permissions WHERE id = :id`, {
        replacements: { permissions: JSON.stringify(permissions), id: role.id },
      });
    }
  },

  async down(queryInterface) {
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, name, permissions FROM roles WHERE name IN ('Sales Manager', 'Sales Rep')`
    );

    for (const role of roles) {
      let permissions;
      try {
        permissions = JSON.parse(role.permissions || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(permissions)) continue;

      const next = permissions.filter((p) => p !== 'ai:use');
      if (next.length !== permissions.length) {
        await queryInterface.sequelize.query(`UPDATE roles SET permissions = :permissions WHERE id = :id`, {
          replacements: { permissions: JSON.stringify(next), id: role.id },
        });
      }
    }
  },
};
