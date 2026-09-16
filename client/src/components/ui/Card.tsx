import { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`surface rounded-card ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="muted text-sm">{label}</p>
          <p
            className={`tnum mt-1 font-display text-2xl font-semibold ${accent ? 'text-tungsten-500' : ''}`}
          >
            {value}
          </p>
          {detail && <p className="muted tnum mt-1 text-xs">{detail}</p>}
        </div>
        {icon && <span className="muted shrink-0">{icon}</span>}
      </div>
    </Card>
  );
}
