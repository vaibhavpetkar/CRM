'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make migration idempotent by checking if columns exist
    const tableDescription = await queryInterface.describeTable('activity_logs');
    
    if (!tableDescription.changes) {
      await queryInterface.addColumn('activity_logs', 'changes', {
        type: Sequelize.JSON,
        allowNull: true,
      });
    }
    if (!tableDescription.revertedAt) {
      await queryInterface.addColumn('activity_logs', 'revertedAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('activity_logs', 'changes');
    await queryInterface.removeColumn('activity_logs', 'revertedAt');
  },
};
