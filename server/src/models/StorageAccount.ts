import { Schema, model, Document, Types } from 'mongoose';

/**
 * One document per user. `usedBytes` counts finished videos, `reservedBytes`
 * counts uploads that are still in flight. Both are mutated with atomic
 * single-document updates so concurrent uploads can never overshoot the quota.
 */
export interface IStorageAccount extends Document {
  user: Types.ObjectId;
  usedBytes: number;
  reservedBytes: number;
  videoCount: number;
}

const storageAccountSchema = new Schema<IStorageAccount>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    usedBytes: { type: Number, required: true, default: 0, min: 0 },
    reservedBytes: { type: Number, required: true, default: 0, min: 0 },
    videoCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const StorageAccount = model<IStorageAccount>('StorageAccount', storageAccountSchema);
