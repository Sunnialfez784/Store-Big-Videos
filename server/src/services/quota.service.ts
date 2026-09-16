import { Types } from 'mongoose';
import { StorageAccount } from '../models/StorageAccount';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { formatBytes } from '../utils/format';

export interface QuotaSnapshot {
  totalBytes: number;
  usedBytes: number;
  reservedBytes: number;
  availableBytes: number;
  usedPercent: number;
  videoCount: number;
  maxVideoBytes: number;
}

export async function getAccount(userId: Types.ObjectId) {
  const existing = await StorageAccount.findOne({ user: userId });
  if (existing) return existing;
  // upsert keeps this safe if two requests race on first login
  return StorageAccount.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, usedBytes: 0, reservedBytes: 0, videoCount: 0 } },
    { upsert: true, new: true },
  );
}

export async function getSnapshot(userId: Types.ObjectId): Promise<QuotaSnapshot> {
  const account = await getAccount(userId);
  const used = account!.usedBytes;
  const reserved = account!.reservedBytes;
  const available = Math.max(env.quota.totalBytes - used - reserved, 0);
  return {
    totalBytes: env.quota.totalBytes,
    usedBytes: used,
    reservedBytes: reserved,
    availableBytes: available,
    usedPercent: Math.min((used + reserved) / env.quota.totalBytes, 1) * 100,
    videoCount: account!.videoCount,
    maxVideoBytes: env.quota.maxVideoBytes,
  };
}

/**
 * Atomically reserve `bytes`. The conditional update is evaluated by MongoDB
 * against the single account document, so two simultaneous uploads that would
 * together exceed the quota cannot both succeed.
 */
export async function reserve(userId: Types.ObjectId, bytes: number): Promise<void> {
  await getAccount(userId);
  const updated = await StorageAccount.findOneAndUpdate(
    {
      user: userId,
      $expr: { $lte: [{ $add: ['$usedBytes', '$reservedBytes', bytes] }, env.quota.totalBytes] },
    },
    { $inc: { reservedBytes: bytes } },
    { new: true },
  );

  if (!updated) {
    const snapshot = await getSnapshot(userId);
    throw AppError.payloadTooLarge(
      `Not enough space. This upload needs ${formatBytes(bytes)} but only ${formatBytes(snapshot.availableBytes)} is free.`,
    );
  }
}

/** Give back a reservation without committing it (cancel / failed upload). */
export async function release(userId: Types.ObjectId, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  await StorageAccount.updateOne({ user: userId }, [
    { $set: { reservedBytes: { $max: [{ $subtract: ['$reservedBytes', bytes] }, 0] } } },
  ]);
}

/** Convert a reservation into committed usage once the object really exists. */
export async function commit(userId: Types.ObjectId, reserved: number, actual: number): Promise<void> {
  await StorageAccount.updateOne({ user: userId }, [
    {
      $set: {
        reservedBytes: { $max: [{ $subtract: ['$reservedBytes', reserved] }, 0] },
        usedBytes: { $max: [{ $add: ['$usedBytes', actual] }, 0] },
        videoCount: { $add: ['$videoCount', 1] },
      },
    },
  ]);
}

/** Free committed usage after a delete. */
export async function refund(userId: Types.ObjectId, bytes: number): Promise<void> {
  await StorageAccount.updateOne({ user: userId }, [
    {
      $set: {
        usedBytes: { $max: [{ $subtract: ['$usedBytes', bytes] }, 0] },
        videoCount: { $max: [{ $subtract: ['$videoCount', 1] }, 0] },
      },
    },
  ]);
}
