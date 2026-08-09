'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Notifications — every bell-load and unread-count query filters by userId,
    // and the "unread only" filter hits isRead constantly.
    try { await queryInterface.addIndex('notifications', ['userId'], { name: 'idx_notifications_user_id' }); } catch (e) {}
    try { await queryInterface.addIndex('notifications', ['userId', 'isRead'], { name: 'idx_notifications_user_unread' }); } catch (e) {}

    // Leads — assignment and status filters are the most common list-view queries.
    try { await queryInterface.addIndex('leads', ['assignedToId'], { name: 'idx_leads_assigned_to_id' }); } catch (e) {}
    try { await queryInterface.addIndex('leads', ['leadOwnerId'], { name: 'idx_leads_lead_owner_id' }); } catch (e) {}
    try { await queryInterface.addIndex('leads', ['status'], { name: 'idx_leads_status' }); } catch (e) {}

    // Deals — pipeline view filters/groups by stage and owner constantly.
    try { await queryInterface.addIndex('deals', ['assignedToId'], { name: 'idx_deals_assigned_to_id' }); } catch (e) {}
    try { await queryInterface.addIndex('deals', ['stage'], { name: 'idx_deals_stage' }); } catch (e) {}

    // Tasks — "my tasks" and status-board views.
    try { await queryInterface.addIndex('tasks', ['assignedToId'], { name: 'idx_tasks_assigned_to_id' }); } catch (e) {}
    try { await queryInterface.addIndex('tasks', ['status'], { name: 'idx_tasks_status' }); } catch (e) {}

    // Activity log / timeline lookups are always "give me the timeline for entity X".
    try { await queryInterface.addIndex('activity_logs', ['entityType', 'entityId'], { name: 'idx_activity_logs_entity' }); } catch (e) {}
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('notifications', 'idx_notifications_user_id');
    await queryInterface.removeIndex('notifications', 'idx_notifications_user_unread');
    await queryInterface.removeIndex('leads', 'idx_leads_assigned_to_id');
    await queryInterface.removeIndex('leads', 'idx_leads_lead_owner_id');
    await queryInterface.removeIndex('leads', 'idx_leads_status');
    await queryInterface.removeIndex('deals', 'idx_deals_assigned_to_id');
    await queryInterface.removeIndex('deals', 'idx_deals_stage');
    await queryInterface.removeIndex('tasks', 'idx_tasks_assigned_to_id');
    await queryInterface.removeIndex('tasks', 'idx_tasks_status');
    await queryInterface.removeIndex('activity_logs', 'idx_activity_logs_entity');
  },
};
