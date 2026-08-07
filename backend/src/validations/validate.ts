import { Request, Response, NextFunction } from 'express';
import { ValidationChain, validationResult } from 'express-validator';
import { ValidationError } from '../errors/AppError';

/**
 * Runs a set of express-validator chains, then converts any failures into
 * our typed ValidationError (422) so the central error handler produces a
 * consistent response shape. Usage:
 *
 *   router.post('/', protect, validate(createLeadValidation), controller.create);
 */
export const validate = (chains: ValidationChain[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    await Promise.all(chains.map((chain) => chain.run(req)));

    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const details = result.array().map((e) => ({
      field: e.type === 'field' ? e.path : undefined,
      message: e.msg,
    }));

    next(new ValidationError('Validation failed', details));
  };
};
