import { Play, Download, Trash2, Film } from 'lucide-react';
import { VideoItem, videosApi } from '../lib/api';
import { formatBytes, formatDate, formatDuration } from '../lib/format';

interface VideoCardProps {
  video: VideoItem;
  onOpen: (video: VideoItem) => void;
  onDownload: (video: VideoItem) => void;
  onDelete: (video: VideoItem) => void;
}

export function VideoCard({ video, onOpen, onDownload, onDelete }: VideoCardProps) {
  return (
    <article className="surface group overflow-hidden rounded-card">
      <button
        onClick={() => onOpen(video)}
        className="relative block aspect-video w-full overflow-hidden bg-ink-900"
        aria-label={`Play ${video.originalName}`}
      >
        {video.hasThumbnail ? (
          <img
            src={videosApi.thumbnailUrl(video.id)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-ink-500">
            <Film size={30} />
          </span>
        )}

        <span className="absolute inset-0 grid place-items-center bg-ink-900/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-tungsten-500 text-ink-900">
            <Play size={19} fill="currentColor" />
          </span>
        </span>

        <span className="tnum absolute bottom-2 right-2 rounded bg-ink-900/85 px-1.5 py-0.5 text-xs text-mist-100">
          {formatDuration(video.durationSeconds)}
        </span>

        {!video.playable && (
          <span className="absolute left-2 top-2 rounded bg-ink-900/85 px-1.5 py-0.5 text-[11px] text-tungsten-400">
            Download to watch
          </span>
        )}
      </button>

      <div className="p-3">
        <h3 className="truncate font-medium" title={video.originalName}>
          {video.originalName}
        </h3>
        <p className="muted tnum mt-1 text-xs">
          {formatBytes(video.size)} · {video.resolution ?? `.${video.extension}`} · {formatDate(video.createdAt)}
        </p>

        <div className="mt-3 flex items-center gap-1">
          <button
            onClick={() => onOpen(video)}
            className="muted rounded-md p-1.5 hover:bg-mist-200 hover:text-ink-900 dark:hover:bg-ink-700 dark:hover:text-mist-50"
            aria-label={`Open ${video.originalName}`}
            title="Play"
          >
            <Play size={16} />
          </button>
          <button
            onClick={() => onDownload(video)}
            className="muted rounded-md p-1.5 hover:bg-mist-200 hover:text-ink-900 dark:hover:bg-ink-700 dark:hover:text-mist-50"
            aria-label={`Download ${video.originalName}`}
            title="Download"
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => onDelete(video)}
            className="muted ml-auto rounded-md p-1.5 hover:bg-alarm/10 hover:text-alarm"
            aria-label={`Delete ${video.originalName}`}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
