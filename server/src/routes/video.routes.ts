import { Router } from 'express';
import express from 'express';
import {
  initiateUpload, resumeUpload, signParts, completeUpload, abortUpload,
  listVideos, getVideo, streamVideo, downloadVideo, deleteVideo, getThumbnail, getRecent,
  initiateSchema, partUrlsSchema, completeSchema, listSchema,
} from '../controllers/video.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { uploadLimiter } from '../middleware/rateLimit';

const router = Router();

// Small bodies only. The thumbnail data URL is the largest thing accepted here.
const smallJson = express.json({ limit: '64kb' });
const thumbJson = express.json({ limit: '4mb' });

router.use(requireAuth);

router.get('/', validate(listSchema, 'query'), asyncHandler(listVideos));
router.get('/recent', asyncHandler(getRecent));

router.post('/upload/initiate', uploadLimiter, smallJson, validate(initiateSchema), asyncHandler(initiateUpload));
router.get('/:id/upload/resume', asyncHandler(resumeUpload));
router.post('/:id/upload/parts', smallJson, validate(partUrlsSchema), asyncHandler(signParts));
router.post('/:id/upload/complete', thumbJson, validate(completeSchema), asyncHandler(completeUpload));
router.post('/:id/upload/abort', asyncHandler(abortUpload));

router.get('/:id', asyncHandler(getVideo));
router.get('/:id/stream', asyncHandler(streamVideo));
router.get('/:id/download', asyncHandler(downloadVideo));
router.get('/:id/thumbnail', asyncHandler(getThumbnail));
router.delete('/:id', asyncHandler(deleteVideo));

export default router;
