import type { ReactNode } from 'react';
import { Avatar } from './Avatar';

export function LiveIndicator({
  online = true,
  label = 'Live',
  labelClassName = '',
}: {
  online?: boolean;
  label?: string;
  /** e.g. `sr-only` to keep only the dot on the narrowest phones */
  labelClassName?: string;
}) {
  // Always sits on the blue sign (rail or phone header).
  return (
    <span
      className={`flex items-center gap-2 text-[13px] font-semibold ${online ? 'text-white' : 'text-sign-ink-soft'}`}
    >
      <span className={`size-2 rounded-full ${online ? 'bg-live' : 'bg-sign-ink-soft'}`} />
      <span className={labelClassName}>{online ? label : 'Reconnecting…'}</span>
    </span>
  );
}

export function AvatarStack({
  people,
  max = 5,
  ringClassName = 'border-surface',
}: {
  people: { id: string; name: string; index: number }[];
  max?: number;
  ringClassName?: string;
}) {
  const shown = people.slice(0, max);
  return (
    <div className="flex pr-2">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} index={p.index} stacked ringClassName={ringClassName} />
      ))}
      {people.length > max && (
        <span
          className={`-mr-2 flex size-8 items-center justify-center rounded-full border-2 ${ringClassName} bg-surface-muted text-xs font-bold text-ink-secondary`}
        >
          +{people.length - max}
        </span>
      )}
    </div>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-white px-1.5 text-xs font-extrabold text-sign figures">
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
    positive: 'border-money bg-money text-white',
    negative: 'border-negative-ink bg-negative-ink text-white',
  }[tone];
  const valueColor = {
    default: 'text-ink',
    positive: 'text-white',
    negative: 'text-white',
  }[tone];
  return (
    <div className={`flex flex-col gap-1.5 rounded-card border p-5 ${styles}`}>
      <span
        className={`text-[13px] font-bold ${tone === 'default' ? 'text-ink-muted' : 'text-white/90'}`}
      >
        {label}
      </span>
      <span className={`figures text-2xl font-extrabold md:text-[32px] ${valueColor}`}>
        {value} {children}
      </span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  subtitleClassName = '',
  actions,
}: {
  title: string;
  subtitle?: string;
  /** e.g. `max-sm:hidden` to keep phones' first screen for content */
  subtitleClassName?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] md:text-[34px]">{title}</h1>
        {subtitle && <p className={`text-sm text-ink-muted ${subtitleClassName}`}>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
