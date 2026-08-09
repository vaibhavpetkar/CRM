'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Task 2.2: Annual Turnover moves from a free numeric input to a fixed
  // dropdown of ranges (e.g. "₹1–5 Crores"), so the column needs to store a
  // label rather than a number. Existing numeric values are left as-is —
  // MySQL will read them back as their string representation until re-saved
  // via the new dropdown.
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('leads', 'annualRevenue', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('leads', 'annualRevenue', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
    });
  },
};
