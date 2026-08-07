import { body } from 'express-validator';

export const createQuoteValidation = [
  body('client').trim().notEmpty().withMessage('client is required'),
  body('discountType').optional().isIn(['percentage', 'flat']).withMessage('discountType must be percentage or flat'),
  body('discountValue').optional().isFloat({ min: 0 }).withMessage('discountValue must be a positive number'),
  body('shippingCharges').optional().isFloat({ min: 0 }).withMessage('shippingCharges must be a positive number'),
  body('products').optional().isArray(),
  body('products.*.productName').if(body('products').exists()).notEmpty().withMessage('Each product row needs a productName'),
  body('taxes').optional().isArray(),
  body('taxes.*.taxType').if(body('taxes').exists()).notEmpty().withMessage('Each tax row needs a taxType'),
];

export const updateQuoteValidation = [
  body('discountType').optional().isIn(['percentage', 'flat']),
  body('discountValue').optional().isFloat({ min: 0 }),
  body('shippingCharges').optional().isFloat({ min: 0 }),
  body('products').optional().isArray(),
  body('taxes').optional().isArray(),
];

export const sendEmailValidation = [body('email').optional().isEmail().withMessage('email must be valid')];
