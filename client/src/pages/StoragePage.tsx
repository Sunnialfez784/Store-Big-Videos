import { HardDrive, Film, Database, Gauge } from 'lucide-react';
import { Card, StatCard } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { CapacityMeter } from '../components/CapacityMeter';
import { useStorage } from '../context/StorageContext';
import { formatBytes } from '../lib/format';

export function StoragePage() {
  const { snapshot, loading } = useStorage();

  if (loading || !snapshot) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const nearlyFull = snapshot.usedPercent >= 90;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Storage</h1>
        <p className="muted mt-1 text-sm">
          Every tick below is one gigabyte of your {formatBytes(snapshot.totalBytes)} quota.
        </p>
      </div>

      <Card className="p-5">
        <CapacityMeter snapshot={snapshot} />
        {snapshot.reservedBytes > 0 && (
          <p className="muted tnum mt-3 text-sm">
            {formatBytes(snapshot.reservedBytes)} is held for uploads that are still running. That space is released
            if an upload is cancelled.
          </p>
        )}
        {nearlyFull && (
          <p className="mt-3 rounded-lg border border-alarm/35 bg-alarm/10 px-3 py-2 text-sm text-alarm">
            Storage is nearly full. Delete a video to make room for the next upload.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total storage" value={formatBytes(snapshot.totalBytes)} icon={<Database size={18} />} />
        <StatCard label="Used" value={formatBytes(snapshot.usedBytes)} icon={<HardDrive size={18} />} accent />
        <StatCard label="Remaining" value={formatBytes(snapshot.availableBytes)} icon={<Gauge size={18} />} />
        <StatCard label="Videos stored" value={String(snapshot.videoCount)} icon={<Film size={18} />} />
      </div>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Limits</h2>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="muted">Largest single video</dt>
            <dd className="tnum">{formatBytes(snapshot.maxVideoBytes)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="muted">Total library quota</dt>
            <dd className="tnum">{formatBytes(snapshot.totalBytes)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="muted">Used so far</dt>
            <dd className="tnum">{snapshot.usedPercent.toFixed(2)}%</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
