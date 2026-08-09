'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Task 4.7: tasks get a Due Time alongside the existing Due Date.
  async up(queryInterface, Sequelize) {
    // Make migration idempotent by checking if column exists
    const tableDescription = await queryInterface.describeTable('tasks');
    
    if (!tableDescription.dueTime) {
      await queryInterface.addColumn('tasks', 'dueTime', {
        type: Sequelize.STRING(8), // "HH:MM" (24h), kept as a plain string like other time-only fields in this codebase
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tasks', 'dueTime');
  },
};
