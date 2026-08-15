'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('integrations')) return; // idempotent

    await queryInterface.createTable('integrations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER.UNSIGNED,
      },
      // Stable key matching PROVIDER_CATALOG in integrationController.ts —
      // e.g. 'meta', 'google_business', 'linkedin', 'calendly', 'google_meet', 'mailchimp'.
      provider: {
        type: Sequelize.STRING(40),
        allowNull: false,
        unique: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'not_configured', // 'not_configured' | 'connected' | 'error' | 'disconnected'
      },
      isEnabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Non-secret configuration only (e.g. a selected Mailchimp audience id).
      // Access tokens/secrets are never stored here or sent to the frontend —
      // they belong in backend env vars, same as every other credential in
      // this project (see backend/.env.production.example).
      config: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      connectedById: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      connectedAt: { type: Sequelize.DATE, allowNull: true },
      lastSyncAt: { type: Sequelize.DATE, allowNull: true },
      lastError: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('integrations');
  },
};
