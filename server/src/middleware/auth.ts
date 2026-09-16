import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { User } from '../models/User';

export const AUTH_COOKIE = 'vr_token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: Types.ObjectId;
      userEmail?: string;
    }
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    domain: env.cookieDomain,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    domain: env.cookieDomain,
    path: '/',
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = req.cookies?.[AUTH_COOKIE] ?? bearer;
    if (!token) throw AppError.unauthorized();

    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) throw AppError.unauthorized();

    const user = await User.findById(payload.sub).select('_id email');
    if (!user) throw AppError.unauthorized('Your session is no longer valid. Sign in again.');

    req.userId = user._id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(AppError.unauthorized('Your session has expired. Sign in again.'));
  }
}
