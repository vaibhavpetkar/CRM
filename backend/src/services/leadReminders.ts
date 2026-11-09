import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';
import logger from '../utils/logger';
import { runWithTenant } from '../tenancy/context';
import { listTenantCompanies } from '../tenancy/provisioning';
import { notifyLeadTeam, leadLabel } from '../utils/notificationService';

/**
 * Weekly nudge for Not Interested leads: a lead that has sat in Not Interested
 * for a week (no change and no reminder in 7 days) is brought back to the
 * team, so someone tries it again. Runs hourly; each lead is reminded at most
 * once a week. Touching the lead (a note, a status change) restarts its week.
 */
const STATUS = 'not-interested';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PER_LEAD_LIMIT = 5; // more than this at once -> one summary instead

type DueLead = { id: number; firstName: string | null; lastName: string | null; mobile: string | null; leadNumber: string | null; assignedToId: number | null };

export const remindNotInterested = async (companyId: number, now = new Date()): Promise<number> => {
  const due = await sequelize.query<DueLead>(
    `SELECT id, "firstName", "lastName", mobile, "leadNumber", "assignedToId"
       FROM leads
      WHERE "companyId" = :companyId AND status = :status AND "deletedAt" IS NULL
        AND GREATEST("updatedAt", COALESCE("reengageRemindedAt", "updatedAt")) <= :cutoff
      ORDER BY "updatedAt" ASC
      LIMIT 500`,
    { replacements: { companyId, status: STATUS, cutoff: new Date(now.getTime() - WEEK_MS) }, type: QueryTypes.SELECT }
  );
  if (!due.length) return 0;

  // Stamp first, without touching updatedAt, so a failed notice isn't repeated every hour.
  await sequelize.query(`UPDATE leads SET "reengageRemindedAt" = :now WHERE "companyId" = :companyId AND id IN (:ids)`, {
    replacements: { now, companyId, ids: due.map((l) => l.id) },
  });

  await runWithTenant(companyId, async () => {
    if (due.length <= PER_LEAD_LIMIT) {
      for (const lead of due) {
        const name = leadLabel(lead);
        await notifyLeadTeam({
          type: 'lead_reminder',
          title: 'Not Interested lead: try again',
          message: `${name} has been Not Interested for a week. Give them another call.`,
          leadId: lead.id,
          people: [lead.assignedToId],
          personalTitle: 'Your Not Interested lead: try again',
        });
      }
      return;
    }
    const names = due.slice(0, 5).map(leadLabel).join(', ');
    await notifyLeadTeam({
      type: 'lead_reminder',
      title: `${due.length} Not Interested leads to try again`,
      message: `${due.length} leads have been Not Interested for a week: ${names}${due.length > 5 ? ` and ${due.length - 5} more` : ''}. Filter Leads by Not Interested to call them again.`,
      people: [...new Set(due.map((l) => l.assignedToId))],
    });
  });
  return due.length;
};

let timer: NodeJS.Timeout | null = null;

export const startNotInterestedReminders = (everyMs = 60 * 60 * 1000) => {
  if (timer) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      for (const company of await listTenantCompanies()) {
        const n = await remindNotInterested(company.id).catch((err) => {
          logger.warn(`[reminders] Not Interested reminders for company #${company.id} failed: ${err}`);
          return 0;
        });
        if (n) logger.info(`[reminders] Reminded the team about ${n} Not Interested lead(s) in company #${company.id}.`);
      }
    } finally {
      running = false;
    }
  };
  timer = setInterval(run, everyMs);
  timer.unref?.();
  setTimeout(run, 60 * 1000).unref?.();
};
