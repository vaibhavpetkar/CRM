'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('activity_logs', 'changes', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addColumn('activity_logs', 'revertedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('activity_logs', 'changes');
    await queryInterface.removeColumn('activity_logs', 'revertedAt');
  },
};
