import { Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/apiResponse';
import { signToken, setAuthCookie, clearAuthCookie } from '../middleware/auth';
import * as quota from '../services/quota.service';

export const loginSchema = z.object({
  email: z.string().min(3).max(200).trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message either way so the endpoint cannot be used to discover accounts.
  if (!user || !(await user.verifyPassword(password))) {
    throw AppError.unauthorized('That email and password do not match.');
  }

  await quota.getAccount(user._id);
  setAuthCookie(res, signToken(user._id.toString()));

  return ok(res, { user: { id: user._id.toString(), email: user.email, name: user.name } }, 'Signed in.');
}

export async function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  return ok(res, null, 'Signed out.');
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.userId);
  if (!user) throw AppError.unauthorized();
  return ok(res, { user: { id: user._id.toString(), email: user.email, name: user.name } }, 'Session active.');
}
