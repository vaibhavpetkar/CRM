/**
 * Subscription plans a company can be on. Prices are monthly, in INR, and
 * only shown on the Subscription page for now: payment is collected outside
 * the app and the platform admin marks the company as paid.
 *
 * `sellable: false` plans are never offered for purchase: `trial` is what a
 * new signup starts on, `unlimited` is the platform owner's own company.
 */
export interface PlanDef {
  key: string;
  name: string;
  maxUsers: number | null; // null = unlimited
  priceMonthly: number | null;
  sellable: boolean;
}

export const PLANS: Record<string, PlanDef> = {
  trial: { key: 'trial', name: 'Free trial', maxUsers: 5, priceMonthly: 0, sellable: false },
  starter: { key: 'starter', name: 'Starter', maxUsers: 5, priceMonthly: 999, sellable: true },
  growth: { key: 'growth', name: 'Growth', maxUsers: 15, priceMonthly: 2499, sellable: true },
  business: { key: 'business', name: 'Business', maxUsers: 50, priceMonthly: 5999, sellable: true },
  unlimited: { key: 'unlimited', name: 'Unlimited', maxUsers: null, priceMonthly: null, sellable: false },
};

export const TRIAL_DAYS = 15;
// Days before the paid-until date when the "payment due" alert starts showing.
export const PAYMENT_ALERT_DAYS = 7;
// Days after the paid-until date the company keeps working with a "payment
// pending" alert before it is locked.
export const PAYMENT_GRACE_DAYS = 3;
// Length of a one-off extension the platform admin can grant.
export const TOPUP_DAYS = 10;
