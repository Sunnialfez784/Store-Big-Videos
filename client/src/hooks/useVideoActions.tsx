import { useCallback, useState } from 'react';
import { ApiError, VideoItem, videosApi } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useStorage } from '../context/StorageContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { VideoDetailsModal } from '../components/VideoDetailsModal';

interface Options {
  onDeleted?: (id: string) => void;
}

/**
 * Play, download and delete behave identically on every page, so the handlers
 * and their two modals live here instead of being repeated.
 */
export function useVideoActions({ onDeleted }: Options = {}) {
  const { notify } = useToast();
  const { applySnapshot } = useStorage();

  const [active, setActive] = useState<VideoItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VideoItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const open = useCallback((video: VideoItem) => setActive(video), []);

  const download = useCallback(
    async (video: VideoItem) => {
      try {
        // A short-lived signed URL: the file travels storage to browser and
        // keeps its original filename.
        const { url } = await videosApi.downloadUrl(video.id);
        const link = document.createElement('a');
        link.href = url;
        link.download = video.originalName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        notify(`Downloading ${video.originalName}`, 'success');
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Download failed. Try again.', 'error');
      }
    },
    [notify],
  );

  const confirmDelete = useCallback((video: VideoItem) => setPendingDelete(video), []);

  const runDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await videosApi.remove(pendingDelete.id);
      applySnapshot(result.quota);
      onDeleted?.(pendingDelete.id);
      if (active?.id === pendingDelete.id) setActive(null);
      notify(`${pendingDelete.originalName} deleted.`, 'success');
      setPendingDelete(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed. Try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, applySnapshot, onDeleted, active, notify]);

  const dialogs = (
    <>
      <VideoDetailsModal
        video={active}
        onClose={() => setActive(null)}
        onDownload={download}
        onDelete={confirmDelete}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Are you sure you want to delete this video?"
        description={`${pendingDelete?.originalName ?? ''} will be removed from storage and cannot be recovered. The space it used becomes available again straight away.`}
        loading={deleting}
        onConfirm={runDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );

  return { open, download, confirmDelete, dialogs, activeVideo: active };
}
