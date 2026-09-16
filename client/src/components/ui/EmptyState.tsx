import { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center rounded-card px-6 py-14 text-center">
      <span className="text-tungsten-500">{icon}</span>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="muted mt-1 max-w-sm text-sm leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
