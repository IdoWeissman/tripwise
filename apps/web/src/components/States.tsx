import type { ReactNode } from 'react';
import { Button } from './Button';

/** Empty / error / loading blocks — design rules §1.8. */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border-[1.5px] border-dashed border-border-input px-6 py-10 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="text-sm text-ink-muted">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-attention bg-attention/40 px-5 py-4"
    >
      <p className="text-sm text-attention-ink">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-card bg-surface-muted ${className}`}
    />
  );
}
