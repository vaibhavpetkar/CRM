'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('user_google_tasks_connections')) return; // idempotent

    await queryInterface.createTable('user_google_tasks_connections', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER.UNSIGNED },
      userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      // OAuth tokens — same plaintext-in-DB posture as the rest of this
      // project's credentials (see backend/.env.production.example); not
      // encrypted-at-rest. Flagged as a known simplification, not hidden.
      accessToken: { type: Sequelize.TEXT, allowNull: true },
      refreshToken: { type: Sequelize.TEXT, allowNull: true },
      tokenExpiresAt: { type: Sequelize.DATE, allowNull: true },
      isEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      lastSyncAt: { type: Sequelize.DATE, allowNull: true },
      lastError: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_google_tasks_connections');
  },
};
