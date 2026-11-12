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

/** Muted track, selected segment white with a subtle shadow — design rules §1.5. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  kind = 'tabs',
  className = '',
}: SegmentedProps<T>) {
  const isTabs = kind === 'tabs';
  return (
    <div
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={`flex gap-1 rounded-card bg-surface-muted p-1 ${className}`}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
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
