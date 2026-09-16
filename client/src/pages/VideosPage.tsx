import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Film, UploadCloud, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { ApiError, Pagination, SortKey, VideoItem, videosApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { VideoCardSkeleton } from '../components/ui/Skeleton';
import { VideoCard } from '../components/VideoCard';
import { useVideoActions } from '../hooks/useVideoActions';

const PAGE_SIZE = 12;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'largest', label: 'Largest first' },
  { value: 'smallest', label: 'Smallest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
];

export function VideosPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Only one page of metadata is ever fetched, however large the library.
      const data = await videosApi.list({ page, limit: PAGE_SIZE, search: search || undefined, sort });
      setVideos(data.videos);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your videos.');
    } finally {
      setLoading(false);
    }
  }, [page, search, sort]);

  useEffect(() => { load(); }, [load]);

  const { open, download, confirmDelete, dialogs } = useVideoActions({
    onDeleted: () => {
      // Step back a page if the last item on it was removed.
      if (videos.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
    },
  });

  const rangeLabel = useMemo(() => {
    if (!pagination || pagination.total === 0) return '';
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);
    return `${from}–${to} of ${pagination.total}`;
  }, [pagination]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">My videos</h1>
          {rangeLabel && <p className="muted tnum mt-1 text-sm">Showing {rangeLabel}</p>}
        </div>
        <Button onClick={() => navigate('/upload')}>
          <UploadCloud size={16} /> Upload video
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by filename"
            aria-label="Search videos by filename"
            className="surface w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none focus:border-tungsten-500"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }}
          aria-label="Sort videos"
          className="surface rounded-lg px-3 py-2.5 text-sm outline-none focus:border-tungsten-500 sm:w-48"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {error ? (
        <EmptyState
          icon={<AlertTriangle size={34} />}
          title="Could not load your videos"
          description={error}
          action={<Button onClick={load}>Try again</Button>}
        />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState
          icon={<Film size={34} />}
          title={search ? `Nothing matches "${search}"` : 'Your library is empty'}
          description={
            search
              ? 'Try a shorter search, or clear it to see everything.'
              : 'Upload a video and it will show up here with a thumbnail, duration and size.'
          }
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearchInput('')}>Clear search</Button>
            ) : (
              <Button onClick={() => navigate('/upload')}><UploadCloud size={16} /> Upload video</Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} onOpen={open} onDownload={download} onDelete={confirmDelete} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pagination">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={15} /> Previous
              </Button>
              <span className="tnum muted px-2 text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={15} />
              </Button>
            </nav>
          )}
        </>
      )}

      {dialogs}
    </div>
  );
}
