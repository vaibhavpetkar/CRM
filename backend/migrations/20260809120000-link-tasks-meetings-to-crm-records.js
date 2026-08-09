'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Tasks and Meetings previously only had a free-text label ("relatedTo" /
  // "client") for which lead/deal/contact they belonged to, with no real
  // relation. This adds proper FKs so they plug into the same
  // Lead -> Deal -> Quote -> Invoice chain the rest of the app uses.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tasks', 'leadId', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('tasks', 'dealId', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'deals', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('tasks', 'contactId', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'contacts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('meetings', 'leadId', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('meetings', 'dealId', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'deals', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('meetings', 'contactId', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'contacts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('tasks', ['leadId']);
    await queryInterface.addIndex('tasks', ['dealId']);
    await queryInterface.addIndex('tasks', ['contactId']);
    await queryInterface.addIndex('meetings', ['leadId']);
    await queryInterface.addIndex('meetings', ['dealId']);
    await queryInterface.addIndex('meetings', ['contactId']);
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
