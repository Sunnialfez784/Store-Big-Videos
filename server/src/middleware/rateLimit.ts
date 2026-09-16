import rateLimit from 'express-rate-limit';
import { fail } from '../utils/apiResponse';

const handler = (message: string) => (_req: any, res: any) => fail(res, 429, message);

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many sign-in attempts. Wait 15 minutes and try again.'),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many uploads started at once. Slow down a little.'),
});

// Presigning part URLs happens hundreds of times per large file, so this is loose.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many requests. Wait a moment and try again.'),
});
