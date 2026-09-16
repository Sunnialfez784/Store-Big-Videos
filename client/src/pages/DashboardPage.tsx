import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HardDrive, Database, Film, UploadCloud, CheckCircle2 } from 'lucide-react';
import { StatCard, Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { VideoCardSkeleton, Skeleton } from '../components/ui/Skeleton';
import { CapacityMeter } from '../components/CapacityMeter';
import { VideoCard } from '../components/VideoCard';
import { useStorage } from '../context/StorageContext';
import { useVideoActions } from '../hooks/useVideoActions';
import { VideoItem, videosApi } from '../lib/api';
import { formatBytes } from '../lib/format';

export function DashboardPage() {
  const { snapshot, loading } = useStorage();
  const navigate = useNavigate();
  const [recent, setRecent] = useState<VideoItem[] | null>(null);
  const { open, download, confirmDelete, dialogs } = useVideoActions({
    onDeleted: (id) => setRecent((list) => list?.filter((v) => v.id !== id) ?? null),
  });

  useEffect(() => {
    videosApi.recent().then((d) => setRecent(d.videos)).catch(() => setRecent([]));
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Your library at a glance</h1>
          <p className="muted mt-1 text-sm">Everything stored, with room left to fill.</p>
        </div>
        <Button onClick={() => navigate('/upload')}>
          <UploadCloud size={16} /> Upload video
        </Button>
      </div>

      {loading || !snapshot ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Capacity</h2>
              <p className="tnum muted text-sm">{snapshot.usedPercent.toFixed(1)}% full</p>
            </div>
            <CapacityMeter snapshot={snapshot} />
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total storage" value={formatBytes(snapshot.totalBytes)} icon={<Database size={18} />} />
            <StatCard
              label="Used"
              value={formatBytes(snapshot.usedBytes)}
              detail={`${snapshot.usedPercent.toFixed(1)}% of quota`}
              icon={<HardDrive size={18} />}
              accent
            />
            <StatCard
              label="Remaining"
              value={formatBytes(snapshot.availableBytes)}
              detail={
                snapshot.reservedBytes > 0 ? `${formatBytes(snapshot.reservedBytes)} held by uploads` : 'Ready for uploads'
              }
              icon={<CheckCircle2 size={18} />}
            />
            <StatCard label="Videos" value={String(snapshot.videoCount)} icon={<Film size={18} />} />
          </div>
        </>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Recently added</h2>
          <Link to="/videos" className="text-sm text-tungsten-600 hover:underline dark:text-tungsten-400">
            View all
          </Link>
        </div>

        {recent === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <VideoCardSkeleton key={i} />)}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<Film size={34} />}
            title="No videos yet"
            description="Upload your first file and it will appear here with its thumbnail, size and duration."
            action={<Button onClick={() => navigate('/upload')}><UploadCloud size={16} /> Upload video</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((video) => (
              <VideoCard key={video.id} video={video} onOpen={open} onDownload={download} onDelete={confirmDelete} />
            ))}
          </div>
        )}
      </section>

      {dialogs}
    </div>
  );
}
