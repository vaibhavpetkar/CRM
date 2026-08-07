import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationError as SequelizeValidationError, UniqueConstraintError, ForeignKeyConstraintError } from 'sequelize';
import { AppError } from '../errors/AppError';
import logger from './logger';

/**
 * Wraps an async controller/route handler so any rejected promise is routed
 * to Express's error-handling middleware instead of crashing the process or
 * hanging the request. Every controller in the layered modules uses this
 * instead of manual try/catch.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * Central error handler — must be registered last, after all routes.
 * Normalizes known error types (AppError subclasses, Sequelize validation/
 * constraint errors) into a consistent { message, details? } response shape,
 * and logs + masks anything unexpected as a 500.
 */
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });
    } else if (err.statusCode === 422) {
      logger.warn(`${req.method} ${req.originalUrl} - 422 ${err.message}: ${JSON.stringify(err.details)}`);
    }
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err instanceof UniqueConstraintError) {
    return res.status(409).json({
      message: 'A record with these details already exists',
      details: err.errors.map((e) => ({ field: e.path, message: e.message })),
    });
  }

  if (err instanceof ForeignKeyConstraintError) {
    return res.status(400).json({ message: 'Referenced record does not exist' });
  }

  if (err instanceof SequelizeValidationError) {
    const details = err.errors.map((e) => ({ field: e.path, message: e.message }));
    logger.warn(`${req.method} ${req.originalUrl} - 422 Sequelize validation failed: ${JSON.stringify(details)}`);
    return res.status(422).json({
      message: 'Validation failed',
      details,
    });
  }

  const error = err as Error;
  logger.error(`${req.method} ${req.originalUrl} - Unhandled error: ${error?.message}`, { stack: error?.stack });
  return res.status(500).json({ message: 'Internal server error' });
};
