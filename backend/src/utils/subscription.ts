import Company from '../models/Company';
import User from '../models/User';
import { PLANS, PAYMENT_ALERT_DAYS, PAYMENT_GRACE_DAYS } from '../config/plans';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'blocked';

export interface SubscriptionState {
  plan: string;
  planName: string;
  status: SubscriptionStatus;
  endsAt: Date | null; // trial end or paid-until; null = no expiry
  daysLeft: number | null;
  lockedOn: Date | null; // when a past-due company gets locked
  locked: boolean;
  maxUsers: number | null;
  alert: { level: 'info' | 'warning' | 'danger'; message: string } | null;
}

const daysUntil = (date: Date, now: Date) => Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
const fmt = (date: Date) => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/**
 * Works out where a company stands: on trial, paid up, payment pending
 * (still working, inside the grace period), or locked (trial over, unpaid
 * past the grace period, or blocked by the platform admin).
 */
export const getSubscriptionState = (company: Company, now = new Date()): SubscriptionState => {
  const planKey = company.plan || 'unlimited';
  const plan = PLANS[planKey];
  const base = {
    plan: planKey,
    planName: plan?.name || planKey,
    maxUsers: company.maxUsers ?? plan?.maxUsers ?? null,
  };

  if (company.blockedAt) {
    return {
      ...base,
      status: 'blocked',
      endsAt: null,
      daysLeft: null,
      lockedOn: company.blockedAt,
      locked: true,
      alert: {
        level: 'danger',
        message: `Your company account is blocked${company.blockedReason ? `: ${company.blockedReason}` : ''}. Please contact support.`,
      },
    };
  }

  if (company.subscriptionStatus === 'trial') {
    const endsAt = company.trialEndsAt ? new Date(company.trialEndsAt) : now;
    const daysLeft = daysUntil(endsAt, now);
    if (daysLeft > 0) {
      return {
        ...base,
        status: 'trial',
        endsAt,
        daysLeft,
        lockedOn: endsAt,
        locked: false,
        alert: {
          level: daysLeft <= 3 ? 'warning' : 'info',
          message: `${plural(daysLeft)} left in your free trial. Choose a plan to keep using the CRM after ${fmt(endsAt)}.`,
        },
      };
    }
    return {
      ...base,
      status: 'expired',
      endsAt,
      daysLeft: 0,
      lockedOn: endsAt,
      locked: true,
      alert: { level: 'danger', message: `Your free trial ended on ${fmt(endsAt)}. Choose a plan to continue.` },
    };
  }

  if (company.subscriptionStatus === 'cancelled') {
    return {
      ...base,
      status: 'expired',
      endsAt: null,
      daysLeft: 0,
      lockedOn: null,
      locked: true,
      alert: { level: 'danger', message: 'Your subscription has been cancelled. Choose a plan to continue.' },
    };
  }

  // Active (or unset on an older company): paid until a date, or no expiry.
  if (!company.paidUntil) {
    return { ...base, status: 'active', endsAt: null, daysLeft: null, lockedOn: null, locked: false, alert: null };
  }

  const endsAt = new Date(company.paidUntil);
  const daysLeft = daysUntil(endsAt, now);
  const lockedOn = new Date(endsAt.getTime() + PAYMENT_GRACE_DAYS * DAY_MS);

  if (daysLeft > 0) {
    return {
      ...base,
      status: 'active',
      endsAt,
      daysLeft,
      lockedOn,
      locked: false,
      alert:
        daysLeft <= PAYMENT_ALERT_DAYS
          ? { level: 'warning', message: `Payment due in ${plural(daysLeft)} (${fmt(endsAt)}). Renew to avoid interruption.` }
          : null,
    };
  }

  if (now < lockedOn) {
    return {
      ...base,
      status: 'past_due',
      endsAt,
      daysLeft,
      lockedOn,
      locked: false,
      alert: {
        level: 'danger',
        message: `Payment pending since ${fmt(endsAt)}. Your account will be locked on ${fmt(lockedOn)} unless payment is received.`,
      },
    };
  }

  return {
    ...base,
    status: 'expired',
    endsAt,
    daysLeft,
    lockedOn,
    locked: true,
    alert: { level: 'danger', message: `Your subscription expired on ${fmt(endsAt)}. Renew to continue.` },
  };
};

/**
 * Null when the current company can add another active user, otherwise the
 * message to show. Must run inside the company's request context.
 */
export const seatLimitMessage = async (company: Company): Promise<string | null> => {
  const { maxUsers } = getSubscriptionState(company);
  if (maxUsers == null) return null;
  const activeUsers = await User.count({ where: { isActive: true } });
  if (activeUsers < maxUsers) return null;
  return `Your plan allows ${maxUsers} active users. Upgrade your plan or deactivate a user to add more.`;
};
