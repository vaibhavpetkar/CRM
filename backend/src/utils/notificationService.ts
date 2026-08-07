import Notification from '../models/Notification';
import User from '../models/User';
import logger from './logger';
import { sendGenericNotificationEmail } from './mailer';
import { emitToUser } from '../realtime/socket';

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

  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      entityType: entityType || null,
      entityId: entityId ?? null,
    });

    // Push it live to whichever tabs/devices this user has open right now.
    // The frontend uses this to animate the bell and pop a toast in real time,
    // instead of waiting for the next poll.
    emitToUser(userId, 'notification:new', notification.toJSON());
  } catch (error) {
    logger.error(`Failed to create in-app notification for user ${userId}: ${error}`);
  }

  if (sendEmail) {
    try {
      const user = await User.findByPk(userId);
      if (user?.email) {
        await sendGenericNotificationEmail(user.email, title, message);
      }
    } catch (error) {
      logger.error(`Failed to send notification email to user ${userId}: ${error}`);
    }
  }
};

export default notifyUser;
