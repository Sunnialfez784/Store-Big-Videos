export interface VideoMetadata {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  thumbnail: string | null;
}

const EMPTY: VideoMetadata = { durationSeconds: null, width: null, height: null, thumbnail: null };

/**
 * Reads duration and resolution locally and grabs a poster frame. Containers
 * the browser cannot decode (MKV, most AVI) resolve to nulls instead of
 * throwing, so those uploads still succeed with metadata left blank.
 */
export function extractVideoMetadata(file: File, timeoutMs = 15_000): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    if (!file.type || !document.createElement('video').canPlayType(file.type)) {
      // Give it one attempt anyway: canPlayType is conservative about .mov.
      if (!/\.(mp4|m4v|webm|mov)$/i.test(file.name)) return resolve(EMPTY);
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (result: VideoMetadata) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => finish(EMPTY), timeoutMs);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onerror = () => finish(EMPTY);

    video.onloadedmetadata = () => {
      const base: VideoMetadata = {
        durationSeconds: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        thumbnail: null,
      };

      const seekTo = base.durationSeconds ? Math.min(base.durationSeconds * 0.1, 3) : 0;
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = Math.min(640 / (video.videoWidth || 640), 1);
          canvas.width = Math.round((video.videoWidth || 640) * scale);
          canvas.height = Math.round((video.videoHeight || 360) * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return finish(base);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish({ ...base, thumbnail: canvas.toDataURL('image/jpeg', 0.72) });
        } catch {
          finish(base);
        }
      };

      try {
        video.currentTime = seekTo;
      } catch {
        finish(base);
      }
    };

    video.src = url;
  });
}
