import { body } from 'express-validator';

export const createLeadValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').optional({ nullable: true, values: 'falsy' }).isEmail().withMessage('Email must be valid'),
  body('mobile').optional({ nullable: true, values: 'falsy' }).isString(),
  body('status').optional().isString(),
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
  body('products').optional().isArray().withMessage('products must be an array'),
  body('taxes').optional().isArray().withMessage('taxes must be an array'),
];

export const convertLeadValidation = [
  body('createDeal').optional().isBoolean(),
  body('createCompany').optional().isBoolean(),
  body('dealValue').optional().isFloat({ min: 0 }),
];
