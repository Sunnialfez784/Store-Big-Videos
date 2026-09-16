export function ProgressBar({
  percent,
  tone = 'accent',
  className = '',
}: {
  percent: number;
  tone?: 'accent' | 'danger' | 'success';
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const fill = tone === 'danger' ? 'bg-alarm' : tone === 'success' ? 'bg-signal' : 'bg-tungsten-500';
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-mist-200 dark:bg-ink-700 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full transition-[width] duration-300 ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
