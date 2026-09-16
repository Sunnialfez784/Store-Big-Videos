import { Video } from '../models/Video';
import { env } from '../config/env';
import * as storage from './storage.service';
import * as quota from './quota.service';

/**
 * Aborts multipart sessions that were abandoned (tab closed, machine slept)
 * and refunds the quota they were holding, so a dead upload cannot occupy
 * space forever.
 */
export async function sweepStaleUploads(): Promise<void> {
  const cutoff = new Date(Date.now() - env.uploadSessionTtlMs);
  const stale = await Video.find({ status: 'uploading', updatedAt: { $lt: cutoff } }).limit(50);

  for (const video of stale) {
    try {
      if (video.uploadId) await storage.abortMultipartUpload(video.storageKey, video.uploadId);
      await Video.deleteOne({ _id: video._id });
      await quota.release(video.user, video.reservedBytes);
      console.log('[sweeper] cleared stale upload', video._id.toString());
    } catch (err) {
      console.error('[sweeper] failed for', video._id.toString(), err);
    }
  }
}

export function startSweeper(): NodeJS.Timeout {
  sweepStaleUploads().catch(() => undefined);
  return setInterval(() => sweepStaleUploads().catch(() => undefined), 60 * 60 * 1000);
}
