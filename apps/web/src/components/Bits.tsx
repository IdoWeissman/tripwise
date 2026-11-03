import type { ReactNode } from 'react';
import { Avatar } from './Avatar';

export function LiveIndicator({
  online = true,
  label = 'Live',
}: {
  online?: boolean;
  label?: string;
}) {
  return (
    <span
      className={`flex items-center gap-2 text-[13px] font-semibold ${online ? 'text-accent-strong' : 'text-ink-muted'}`}
    >
      <span className={`size-2 rounded-full ${online ? 'bg-live' : 'bg-border-input'}`} />
      {online ? label : 'Reconnecting…'}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 5,
}: {
  people: { id: string; name: string; index: number }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  return (
    <div className="flex pr-2">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} index={p.index} stacked />
      ))}
      {people.length > max && (
        <span className="-mr-2 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-surface-muted text-xs font-bold text-ink-secondary">
          +{people.length - max}
        </span>
      )}
    </div>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-attention px-1.5 text-xs font-bold text-attention-ink">
      {count}
    </span>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone = 'default',
  children,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
  children?: ReactNode;
}) {
  const styles = {
    default: 'border-border bg-surface',
    positive: 'border-accent-tint-border bg-accent-tint',
    negative: 'border-attention bg-attention/40',
  }[tone];
  const valueColor = {
    default: 'text-ink',
    positive: 'text-accent-strong',
    negative: 'text-attention-ink',
  }[tone];
  return (
    <div className={`flex flex-col gap-1.5 rounded-[14px] border p-5 ${styles}`}>
      <span className="text-[13px] font-medium text-ink-muted">{label}</span>
      <span className={`text-xl font-bold tabular-nums md:text-[26px] ${valueColor}`}>
        {value} {children}
      </span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] md:text-[28px]">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
