'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER.UNSIGNED,
      },
      userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'general',
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      entityType: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      entityId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      isRead: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      readAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // Notification lists are always filtered/sorted by userId + createdAt
    // (see notificationController.getMyNotifications), so index that pattern.
    await queryInterface.addIndex('notifications', ['userId', 'createdAt']);
    await queryInterface.addIndex('notifications', ['userId', 'isRead']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
