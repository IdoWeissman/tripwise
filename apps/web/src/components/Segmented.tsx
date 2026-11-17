import { useRef, type KeyboardEvent } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** "tabs" for view filters, "radio" for form choices. */
  kind?: 'tabs' | 'radio';
  className?: string;
}

/**
 * Muted track, selected segment white with a subtle shadow — design rules §1.5. One tab stop:
 * the selected segment; arrow keys (and Home / End) move the choice, as tabs and radio groups do.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  kind = 'tabs',
  className = '',
}: SegmentedProps<T>) {
  const isTabs = kind === 'tabs';
  const track = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = options.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next]!.value);
    track.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };
  return (
    <div
      ref={track}
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={`flex gap-1 rounded-card bg-surface-muted p-1 ${className}`}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(o.value)}
            className={`min-h-11 flex-1 rounded-control px-3.5 text-sm whitespace-nowrap ${
              selected
                ? 'bg-surface font-semibold text-ink shadow-segment'
                : 'font-medium text-ink-secondary'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
