'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make migration idempotent by checking if columns exist first, matching
    // the convention used by the other migrations in this project.
    const companies = await queryInterface.describeTable('companies');

    const socialColumns = ['whatsapp', 'instagram', 'facebook', 'linkedin', 'youtube', 'twitter'];
    for (const col of socialColumns) {
      if (!companies[col]) {
        await queryInterface.addColumn('companies', col, {
          type: Sequelize.STRING(255),
          allowNull: true,
        });
      }
    }

    if (!companies.quoteMessageTemplate) {
      await queryInterface.addColumn('companies', 'quoteMessageTemplate', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    const quotes = await queryInterface.describeTable('quotes');
    if (!quotes.publicToken) {
      await queryInterface.addColumn('quotes', 'publicToken', {
        type: Sequelize.STRING(64),
        allowNull: true,
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    const socialColumns = ['whatsapp', 'instagram', 'facebook', 'linkedin', 'youtube', 'twitter'];
    for (const col of socialColumns) {
      await queryInterface.removeColumn('companies', col);
    }
    await queryInterface.removeColumn('companies', 'quoteMessageTemplate');
    await queryInterface.removeColumn('quotes', 'publicToken');
  },
};
