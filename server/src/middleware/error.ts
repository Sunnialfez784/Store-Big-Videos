import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { fail } from '../utils/apiResponse';
import { env } from '../config/env';

export function notFoundHandler(_req: Request, res: Response) {
  return fail(res, 404, 'That endpoint does not exist.');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return fail(res, err.status, err.message, err.details);
  }

  const e = err as { name?: string; code?: number; message?: string };

  if (e?.name === 'CastError') return fail(res, 400, 'That identifier is not valid.');
  if (e?.code === 11000) return fail(res, 409, 'That record already exists.');

  // Never leak internals to the client; the full trace goes to the server log.
  console.error('[error]', err);
  return fail(res, 500, 'Something went wrong on our side. Please try again.',
    env.isProd ? [] : [String(e?.message ?? err)]);
}

/** Wraps async handlers so rejected promises reach the error handler. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
