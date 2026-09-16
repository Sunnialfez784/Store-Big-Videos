import { api, ApiError, StorageSnapshot, VideoItem } from './api';
import { extractVideoMetadata, VideoMetadata } from './videoMeta';

export type UploadStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'finalising'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface UploadProgress {
  status: UploadStatus;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  bytesPerSecond: number;
  etaSeconds: number;
  message?: string;
  video?: VideoItem;
  quota?: StorageSnapshot;
}

const PARALLEL_PARTS = 4;      // concurrent part uploads per file
const MAX_PART_ATTEMPTS = 4;   // retries per part before the file fails
const URL_BATCH = 10;          // presigned URLs fetched per round trip

interface InitiateResponse {
  videoId: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  quota: StorageSnapshot;
}

/**
 * Uploads one file straight to object storage in parts. Nothing but small JSON
 * control messages reaches the application server, so a 15 GB file is never
 * buffered anywhere.
 */
export class FileUpload {
  readonly id: string;
  readonly file: File;

  private status: UploadStatus = 'queued';
  private videoId: string | null = null;
  private partSize = 0;
  private partCount = 0;
  private loadedPerPart = new Map<number, number>();
  private completedParts = new Map<number, string>();
  private inFlight = new Set<XMLHttpRequest>();
  private cancelled = false;
  private startedAt = 0;
  private smoothedSpeed = 0;
  private lastSample = { time: 0, loaded: 0 };
  private message?: string;
  private video?: VideoItem;
  private quota?: StorageSnapshot;

  constructor(file: File, private onChange: (p: UploadProgress) => void) {
    this.file = file;
    this.id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
  }

  get currentStatus(): UploadStatus {
    return this.status;
  }

  private get loadedBytes(): number {
    let sum = 0;
    for (const value of this.loadedPerPart.values()) sum += value;
    return Math.min(sum, this.file.size);
  }

  private emit(): void {
    const loaded = this.loadedBytes;
    const percent = this.file.size ? Math.min((loaded / this.file.size) * 100, 100) : 0;
    const remaining = Math.max(this.file.size - loaded, 0);
    this.onChange({
      status: this.status,
      loadedBytes: loaded,
      totalBytes: this.file.size,
      percent,
      bytesPerSecond: this.smoothedSpeed,
      etaSeconds: this.smoothedSpeed > 0 ? remaining / this.smoothedSpeed : 0,
      message: this.message,
      video: this.video,
      quota: this.quota,
    });
  }

  private sampleSpeed(): void {
    const now = performance.now();
    if (!this.lastSample.time) {
      this.lastSample = { time: now, loaded: this.loadedBytes };
      return;
    }
    const elapsed = (now - this.lastSample.time) / 1000;
    if (elapsed < 0.5) return;
    const delta = this.loadedBytes - this.lastSample.loaded;
    const instant = delta / elapsed;
    // Exponential moving average keeps the readout steady on a bumpy line.
    this.smoothedSpeed = this.smoothedSpeed ? this.smoothedSpeed * 0.7 + instant * 0.3 : instant;
    this.lastSample = { time: now, loaded: this.loadedBytes };
  }

  async start(): Promise<void> {
    if (this.cancelled) return;
    this.status = 'preparing';
    this.message = undefined;
    this.emit();

    try {
      // If a previous attempt already opened a session, resume it rather than
      // creating a second database record.
      if (!this.videoId) {
        const init = await api.post<InitiateResponse>('/videos/upload/initiate', {
          filename: this.file.name,
          size: this.file.size,
          mimeType: this.file.type || '',
        });
        this.videoId = init.videoId;
        this.partSize = init.partSize;
        this.partCount = init.partCount;
        this.quota = init.quota;
      } else {
        const resumed = await api.get<{ partSize: number; partCount: number; uploadedParts: { PartNumber: number; ETag: string; Size: number }[] }>(
          `/videos/${this.videoId}/upload/resume`,
        );
        this.partSize = resumed.partSize;
        this.partCount = resumed.partCount;
        for (const part of resumed.uploadedParts) {
          this.completedParts.set(part.PartNumber, part.ETag);
          this.loadedPerPart.set(part.PartNumber, part.Size);
        }
      }

      if (this.cancelled) return;

      this.status = 'uploading';
      this.startedAt = performance.now();
      this.emit();

      const pending = Array.from({ length: this.partCount }, (_, i) => i + 1).filter(
        (n) => !this.completedParts.has(n),
      );

      await this.uploadParts(pending);
      if (this.cancelled) return;

      this.status = 'finalising';
      this.emit();

      // Duration, resolution and a poster frame are read locally; containers a
      // browser cannot decode simply skip this and store null.
      let meta: VideoMetadata = { durationSeconds: null, width: null, height: null, thumbnail: null };
      try {
        meta = await extractVideoMetadata(this.file);
      } catch {
        /* metadata is a nice-to-have, never a reason to fail an upload */
      }

      const result = await api.post<{ video: VideoItem; quota: StorageSnapshot }>(
        `/videos/${this.videoId}/upload/complete`,
        {
          parts: Array.from(this.completedParts.entries())
            .map(([PartNumber, ETag]) => ({ PartNumber, ETag }))
            .sort((a, b) => a.PartNumber - b.PartNumber),
          durationSeconds: meta.durationSeconds,
          width: meta.width,
          height: meta.height,
          thumbnail: meta.thumbnail,
        },
      );

      this.video = result.video;
      this.quota = result.quota;
      this.status = 'done';
      this.message = undefined;
      this.emit();
    } catch (err) {
      if (this.cancelled) return;
      this.status = 'failed';
      this.message =
        err instanceof ApiError
          ? err.message
          : 'The upload stopped unexpectedly. Retry to continue from where it left off.';
      this.emit();
    }
  }

