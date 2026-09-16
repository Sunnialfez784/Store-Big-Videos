import { Request, Response } from 'express';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { Video, IVideo } from '../models/Video';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/apiResponse';
import { formatBytes } from '../utils/format';
import { validateVideoFile, extensionOf } from '../services/videoTypes';
import * as storage from '../services/storage.service';
import * as quota from '../services/quota.service';

const MAX_PARTS = 10_000; // S3/R2 hard limit

/* ------------------------------------------------------------------ schemas */

export const initiateSchema = z.object({
  filename: z.string().min(1).max(400),
  size: z.number().int().positive(),
  mimeType: z.string().max(200).default(''),
});

export const partUrlsSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(MAX_PARTS)).min(1).max(50),
});

export const completeSchema = z.object({
  parts: z
    .array(z.object({ PartNumber: z.number().int().min(1).max(MAX_PARTS), ETag: z.string().min(1).max(200) }))
    .min(1)
    .max(MAX_PARTS),
  durationSeconds: z.number().positive().max(86_400).nullable().optional(),
  width: z.number().int().positive().max(16_000).nullable().optional(),
  height: z.number().int().positive().max(16_000).nullable().optional(),
  thumbnail: z.string().max(3_000_000).nullable().optional(), // base64 JPEG data URL
});

export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  search: z.string().max(200).optional(),
  sort: z
    .enum(['newest', 'oldest', 'largest', 'smallest', 'name_asc', 'name_desc'])
    .default('newest'),
});

/* ------------------------------------------------------------------ helpers */

const SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  largest: { size: -1 },
  smallest: { size: 1 },
  name_asc: { originalName: 1 },
  name_desc: { originalName: -1 },
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findOwnedVideo(id: string, userId: Types.ObjectId): Promise<IVideo> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound();
  const video = await Video.findById(id);
  if (!video) throw AppError.notFound();
  // Ownership check on every single access.
  if (!video.user.equals(userId)) throw AppError.forbidden();
  return video;
}

export function toPublicVideo(video: IVideo) {
  return {
    id: video._id.toString(),
    originalName: video.originalName,
    size: video.size,
    mimeType: video.mimeType,
    extension: video.extension,
    durationSeconds: video.durationSeconds ?? null,
    width: video.width ?? null,
    height: video.height ?? null,
    resolution: video.width && video.height ? `${video.width} x ${video.height}` : null,
    status: video.status,
    playable: video.playable,
    hasThumbnail: Boolean(video.thumbnailKey),
    createdAt: video.createdAt,
  };
}

/* ------------------------------------------------------- upload: initiate */

