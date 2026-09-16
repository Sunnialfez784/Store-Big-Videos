import { StorageSnapshot } from '../lib/api';
import { formatBytes } from '../lib/format';

const GB = 1024 ** 3;

/**
 * The quota shown literally: one tick per gigabyte. Filled ticks are stored
 * video, hatched ticks are uploads still in flight, empty ticks are free space.
 * Reading capacity by counting is more honest than a smooth bar when the whole
 * point is that there are exactly 42 of them.
 */
export function CapacityMeter({ snapshot, compact = false }: { snapshot: StorageSnapshot; compact?: boolean }) {
  const totalTicks = Math.max(Math.round(snapshot.totalBytes / GB), 1);
  const usedTicks = Math.round((snapshot.usedBytes / snapshot.totalBytes) * totalTicks);
  const reservedTicks = Math.ceil((snapshot.reservedBytes / snapshot.totalBytes) * totalTicks);
  const nearlyFull = snapshot.usedPercent >= 90;

  return (
    <div>
      <div
        className={`flex w-full items-end ${compact ? 'gap-[2px] h-6' : 'gap-[3px] h-14'}`}
        role="img"
        aria-label={`${formatBytes(snapshot.usedBytes)} of ${formatBytes(snapshot.totalBytes)} used`}
      >
        {Array.from({ length: totalTicks }, (_, i) => {
          const isUsed = i < usedTicks;
          const isReserved = !isUsed && i < usedTicks + reservedTicks;
          return (
            <span
              key={i}
              className={`flex-1 rounded-[2px] transition-colors duration-500 ${
                isUsed
                  ? nearlyFull
                    ? 'bg-alarm'
                    : 'bg-tungsten-500'
                  : isReserved
                    ? 'bg-tungsten-500/40'
                    : 'bg-mist-200 dark:bg-ink-700'
              }`}
              style={{ height: isUsed || isReserved ? '100%' : compact ? '55%' : '45%' }}
            />
          );
        })}
      </div>

      {!compact && (
        <div className="muted tnum mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="font-medium text-ink-900 dark:text-mist-50">{formatBytes(snapshot.usedBytes)}</span> of{' '}
            {formatBytes(snapshot.totalBytes)} used
          </span>
          <span>{formatBytes(snapshot.availableBytes)} free</span>
        </div>
      )}
    </div>
  );
}
