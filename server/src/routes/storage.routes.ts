import { Router } from 'express';
import { getStorage } from '../controllers/video.controller';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';

const router = Router();
router.get('/', requireAuth, asyncHandler(getStorage));
export default router;
