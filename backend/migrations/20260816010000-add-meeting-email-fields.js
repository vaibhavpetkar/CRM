'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const meetings = await queryInterface.describeTable('meetings');

    if (!meetings.customerEmail) {
      await queryInterface.addColumn('meetings', 'customerEmail', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }

    if (!meetings.ccEmails) {
      await queryInterface.addColumn('meetings', 'ccEmails', {
        type: Sequelize.TEXT, // JSON array of email strings
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('meetings', 'customerEmail');
    await queryInterface.removeColumn('meetings', 'ccEmails');
  },
};
