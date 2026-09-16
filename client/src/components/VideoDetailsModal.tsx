import { Download, Trash2 } from 'lucide-react';
import { VideoItem } from '../lib/api';
import { formatBytes, formatDateTime, formatDuration, resolutionLabel } from '../lib/format';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { VideoPlayer } from './VideoPlayer';

interface Props {
  video: VideoItem | null;
  onClose: () => void;
  onDownload: (video: VideoItem) => void;
  onDelete: (video: VideoItem) => void;
}

export function VideoDetailsModal({ video, onClose, onDownload, onDelete }: Props) {
  if (!video) return null;

  const facts: [string, string][] = [
    ['File size', formatBytes(video.size)],
    ['Resolution', resolutionLabel(video.width, video.height)],
    ['Duration', formatDuration(video.durationSeconds)],
    ['Format', video.mimeType],
    ['Uploaded', formatDateTime(video.createdAt)],
  ];

  return (
    <Modal open={Boolean(video)} onClose={onClose} title={video.originalName} size="lg">
      <VideoPlayer video={video} onDownload={() => onDownload(video)} />

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="muted text-xs">{label}</dt>
            <dd className="tnum mt-0.5 truncate text-sm" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => onDownload(video)}>
          <Download size={16} /> Download
        </Button>
        <Button variant="danger" onClick={() => onDelete(video)}>
          <Trash2 size={16} /> Delete
        </Button>
      </div>
    </Modal>
  );
}
