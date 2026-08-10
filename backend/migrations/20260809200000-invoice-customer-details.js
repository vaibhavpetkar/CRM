'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make migration idempotent by checking if columns exist
    const tableDescription = await queryInterface.describeTable('invoices');
    
    if (!tableDescription.customerEmail) {
      await queryInterface.addColumn('invoices', 'customerEmail', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
    if (!tableDescription.customerPhone) {
      await queryInterface.addColumn('invoices', 'customerPhone', {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
    }
    if (!tableDescription.customerAddress) {
      await queryInterface.addColumn('invoices', 'customerAddress', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!tableDescription.companyAddress) {
      await queryInterface.addColumn('invoices', 'companyAddress', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'customerEmail');
    await queryInterface.removeColumn('invoices', 'customerPhone');
    await queryInterface.removeColumn('invoices', 'customerAddress');
    await queryInterface.removeColumn('invoices', 'companyAddress');
  },
};