  /** Runs a fixed-size worker pool over the remaining part numbers. */
  private async uploadParts(partNumbers: number[]): Promise<void> {
    const queue = [...partNumbers];
    const workers = Array.from({ length: Math.min(PARALLEL_PARTS, queue.length) }, async () => {
      while (queue.length && !this.cancelled) {
        const batch = queue.splice(0, Math.min(URL_BATCH, queue.length));
        const { urls } = await api.post<{ urls: { partNumber: number; url: string }[] }>(
          `/videos/${this.videoId}/upload/parts`,
          { partNumbers: batch },
        );
        for (const { partNumber, url } of urls) {
          if (this.cancelled) return;
          await this.uploadSinglePart(partNumber, url);
        }
      }
    });
    await Promise.all(workers);
  }

  private async uploadSinglePart(partNumber: number, url: string): Promise<void> {
    const start = (partNumber - 1) * this.partSize;
    const blob = this.file.slice(start, Math.min(start + this.partSize, this.file.size));

    for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt += 1) {
      if (this.cancelled) return;
      try {
        const etag = await this.putBlob(url, blob, partNumber);
        this.completedParts.set(partNumber, etag);
        this.loadedPerPart.set(partNumber, blob.size);
        this.emit();
        return;
      } catch (err) {
        this.loadedPerPart.set(partNumber, 0);
        if (this.cancelled) return;
        if (attempt === MAX_PART_ATTEMPTS) throw err;
        // Back off, then retry the same part; nothing else needs re-sending.
        await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
      }
    }
  }

  private putBlob(url: string, blob: Blob, partNumber: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.inFlight.add(xhr);
      xhr.open('PUT', url, true);

      xhr.upload.onprogress = (event) => {
        this.loadedPerPart.set(partNumber, event.loaded);
        this.sampleSpeed();
        this.emit();
      };

      xhr.onload = () => {
        this.inFlight.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          // Requires ETag to be exposed by the bucket's CORS rules.
          const etag = xhr.getResponseHeader('ETag');
          if (!etag) return reject(new Error('Storage did not return an ETag for this chunk.'));
          resolve(etag.replace(/"/g, ''));
        } else {
          reject(new Error(`Chunk ${partNumber} rejected by storage (${xhr.status}).`));
        }
      };
      xhr.onerror = () => { this.inFlight.delete(xhr); reject(new Error('Network error while sending a chunk.')); };
      xhr.ontimeout = () => { this.inFlight.delete(xhr); reject(new Error('A chunk timed out.')); };
      xhr.onabort = () => { this.inFlight.delete(xhr); reject(new Error('Chunk cancelled.')); };

      xhr.send(blob);
    });
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    for (const xhr of this.inFlight) xhr.abort();
    this.inFlight.clear();

    if (this.videoId && this.status !== 'done') {
      try {
        const result = await api.post<{ quota: StorageSnapshot }>(`/videos/${this.videoId}/upload/abort`);
        this.quota = result.quota;
      } catch {
        /* the sweeper reclaims the session if this call does not land */
      }
    }
    this.videoId = null;
    this.status = 'cancelled';
    this.message = 'Upload cancelled.';
    this.emit();
  }

  /** Retry keeps the same session, so completed chunks are not re-sent. */
  async retry(): Promise<void> {
    if (this.status !== 'failed') return;
    this.cancelled = false;
    this.smoothedSpeed = 0;
    this.lastSample = { time: 0, loaded: this.loadedBytes };
    await this.start();
  }

  get elapsedSeconds(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }
}
