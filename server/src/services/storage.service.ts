import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * Every supported provider (AWS S3, Cloudflare R2, MinIO, Backblaze B2,
 * Wasabi) speaks the S3 API, so one client covers all of them. Which one is
 * used is decided entirely by environment variables.
 */
export const s3 = new S3Client({
  region: env.storage.region,
  endpoint: env.storage.endpoint,
  forcePathStyle: env.storage.forcePathStyle,
  credentials: {
    accessKeyId: env.storage.accessKey,
    secretAccessKey: env.storage.secretKey,
  },
});

const BUCKET = env.storage.bucket;

function wrap(err: unknown, action: string): never {
  console.error(`[storage] ${action} failed:`, err);
  throw AppError.storage();
}

export async function createMultipartUpload(key: string, mimeType: string): Promise<string> {
  try {
    const res = await s3.send(
      new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: mimeType }),
    );
    if (!res.UploadId) throw new Error('no UploadId returned');
    return res.UploadId;
  } catch (err) {
    wrap(err, 'createMultipartUpload');
  }
}

export async function signUploadPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  try {
    return await getSignedUrl(
      s3,
      new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: 60 * 60 * 6 }, // a single part may take a while on a slow line
    );
  } catch (err) {
    wrap(err, 'signUploadPart');
  }
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<void> {
  try {
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
      }),
    );
  } catch (err) {
    wrap(err, 'completeMultipartUpload');
  }
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  try {
    await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
  } catch (err) {
    // Aborting is best-effort: the object may already be gone.
    console.warn('[storage] abortMultipartUpload:', (err as Error).message);
  }
}

/** Parts already stored, so an interrupted upload can resume instead of restarting. */
export async function listUploadedParts(key: string, uploadId: string) {
  try {
    const parts: { PartNumber: number; ETag: string; Size: number }[] = [];
    let marker: number | undefined;
    do {
      const res = await s3.send(
        new ListPartsCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumberMarker: marker?.toString() }),
      );
      for (const p of res.Parts ?? []) {
        if (p.PartNumber && p.ETag) parts.push({ PartNumber: p.PartNumber, ETag: p.ETag, Size: p.Size ?? 0 });
      }
      marker = res.IsTruncated ? Number(res.NextPartNumberMarker) : undefined;
    } while (marker);
    return parts;
  } catch (err) {
    return [];
  }
}

export async function headObject(key: string): Promise<{ size: number; mimeType?: string }> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { size: res.ContentLength ?? 0, mimeType: res.ContentType };
  } catch (err) {
    wrap(err, 'headObject');
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    wrap(err, 'deleteObject');
  }
}

export async function putObject(key: string, body: Buffer, mimeType: string): Promise<void> {
  try {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: mimeType }));
  } catch (err) {
    wrap(err, 'putObject');
  }
}

/**
 * Short-lived GET URL. Storage serves it directly, including HTTP range
 * requests, so seeking inside a 15 GB file never touches this server.
 */
export async function signGetUrl(
  key: string,
  opts: { expiresIn?: number; downloadFilename?: string; mimeType?: string } = {},
): Promise<string> {
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ResponseContentType: opts.mimeType,
        ResponseContentDisposition: opts.downloadFilename
          ? `attachment; filename="${sanitizeFilename(opts.downloadFilename)}"; filename*=UTF-8''${encodeURIComponent(opts.downloadFilename)}`
          : undefined,
      }),
      { expiresIn: opts.expiresIn ?? 300 },
    );
  } catch (err) {
    wrap(err, 'signGetUrl');
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, '_');
}
