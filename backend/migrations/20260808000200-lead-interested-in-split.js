'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Task 2.9: "Interested In" splits into two distinct fields — Our Services vs
  // Our Products — instead of one free-text field. The old `interestedIn`
  // column is left in place (unused going forward) rather than dropped, so any
  // historical data isn't destroyed.
  async up(queryInterface, Sequelize) {
    // Make migration idempotent by checking if columns exist
    const tableDescription = await queryInterface.describeTable('leads');
    
    if (!tableDescription.interestedInServices) {
      await queryInterface.addColumn('leads', 'interestedInServices', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
    if (!tableDescription.interestedInProducts) {
      await queryInterface.addColumn('leads', 'interestedInProducts', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leads', 'interestedInServices');
    await queryInterface.removeColumn('leads', 'interestedInProducts');
  },
};