export async function initiateUpload(req: Request, res: Response) {
  const userId = req.userId!;
  const { filename, size, mimeType } = req.body as z.infer<typeof initiateSchema>;

  if (size > env.quota.maxVideoBytes) {
    throw AppError.payloadTooLarge(
      `"${filename}" is ${formatBytes(size)}. The limit for a single video is ${formatBytes(env.quota.maxVideoBytes)}.`,
    );
  }

  const { extension, mimeType: normalizedMime, playable } = validateVideoFile(filename, mimeType);

  const partSize = Math.max(env.quota.partSize, Math.ceil(size / MAX_PARTS));
  const partCount = Math.max(Math.ceil(size / partSize), 1);

  // Reserve first: if this throws, nothing has been created anywhere.
  await quota.reserve(userId, size);

  let uploadId: string | undefined;
  const storageKey = `videos/${userId.toString()}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;

  try {
    uploadId = await storage.createMultipartUpload(storageKey, normalizedMime);

    const video = await Video.create({
      user: userId,
      originalName: filename,
      storageKey,
      size,
      reservedBytes: size,
      mimeType: normalizedMime,
      extension,
      status: 'uploading',
      playable,
      uploadId,
      partSize,
    });

    return ok(
      res,
      {
        videoId: video._id.toString(),
        uploadId,
        partSize,
        partCount,
        uploadedParts: [],
        quota: await quota.getSnapshot(userId),
      },
      'Upload session ready.',
      201,
    );
  } catch (err) {
    // Roll back so a failed initiate never strands quota or an orphan upload.
    if (uploadId) await storage.abortMultipartUpload(storageKey, uploadId);
    await quota.release(userId, size);
    throw err;
  }
}

/* ------------------------------------------------ upload: resume + sign parts */

export async function resumeUpload(req: Request, res: Response) {
  const video = await findOwnedVideo(req.params.id, req.userId!);
  if (video.status !== 'uploading' || !video.uploadId) {
    throw AppError.conflict('That upload has already finished.');
  }
  const parts = await storage.listUploadedParts(video.storageKey, video.uploadId);
  return ok(
    res,
    {
      videoId: video._id.toString(),
      partSize: video.partSize,
      partCount: Math.max(Math.ceil(video.size / video.partSize), 1),
      uploadedParts: parts,
    },
    'Upload session resumed.',
  );
}

export async function signParts(req: Request, res: Response) {
  const video = await findOwnedVideo(req.params.id, req.userId!);
  if (video.status !== 'uploading' || !video.uploadId) {
    throw AppError.conflict('This upload is no longer open.');
  }
  const { partNumbers } = req.body as z.infer<typeof partUrlsSchema>;

  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await storage.signUploadPart(video.storageKey, video.uploadId!, partNumber),
    })),
  );

  return ok(res, { urls }, 'Signed upload URLs issued.');
}

/* ------------------------------------------------------- upload: complete */

export async function completeUpload(req: Request, res: Response) {
  const userId = req.userId!;
  const video = await findOwnedVideo(req.params.id, userId);
  const body = req.body as z.infer<typeof completeSchema>;

  // Completing twice must not double-count storage.
  if (video.status === 'ready') {
    return ok(res, { video: toPublicVideo(video), quota: await quota.getSnapshot(userId) }, 'Video already saved.');
  }
  if (!video.uploadId) throw AppError.conflict('This upload session is no longer valid.');

  await storage.completeMultipartUpload(video.storageKey, video.uploadId, body.parts);

  // Trust storage, not the client, for the real byte count.
  const { size: actualSize } = await storage.headObject(video.storageKey);

  if (actualSize > env.quota.maxVideoBytes) {
    await storage.deleteObject(video.storageKey);
    await quota.release(userId, video.reservedBytes);
    await Video.deleteOne({ _id: video._id });
    throw AppError.payloadTooLarge(
      `The stored file is ${formatBytes(actualSize)}, over the ${formatBytes(env.quota.maxVideoBytes)} single-video limit. It was removed.`,
    );
  }

  let thumbnailKey: string | null = null;
  if (body.thumbnail) {
    try {
      const base64 = body.thumbnail.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > 0 && buffer.length < 2 * 1024 * 1024) {
        thumbnailKey = `thumbs/${userId.toString()}/${video._id.toString()}.jpg`;
        await storage.putObject(thumbnailKey, buffer, 'image/jpeg');
      }
    } catch {
      thumbnailKey = null; // a missing poster frame is not worth failing the upload over
    }
  }

  const reserved = video.reservedBytes;

  video.size = actualSize;
  video.status = 'ready';
  video.uploadId = null;
  video.reservedBytes = 0;
  video.durationSeconds = body.durationSeconds ?? null;
  video.width = body.width ?? null;
  video.height = body.height ?? null;
  video.thumbnailKey = thumbnailKey;
  await video.save();

  await quota.commit(userId, reserved, actualSize);

  return ok(
    res,
    { video: toPublicVideo(video), quota: await quota.getSnapshot(userId) },
    'Video uploaded.',
    201,
  );
}

/* ---------------------------------------------------------- upload: abort */

export async function abortUpload(req: Request, res: Response) {
  const userId = req.userId!;
  const video = await findOwnedVideo(req.params.id, userId);

  if (video.status === 'ready') throw AppError.conflict('That upload already finished; delete the video instead.');

  if (video.uploadId) await storage.abortMultipartUpload(video.storageKey, video.uploadId);
  await Video.deleteOne({ _id: video._id });
  await quota.release(userId, video.reservedBytes);

  return ok(res, { quota: await quota.getSnapshot(userId) }, 'Upload cancelled.');
}

/* ------------------------------------------------------------------ list */

export async function listVideos(req: Request, res: Response) {
  const userId = req.userId!;
  const { page, limit, search, sort } = req.query as unknown as z.infer<typeof listSchema>;

  const filter: Record<string, unknown> = { user: userId, status: 'ready' };
  if (search?.trim()) filter.originalName = { $regex: escapeRegex(search.trim()), $options: 'i' };

  const [items, total] = await Promise.all([
    Video.find(filter)
      .sort(SORT_MAP[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IVideo[]>(),
    Video.countDocuments(filter),
  ]);

  return ok(
    res,
    {
      videos: items.map(toPublicVideo),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        hasMore: page * limit < total,
      },
    },
    'Videos loaded.',
  );
}

export async function getVideo(req: Request, res: Response) {
  const video = await findOwnedVideo(req.params.id, req.userId!);
  return ok(res, { video: toPublicVideo(video) }, 'Video loaded.');
}

/* ------------------------------------------------------- stream / download */

export async function streamVideo(req: Request, res: Response) {
  const video = await findOwnedVideo(req.params.id, req.userId!);
  if (video.status !== 'ready') throw AppError.conflict('This video is still uploading.');

  // Redirect to storage: it handles Range requests, so seeking in a 15 GB
  // file costs this server nothing.
  const url = await storage.signGetUrl(video.storageKey, { expiresIn: 300, mimeType: video.mimeType });

  if (req.query.redirect === 'false') return ok(res, { url, expiresIn: 300 }, 'Stream URL issued.');
  return res.redirect(302, url);
}

export async function downloadVideo(req: Request, res: Response) {
  const video = await findOwnedVideo(req.params.id, req.userId!);
  if (video.status !== 'ready') throw AppError.conflict('This video is still uploading.');

  const url = await storage.signGetUrl(video.storageKey, {
    expiresIn: 120,
    downloadFilename: video.originalName,
    mimeType: video.mimeType,
  });

  if (req.query.redirect === 'false') return ok(res, { url, expiresIn: 120 }, 'Download URL issued.');
  return res.redirect(302, url);
}

export async function getThumbnail(req: Request, res: Response) {
  const video = await findOwnedVideo(req.params.id, req.userId!);
  if (!video.thumbnailKey) throw AppError.notFound('This video has no thumbnail.');
  const url = await storage.signGetUrl(video.thumbnailKey, { expiresIn: 900, mimeType: 'image/jpeg' });
  return res.redirect(302, url);
}

/* ---------------------------------------------------------------- delete */

export async function deleteVideo(req: Request, res: Response) {
  const userId = req.userId!;
  const video = await findOwnedVideo(req.params.id, userId);

  const bytes = video.size;
  const wasReady = video.status === 'ready';

  // Remove the metadata first. If the object delete then fails, the row is
  // already gone, so nothing points at a file the user can no longer see; the
  // orphan is logged and cleaned up by the sweeper rather than leaving a
  // visible record with no file behind it.
  await Video.deleteOne({ _id: video._id });

  try {
    await storage.deleteObject(video.storageKey);
    if (video.thumbnailKey) await storage.deleteObject(video.thumbnailKey);
  } catch (err) {
    console.error('[delete] object left in storage, key=', video.storageKey, err);
  }

  if (wasReady) await quota.refund(userId, bytes);
  else await quota.release(userId, video.reservedBytes);

  return ok(res, { id: video._id.toString(), quota: await quota.getSnapshot(userId) }, 'Video deleted.');
}

/* ------------------------------------------------------------- dashboard */

export async function getStorage(req: Request, res: Response) {
  return ok(res, await quota.getSnapshot(req.userId!), 'Storage loaded.');
}

export async function getRecent(req: Request, res: Response) {
  const videos = await Video.find({ user: req.userId!, status: 'ready' })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean<IVideo[]>();
  return ok(res, { videos: videos.map(toPublicVideo) }, 'Recent videos loaded.');
}

export { extensionOf };
