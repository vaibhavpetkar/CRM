import { Response } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../middleware/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';
import User from '../models/User';
import Role from '../models/Role';
import { PLANS } from '../config/plans';
import { notifyUser } from '../utils/notificationService';
import { runUnscoped, runWithTenant } from '../tenancy/context';

const companyAdmins = () =>
  User.findAll({
    where: { isActive: true },
    include: [{ model: Role, as: 'role', where: { name: 'Administrator' }, required: true }],
    attributes: ['id'],
  });

/**
 * Tells the company's administrators once about each new payment alert
 * (payment due soon, payment pending, trial ending), in-app and by email,
 * on top of the banner every user sees.
 */
const notifyAdminsOfAlert = async (req: AuthRequest) => {
  const company = req.company!;
  const state = req.subscription!;
  if (!state.alert || state.alert.level === 'info') return;
  const key = `${state.status}:${state.endsAt ? state.endsAt.toISOString().slice(0, 10) : ''}`;
  if (company.lastAlertKey === key) return;
  await company.update({ lastAlertKey: key });
  const admins = await companyAdmins();
  await Promise.all(
    admins.map((admin) =>
      notifyUser({ userId: admin.id, type: 'subscription', title: 'Subscription alert', message: state.alert!.message })
    )
  );
};

/** GET /api/subscription: the company's plan, status, alert and seat usage. */
export const getSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const company = req.company!;
  const state = req.subscription!;
  await notifyAdminsOfAlert(req);
  const activeUsers = await User.count({ where: { isActive: true } });
  return res.json({
    company: { id: company.id, name: company.name },
    ...state,
    activeUsers,
    plans: Object.values(PLANS).filter((p) => p.sellable),
  });
});

/**
 * POST /api/subscription/request { plan }: a company asks to buy, renew or
 * upgrade. There is no payment gateway yet, so this alerts the platform
 * admin, who collects payment and activates the plan.
 */
export const requestPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const plan = PLANS[req.body?.plan];
  if (!plan || !plan.sellable) {
    return res.status(400).json({ message: `Choose one of: ${Object.values(PLANS).filter((p) => p.sellable).map((p) => p.key).join(', ')}` });
  }
  const company = req.company!;
  const requester = `${req.user.firstName} ${req.user.lastName} (${req.user.email})`;
  const message = `${company.name} (#${company.id}) requested the ${plan.name} plan. Requested by ${requester}.`;

  // Platform admins can sit in any company, so reach each one in their own.
  const platformAdmins = await runUnscoped(() =>
    User.findAll({ where: { isSuperAdmin: true, isActive: true, companyId: { [Op.ne]: null } }, attributes: ['id', 'companyId'] })
  );
  await Promise.all(
    platformAdmins.map((admin) =>
      runWithTenant(admin.companyId as number, () =>
        notifyUser({ userId: admin.id, type: 'subscription_request', title: 'Plan request', message })
      )
    )
  );

  return res.json({ message: `Thanks! We've received your request for the ${plan.name} plan and will contact you to complete payment.` });
});
