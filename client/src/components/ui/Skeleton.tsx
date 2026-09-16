export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-mist-200 dark:bg-ink-700 ${className}`} />;
}

export function VideoCardSkeleton() {
  return (
    <div className="surface overflow-hidden rounded-card">
      <Skeleton className="aspect-video rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
