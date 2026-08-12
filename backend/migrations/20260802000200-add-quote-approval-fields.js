'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make migration idempotent by checking if columns exist (case-insensitive)
    const tableDescription = await queryInterface.describeTable('quotes');
    const columns = Object.keys(tableDescription).map(k => k.toLowerCase());

    if (!columns.includes('approvedat')) {
      await queryInterface.addColumn('quotes', 'approvedAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!columns.includes('approvedbyid')) {
      await queryInterface.addColumn('quotes', 'approvedById', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('quotes', 'approvedAt');
    await queryInterface.removeColumn('quotes', 'approvedById');
  },
};
