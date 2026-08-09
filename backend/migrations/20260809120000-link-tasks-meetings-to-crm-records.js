'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Tasks and Meetings previously only had a free-text label ("relatedTo" /
  // "client") for which lead/deal/contact they belonged to, with no real
  // relation. This adds proper FKs so they plug into the same
  // Lead -> Deal -> Quote -> Invoice chain the rest of the app uses.
  async up(queryInterface, Sequelize) {
    // Make migration idempotent by checking if columns exist
    const tasksDescription = await queryInterface.describeTable('tasks');
    const meetingsDescription = await queryInterface.describeTable('meetings');
    
    if (!tasksDescription.leadId) {
      await queryInterface.addColumn('tasks', 'leadId', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!tasksDescription.dealId) {
      await queryInterface.addColumn('tasks', 'dealId', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'deals', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!tasksDescription.contactId) {
      await queryInterface.addColumn('tasks', 'contactId', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!meetingsDescription.leadId) {
      await queryInterface.addColumn('meetings', 'leadId', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!meetingsDescription.dealId) {
      await queryInterface.addColumn('meetings', 'dealId', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'deals', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!meetingsDescription.contactId) {
      await queryInterface.addColumn('meetings', 'contactId', {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    // Add indexes if they don't exist (these may fail if indexes already exist, so we ignore errors)
    try { await queryInterface.addIndex('tasks', ['leadId']); } catch (e) {}
    try { await queryInterface.addIndex('tasks', ['dealId']); } catch (e) {}
    try { await queryInterface.addIndex('tasks', ['contactId']); } catch (e) {}
    try { await queryInterface.addIndex('meetings', ['leadId']); } catch (e) {}
    try { await queryInterface.addIndex('meetings', ['dealId']); } catch (e) {}
    try { await queryInterface.addIndex('meetings', ['contactId']); } catch (e) {}
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tasks', 'leadId');
    await queryInterface.removeColumn('tasks', 'dealId');
    await queryInterface.removeColumn('tasks', 'contactId');
    await queryInterface.removeColumn('meetings', 'leadId');
    await queryInterface.removeColumn('meetings', 'dealId');
    await queryInterface.removeColumn('meetings', 'contactId');
  },
};
