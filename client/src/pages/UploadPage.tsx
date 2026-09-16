import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, File as FileIcon, X, RotateCcw, CheckCircle2, AlertTriangle, Ban,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useStorage } from '../context/StorageContext';
import { useToast } from '../context/ToastContext';
import { FileUpload, UploadProgress } from '../lib/uploader';
import { formatBytes, formatEta, formatSpeed } from '../lib/format';

const ACCEPTED_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi'];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',') + ',video/*';

interface QueueItem {
  id: string;
  file: File;
  upload: FileUpload | null;
  progress: UploadProgress;
  rejection?: string;
}

const idle = (file: File): UploadProgress => ({
  status: 'queued',
  loadedBytes: 0,
  totalBytes: file.size,
  percent: 0,
  bytesPerSecond: 0,
  etaSeconds: 0,
});

export function UploadPage() {
  const { snapshot, refresh, applySnapshot } = useStorage();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Warn before a refresh discards an upload in progress.
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [running]);

  const maxSingle = snapshot?.maxVideoBytes ?? 15 * 1024 ** 3;
  const available = snapshot?.availableBytes ?? 0;

  const pending = useMemo(
    () => queue.filter((item) => !item.rejection && ['queued', 'failed'].includes(item.progress.status)),
    [queue],
  );
  const selectedBytes = useMemo(
    () => queue.filter((i) => !i.rejection && i.progress.status !== 'done').reduce((sum, i) => sum + i.file.size, 0),
    [queue],
  );
  const overBudget = selectedBytes > available;

  const validate = useCallback(
    (file: File, alreadyQueued: number): string | undefined => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        return `.${ext || '?'} is not a supported format. Use MP4, MOV, WebM, MKV or AVI.`;
      }
      if (file.size === 0) return 'This file is empty.';
      if (file.size > maxSingle) {
        return `${formatBytes(file.size)} is over the ${formatBytes(maxSingle)} limit for one video.`;
      }
      if (alreadyQueued + file.size > available) {
        return `Not enough space left. Only ${formatBytes(available)} is free.`;
      }
      return undefined;
    },
    [maxSingle, available],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      setQueue((current) => {
        let queuedBytes = current
          .filter((i) => !i.rejection && i.progress.status !== 'done')
          .reduce((sum, i) => sum + i.file.size, 0);

        const additions: QueueItem[] = [];
        for (const file of Array.from(files)) {
          const duplicate = current.some(
            (i) => i.file.name === file.name && i.file.size === file.size && i.progress.status !== 'done',
          );
          if (duplicate) continue;

          const rejection = validate(file, queuedBytes);
          if (!rejection) queuedBytes += file.size;
          additions.push({
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            upload: null,
            progress: idle(file),
            rejection,
          });
        }
        return [...current, ...additions];
      });
    },
    [validate],
  );

  const updateProgress = useCallback((id: string, progress: UploadProgress) => {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, progress } : item)));
    if (progress.quota) applySnapshot(progress.quota);
  }, [applySnapshot]);

  const startAll = useCallback(async () => {
    const targets = queue.filter((i) => !i.rejection && ['queued', 'failed'].includes(i.progress.status));
    if (targets.length === 0) return;

    setRunning(true);
    // Files run one at a time so a single file gets the whole connection and
    // the backend quota check happens in a predictable order.
    for (const item of targets) {
      const upload = item.upload ?? new FileUpload(item.file, (p) => updateProgress(item.id, p));
      setQueue((current) => current.map((q) => (q.id === item.id ? { ...q, upload } : q)));
      if (upload.currentStatus === 'failed') await upload.retry();
      else await upload.start();

      if (upload.currentStatus === 'done') notify(`${item.file.name} uploaded.`, 'success');
      else if (upload.currentStatus === 'failed') notify(`${item.file.name} did not finish uploading.`, 'error');
    }
    setRunning(false);
    await refresh();
  }, [queue, updateProgress, refresh, notify]);

  const removeItem = useCallback(async (item: QueueItem) => {
    if (item.upload && ['uploading', 'preparing', 'finalising'].includes(item.progress.status)) {
      await item.upload.cancel();
      notify(`${item.file.name} cancelled.`, 'info');
    }
    setQueue((current) => current.filter((q) => q.id !== item.id));
  }, [notify]);

  const retryItem = useCallback(async (item: QueueItem) => {
    if (!item.upload) return;
    setRunning(true);
    await item.upload.retry();
    setRunning(false);
    await refresh();
  }, [refresh]);

  const doneCount = queue.filter((i) => i.progress.status === 'done').length;
  const overallPercent = useMemo(() => {
    const active = queue.filter((i) => !i.rejection);
    const total = active.reduce((sum, i) => sum + i.file.size, 0);
    if (!total) return 0;
    const loaded = active.reduce((sum, i) => sum + i.progress.loadedBytes, 0);
    return (loaded / total) * 100;
  }, [queue]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Upload video</h1>
        <p className="muted mt-1 text-sm">
          Up to {formatBytes(maxSingle)} per file. Large files upload in chunks straight to storage, so you can
          retry without starting over.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={`rounded-card border-2 border-dashed p-10 text-center transition-colors ${
          dragging
            ? 'border-tungsten-500 bg-tungsten-500/8'
            : 'border-mist-300 bg-mist-50 dark:border-ink-600 dark:bg-ink-800'
        }`}
      >
        <UploadCloud size={36} className="mx-auto text-tungsten-500" />
        <p className="mt-3 font-display text-base font-semibold">Drop video files here</p>
        <p className="muted mt-1 text-sm">MP4, MOV, WebM, MKV and AVI. Select several at once if you like.</p>
        <Button variant="secondary" className="mt-4" onClick={() => inputRef.current?.click()}>
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {queue.length > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold">
              Selected files <span className="muted tnum font-normal">({queue.length})</span>
            </h2>
            <p className="tnum muted text-sm">
              {formatBytes(selectedBytes)} selected · {formatBytes(available)} free
            </p>
          </div>

          {overBudget && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-alarm/35 bg-alarm/10 px-3 py-2 text-sm text-alarm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              These files need {formatBytes(selectedBytes)} but only {formatBytes(available)} is free. Remove
              something from the queue or delete a video first.
            </p>
          )}

          {running && (
            <div className="mt-4">
              <div className="tnum muted mb-1.5 flex justify-between text-xs">
                <span>Overall progress</span>
                <span>{overallPercent.toFixed(1)}%</span>
              </div>
              <ProgressBar percent={overallPercent} />
            </div>
          )}

          <ul className="mt-4 divide-y divide-mist-200 dark:divide-ink-700">
            {queue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                onRemove={() => removeItem(item)}
                onRetry={() => retryItem(item)}
                busy={running}
              />
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={startAll} loading={running} disabled={pending.length === 0 || overBudget}>
              {running ? 'Uploading' : `Upload ${pending.length || ''} ${pending.length === 1 ? 'file' : 'files'}`.trim()}
            </Button>
            {doneCount > 0 && !running && (
              <>
                <Button variant="secondary" onClick={() => setQueue((q) => q.filter((i) => i.progress.status !== 'done'))}>
                  Clear finished
                </Button>
                <Button variant="ghost" onClick={() => navigate('/videos')}>
                  Go to my videos
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {doneCount > 0 && !running && (
        <p className="flex items-center gap-2 text-sm text-signal">
          <CheckCircle2 size={16} />
          {doneCount} {doneCount === 1 ? 'video' : 'videos'} saved to your library.
        </p>
      )}

      {queue.length === 0 && snapshot && (
        <p className="muted tnum text-sm">
          {formatBytes(snapshot.availableBytes)} free of {formatBytes(snapshot.totalBytes)} ·{' '}
          {snapshot.videoCount} {snapshot.videoCount === 1 ? 'video' : 'videos'} stored
        </p>
      )}

      {running && <p className="muted text-xs">Keep this tab open until the queue finishes.</p>}
    </div>
  );
}

function QueueRow({
  item,
  onRemove,
  onRetry,
  busy,
}: {
  item: QueueItem;
  onRemove: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const { progress, rejection, file } = item;
  const active = ['preparing', 'uploading', 'finalising'].includes(progress.status);

  const statusLine = () => {
    if (rejection) return rejection;
    switch (progress.status) {
      case 'preparing':
        return 'Preparing upload session';
      case 'uploading':
        return `${formatBytes(progress.loadedBytes)} of ${formatBytes(progress.totalBytes)} · ${formatSpeed(progress.bytesPerSecond)} · ${formatEta(progress.etaSeconds)}`;
      case 'finalising':
        return 'Finishing up and reading video details';
      case 'done':
        return 'Uploaded';
      case 'failed':
        return progress.message ?? 'Upload failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return formatBytes(file.size);
    }
  };

  const tone =
    rejection || progress.status === 'failed'
      ? 'text-alarm'
      : progress.status === 'done'
        ? 'text-signal'
        : 'muted';

  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-0.5 shrink-0 ${tone}`}>
        {rejection || progress.status === 'failed' ? (
          <AlertTriangle size={17} />
        ) : progress.status === 'done' ? (
          <CheckCircle2 size={17} />
        ) : progress.status === 'cancelled' ? (
          <Ban size={17} />
        ) : (
          <FileIcon size={17} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
          {!rejection && progress.status !== 'queued' && (
            <span className="tnum muted shrink-0 text-xs">{progress.percent.toFixed(1)}%</span>
          )}
        </div>

        <p className={`tnum mt-0.5 truncate text-xs ${tone}`}>{statusLine()}</p>

        {active && <ProgressBar percent={progress.percent} className="mt-2" />}
        {progress.status === 'done' && <ProgressBar percent={100} tone="success" className="mt-2" />}
        {progress.status === 'failed' && <ProgressBar percent={progress.percent} tone="danger" className="mt-2" />}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {progress.status === 'failed' && (
          <button
            onClick={onRetry}
            disabled={busy}
            className="muted rounded p-1.5 hover:bg-mist-200 hover:text-ink-900 disabled:opacity-40 dark:hover:bg-ink-700 dark:hover:text-mist-50"
            aria-label={`Retry ${file.name}`}
            title="Retry"
          >
            <RotateCcw size={15} />
          </button>
        )}
        {progress.status !== 'done' && (
          <button
            onClick={onRemove}
            className="muted rounded p-1.5 hover:bg-alarm/10 hover:text-alarm"
            aria-label={active ? `Cancel ${file.name}` : `Remove ${file.name}`}
            title={active ? 'Cancel upload' : 'Remove from queue'}
          >
            <X size={15} />
          </button>
        )}
      </div>
    </li>
  );
}
