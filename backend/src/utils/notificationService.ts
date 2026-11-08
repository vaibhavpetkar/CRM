import Notification from '../models/Notification';
import User from '../models/User';
import Role from '../models/Role';
import logger from './logger';
import { sendGenericNotificationEmail } from './mailer';
import { emitToUser } from '../realtime/socket';
import { Op } from 'sequelize';
import { currentCompanyId } from '../tenancy/context';

interface NotifyParams {
  userId: number | null | undefined;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  sendEmail?: boolean; // defaults to true
}

/**
 * Creates an in-app notification for a user and, unless disabled, also emails them.
 * Safe to call even if userId is missing (no-op) so callers don't need to guard.
 */
export const notifyUser = async ({
  userId,
  type,
  title,
  message,
  entityType,
  entityId,
  sendEmail = true,
}: NotifyParams): Promise<void> => {
  if (!userId) return;

  // The recipient's company goes on the row, so a notification made outside a
  // logged-in request (a poller, a webhook) still shows in that user's bell.
  let recipient: User | null = null;
  try {
    recipient = await User.findByPk(userId, { attributes: ['id', 'email', 'companyId'] });
  } catch {
    recipient = null;
  }

  try {
    const notification = await Notification.create({
      companyId: recipient?.companyId ?? null,
      userId,
      type,
      title,
      message,
      entityType: entityType || null,
      entityId: entityId ?? null,
    } as any);

    // Push it live to whichever tabs/devices this user has open right now.
    // The frontend uses this to animate the bell and pop a toast in real time,
    // instead of waiting for the next poll.
    emitToUser(userId, 'notification:new', notification.toJSON());
  } catch (error) {
    logger.error(`Failed to create in-app notification for user ${userId}: ${error}`);
  }

  if (sendEmail) {
    try {
      if (recipient?.email) {
        await sendGenericNotificationEmail(recipient.email, title, message);
      }
    } catch (error) {
      logger.error(`Failed to send notification email to user ${userId}: ${error}`);
    }
  }
};

/** Active users whose role has every permission ("*"): the people who see all leads. */
export const adminUserIds = async (): Promise<number[]> => {
  // Outside a company's context this would list every company's admins.
  if (currentCompanyId() == null) return [];
  const roles = await Role.findAll({ attributes: ['id', 'permissions'] });
  const adminRoleIds = roles
    .filter((r) => {
      try {
        const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions;
        return Array.isArray(perms) && perms.includes('*');
      } catch {
        return false;
      }
    })
    .map((r) => r.id);
  const where: any = { isActive: true };
  where[Op.or] = [{ isSuperAdmin: true }, ...(adminRoleIds.length ? [{ roleId: adminRoleIds }] : [])];
  const users = await User.findAll({ where, attributes: ['id'] });
  return users.map((u) => u.id);
};

/** "Rahul Patil", or the mobile number when the lead has no name. */
export const leadLabel = (lead: { firstName?: string | null; lastName?: string | null; mobile?: string | null; leadNumber?: string | null }) =>
  [lead.firstName, lead.lastName].map((v) => String(v ?? '').trim()).filter(Boolean).join(' ') ||
  String(lead.mobile ?? '').trim() ||
  String(lead.leadNumber ?? 'a lead');

interface LeadTeamParams {
  type: string;
  title: string;
  message: string;
  leadId?: number;
  /** People the lead belongs to (sales person, lead owner). They get "...to you" wording via `personalTitle`. */
  people?: (number | null | undefined)[];
  personalTitle?: string;
  personalMessage?: string;
  /** Whoever made the change; told too, so the Notifications page lists every lead event. */
  actorId?: number | null;
  /** Email the sales person (not admins). Off by default: these are in-app. */
  emailPeople?: boolean;
}

/**
 * One lead event (new lead, assigned, follow-up changed, import finished) told
 * to the lead's sales person / owner and to every admin, once each.
 * Never throws: a failed notification must not fail the lead change.
 */
export const notifyLeadTeam = async (p: LeadTeamParams): Promise<void> => {
  try {
    const people = new Set((p.people || []).filter((id): id is number => !!id).map(Number));
    const everyone = new Set<number>([...people, ...(await adminUserIds())]);
    if (p.actorId) everyone.add(Number(p.actorId));
    await Promise.all(
      [...everyone].map((userId) => {
        const personal = people.has(userId) && p.personalTitle;
        return notifyUser({
          userId,
          type: p.type,
          title: personal ? p.personalTitle! : p.title,
          message: personal ? p.personalMessage || p.message : p.message,
          entityType: p.leadId ? 'Lead' : undefined,
          entityId: p.leadId,
          sendEmail: !!(p.emailPeople && people.has(userId) && userId !== p.actorId),
        }).catch(() => undefined);
      })
    );
  } catch (error) {
    logger.error(`Failed to send lead notifications: ${error}`);
  }
};

export default notifyUser;
