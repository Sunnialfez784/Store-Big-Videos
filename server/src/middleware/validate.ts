import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/AppError';

type Source = 'body' | 'query' | 'params';

export function validate(schema: AnyZodObject, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'body') req.body = parsed;
      else Object.defineProperty(req, source, { value: parsed, writable: true });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => `${e.path.join('.') || 'value'}: ${e.message}`);
        return next(AppError.badRequest('Some of the details sent were not valid.', messages));
      }
      next(err);
    }
  };
}
