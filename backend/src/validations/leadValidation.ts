import { body } from 'express-validator';

// Task 2.14: Lead Status is a fixed 7-value enum (also drives the Kanban columns
// and the "All Statuses" list filter on the frontend — keep these in sync with
// LEAD_STATUSES in frontend/app/(app)/leads/page.tsx if this list ever changes).
export const LEAD_STATUSES = ['new', 'contacted', 'working', 'qualified', 'unqualified', 'converted', 'lost'];

export const createLeadValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').optional({ nullable: true, values: 'falsy' }).isEmail().withMessage('Email must be valid'),
  body('mobile').trim().notEmpty().withMessage('Mobile Number is required'),
  body('status').optional().isIn(LEAD_STATUSES).withMessage(`status must be one of: ${LEAD_STATUSES.join(', ')}`),
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
  body('email').optional({ nullable: true, values: 'falsy' }).isEmail().withMessage('Email must be valid'),
  body('status').optional().isIn(LEAD_STATUSES).withMessage(`status must be one of: ${LEAD_STATUSES.join(', ')}`),
  body('products').optional().isArray().withMessage('products must be an array'),
  body('taxes').optional().isArray().withMessage('taxes must be an array'),
];

export const convertLeadValidation = [
  body('createDeal').optional().isBoolean(),
  body('createCompany').optional().isBoolean(),
  body('dealValue').optional().isFloat({ min: 0 }),
];
