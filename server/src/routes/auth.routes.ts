import { Router } from 'express';
import express from 'express';
import { login, logout, me, loginSchema } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { loginLimiter } from '../middleware/rateLimit';

const router = Router();

// JSON parsing is mounted per-route with a tiny cap. It is never applied
// globally, so no video bytes can ever reach a body parser.
const smallJson = express.json({ limit: '16kb' });

router.post('/login', loginLimiter, smallJson, validate(loginSchema), asyncHandler(login));
router.post('/logout', requireAuth, asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(me));

export default router;
