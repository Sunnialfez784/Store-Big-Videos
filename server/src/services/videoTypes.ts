import { AppError } from '../utils/AppError';

interface FormatRule {
  ext: string;
  mime: string[];
  /** Can a mainstream browser <video> element play this container directly? */
  playable: boolean;
}

export const SUPPORTED_FORMATS: FormatRule[] = [
  { ext: 'mp4',  mime: ['video/mp4'], playable: true },
  { ext: 'm4v',  mime: ['video/x-m4v', 'video/mp4'], playable: true },
  { ext: 'webm', mime: ['video/webm'], playable: true },
  { ext: 'mov',  mime: ['video/quicktime'], playable: true },   // plays in Safari/Chrome when H.264
  { ext: 'mkv',  mime: ['video/x-matroska', 'video/matroska'], playable: false },
  { ext: 'avi',  mime: ['video/x-msvideo', 'video/avi', 'video/msvideo'], playable: false },
];

export function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
}

/**
 * Validates on the server by extension AND declared MIME type. The browser's
 * MIME sniffing is unreliable for MKV/AVI, so an empty or generic MIME type is
 * accepted when the extension is known, and normalised to the canonical value.
 */
export function validateVideoFile(filename: string, mimeType: string) {
  const ext = extensionOf(filename);
  const rule = SUPPORTED_FORMATS.find((f) => f.ext === ext);
  if (!rule) {
    throw AppError.unsupportedMedia(
      `${ext ? `.${ext}` : 'That file'} is not a supported video format. Use MP4, MOV, WebM, MKV or AVI.`,
    );
  }
  const declared = (mimeType || '').toLowerCase();
  const mimeOk = !declared || declared === 'application/octet-stream' || rule.mime.includes(declared);
  if (!mimeOk && !declared.startsWith('video/')) {
    throw AppError.unsupportedMedia(`The file type "${mimeType}" does not match a .${ext} video.`);
  }
  return { extension: ext, mimeType: rule.mime.includes(declared) ? declared : rule.mime[0], playable: rule.playable };
}

export const ACCEPTED_EXTENSIONS = SUPPORTED_FORMATS.map((f) => `.${f.ext}`);
