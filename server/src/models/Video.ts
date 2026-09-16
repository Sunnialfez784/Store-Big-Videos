import { Schema, model, Document, Types } from 'mongoose';

export type VideoStatus = 'uploading' | 'ready' | 'failed';

export interface IVideo extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  originalName: string;
  storageKey: string;
  thumbnailKey?: string | null;
  size: number;            // declared at initiate, corrected from HeadObject on complete
  reservedBytes: number;   // amount currently held against the quota for this record
  mimeType: string;
  extension: string;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  status: VideoStatus;
  playable: boolean;       // can a browser <video> element decode this container?
  uploadId?: string | null;
  partSize: number;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const videoSchema = new Schema<IVideo>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: { type: String, required: true, trim: true, maxlength: 400 },
    storageKey: { type: String, required: true, unique: true },
    thumbnailKey: { type: String, default: null },
    size: { type: Number, required: true, min: 0 },
    reservedBytes: { type: Number, required: true, default: 0, min: 0 },
    mimeType: { type: String, required: true },
    extension: { type: String, required: true },
    durationSeconds: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    status: { type: String, enum: ['uploading', 'ready', 'failed'], default: 'uploading', index: true },
    playable: { type: Boolean, default: true },
    uploadId: { type: String, default: null },
    partSize: { type: Number, required: true },
    failureReason: { type: String, default: null },
  },
  { timestamps: true },
);

videoSchema.index({ user: 1, status: 1, createdAt: -1 });
videoSchema.index({ user: 1, originalName: 1 });

export const Video = model<IVideo>('Video', videoSchema);
