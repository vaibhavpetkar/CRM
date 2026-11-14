import { body } from 'express-validator';
import { isStoredMobile, normalizeMobile } from '../utils/phoneCountry';

// Lead statuses a user can pick (keep in sync with LEAD_STATUS_OPTIONS in
// frontend/lib/lead-options.ts). 'new' is the starting status of every lead.
export const ACTIVE_LEAD_STATUSES = [
  'new',
  'cnr', 'call-busy', 'switch-off', 'call-later', 'not-interested', 'invalid-number', 'wrong-number',
  'whatsapp-done', 'details-shared', 'site-visit-done', 'revisit-done', 'ready-possession', 'budget-issue',
  'loan-problem', 'final-rate-given', 'booking-done', 'plan-dropped', 'plan-on-hold', 'postponed', 'nearing-possession',
];

// The earlier statuses are no longer offered, but leads saved with them stay
// valid, so editing one of those leads doesn't fail on its untouched status.
export const LEGACY_LEAD_STATUSES = ['contacted', 'working', 'qualified', 'unqualified', 'converted', 'lost'];

export const LEAD_STATUSES = [...ACTIVE_LEAD_STATUSES, ...LEGACY_LEAD_STATUSES];

// Statuses that mean the lead is closed as not going ahead (reports count these
// as lost; lead rotation skips them).
export const DEAD_LEAD_STATUSES = ['lost', 'unqualified', 'not-interested', 'invalid-number', 'wrong-number', 'plan-dropped'];
// Statuses that mean the buyer is engaged (reports count these as qualified).
export const ENGAGED_LEAD_STATUSES = ['qualified', 'converted', 'details-shared', 'site-visit-done', 'revisit-done', 'final-rate-given', 'booking-done'];

/** "+91 98765-43210", "098765 43210" or 9876543210 -> "9876543210"; anything else is left as typed for the error. */
export const normalizeIndianMobile = (value: unknown) => {
  if (value === undefined || value === null) return value;
  const raw = String(value).trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : raw;
};
// Mobile numbers: 10 digits = India; numbers from abroad keep their code.
const validMobile = (v: unknown) => isStoredMobile(v);
const MOBILE_HINT = 'must be 10 digits, or + and the country code (e.g. +971 50 123 4567)';

export const createLeadValidation = [
  // Names are optional: many sheets and walk-ins only have a mobile number.
  body('firstName').optional({ nullable: true }).isString().trim(),
  body('lastName').optional({ nullable: true }).isString().trim(),
  body('email').optional({ nullable: true, values: 'falsy' }).trim().isEmail().withMessage('Email must be valid').bail().toLowerCase(),
  body('mobile')
    .customSanitizer(normalizeMobile)
    .notEmpty().withMessage('Mobile Number is required')
    .bail()
    .custom(validMobile).withMessage(`Mobile number ${MOBILE_HINT}`),
  body('alternateMobile').optional({ nullable: true, values: 'falsy' }).customSanitizer(normalizeMobile).custom(validMobile).withMessage(`Alternate mobile ${MOBILE_HINT}`),
  body('status').optional().isIn(LEAD_STATUSES).withMessage(`status must be one of: ${ACTIVE_LEAD_STATUSES.join(', ')}`),
  body('leadSource').optional().isString(),
  body('products').optional().isArray().withMessage('products must be an array'),
  body('products.*.productName').if(body('products').exists()).notEmpty().withMessage('Each product row needs a productName'),
  body('products.*.quantity').optional().isFloat({ min: 0 }).withMessage('quantity must be a positive number'),
  body('products.*.expectedPrice').optional().isFloat({ min: 0 }).withMessage('expectedPrice must be a positive number'),
  body('taxes').optional().isArray().withMessage('taxes must be an array'),
  body('taxes.*.taxType').if(body('taxes').exists()).notEmpty().withMessage('Each tax row needs a taxType'),
  body('taxes.*.percentage').optional().isFloat({ min: 0, max: 100 }).withMessage('percentage must be between 0 and 100'),
];

export const updateLeadValidation = [
  body('email').optional({ nullable: true, values: 'falsy' }).trim().isEmail().withMessage('Email must be valid').bail().toLowerCase(),
  // Edits only tidy the format: older leads from portals may hold numbers that aren't 10 digits.
  body('mobile').optional({ nullable: true }).customSanitizer(normalizeMobile),
  body('alternateMobile').optional({ nullable: true }).customSanitizer(normalizeMobile),
  body('status').optional().isIn(LEAD_STATUSES).withMessage(`status must be one of: ${ACTIVE_LEAD_STATUSES.join(', ')}`),
  body('products').optional().isArray().withMessage('products must be an array'),
  body('taxes').optional().isArray().withMessage('taxes must be an array'),
];

export const convertLeadValidation = [
  body('createDeal').optional().isBoolean(),
  body('createCompany').optional().isBoolean(),
  body('dealValue').optional().isFloat({ min: 0 }),
];
