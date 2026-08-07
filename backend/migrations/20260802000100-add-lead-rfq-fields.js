'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leads', 'interestedIn', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('leads', 'timelineToPurchase', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    await queryInterface.addColumn('leads', 'qualifiedById', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('leads', 'meetingStatus', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leads', 'interestedIn');
    await queryInterface.removeColumn('leads', 'timelineToPurchase');
    await queryInterface.removeColumn('leads', 'qualifiedById');
    await queryInterface.removeColumn('leads', 'meetingStatus');
  },
};
