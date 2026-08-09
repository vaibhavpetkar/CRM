'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Task 2.14 replaced the old status set ('new', 'contacted', 'qualified',
  // 'proposal', 'negotiation', 'won', 'lost') with a new fixed 7-value enum
  // ('new', 'contacted', 'working', 'qualified', 'unqualified', 'converted',
  // 'lost'), enforced at the API layer by leadValidation's `isIn(LEAD_STATUSES)`.
  //
  // Existing leads still holding a pre-migration status value would:
  //   - silently disappear from the Kanban board (leadsByStatus only buckets
  //     the 7 known values), and
  //   - fail with a 400 on the very next update, because the validator now
  //     rejects any status outside the new enum even when it's unchanged.
  //
  // This backfills old values onto their closest new equivalent so no lead
  // is left in a state the app can no longer represent.
  async up(queryInterface, Sequelize) {
    const map = {
      proposal: 'working',
      negotiation: 'working',
      won: 'converted',
    };

    for (const [oldStatus, newStatus] of Object.entries(map)) {
      await queryInterface.sequelize.query(
        'UPDATE leads SET status = :newStatus WHERE status = :oldStatus',
        { replacements: { newStatus, oldStatus } }
      );
    }

    // Safety net: anything still outside the new enum (a value this
    // migration doesn't know about) falls back to 'new' rather than being
    // left in a state the frontend can't render or validate against.
    const known = ['new', 'contacted', 'working', 'qualified', 'unqualified', 'converted', 'lost'];
    await queryInterface.sequelize.query(
      `UPDATE leads SET status = 'new' WHERE status NOT IN (:known)`,
      { replacements: { known } }
    );
  },

  // Not reversible — we don't know which leads were 'proposal' vs
  // 'negotiation' once merged into 'working', or which 'converted' leads
  // were originally 'won' vs something else.
  async down() {},
};
