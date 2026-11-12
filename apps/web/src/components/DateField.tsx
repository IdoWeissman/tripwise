import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { DayPicker, type ChevronProps } from 'react-day-picker';
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { usePortalContainer } from './PortalContainer';

/** "2027-05-14" ↔ local Date (no time-zone drift: dates are calendar days). */
const parse = (iso: string | undefined) => {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const LABEL = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function NavChevron({ orientation, className }: ChevronProps) {
  const Icon =
    orientation === 'left'
      ? ChevronLeftIcon
      : orientation === 'down'
        ? ChevronDownIcon
        : ChevronRightIcon;
  return <Icon size={18} className={className} />;
}

export interface DateFieldProps {
  /** ISO date "YYYY-MM-DD" or "". */
  value: string;
  onChange: (iso: string) => void;
  /** Earliest selectable ISO date. */
  min?: string;
  id?: string;
  placeholder?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Date picker: field-styled trigger + calendar popover (react-day-picker). Design rules §1.5 · Date field. */
export function DateField({
  value,
  onChange,
  min,
  id,
  placeholder = 'Select a date',
  ...aria
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const container = usePortalContainer();
  const selected = parse(value);
  const minDate = parse(min);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        {...aria}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-control border bg-surface pr-3 pl-3 text-left text-sm transition-colors hover:border-ink-muted aria-[invalid=true]:border-negative data-[state=open]:border-accent ${
          selected ? 'text-ink' : 'text-ink-muted'
        } border-border-input`}
      >
        <span className="min-w-0 truncate">{selected ? LABEL.format(selected) : placeholder}</span>
        <CalendarIcon size={16} className="shrink-0 text-ink-muted" />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] rounded-card border border-border bg-surface p-3 text-ink shadow-popover"
          // let DayPicker focus the selected day (or today) instead of the first button
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DayPicker
            mode="single"
            autoFocus
            required={false}
            selected={selected}
            defaultMonth={selected ?? minDate}
            disabled={minDate ? { before: minDate } : undefined}
            onSelect={(d) => {
              if (d) onChange(toIso(d));
              setOpen(false);
            }}
            weekStartsOn={0}
            components={{ Chevron: NavChevron }}
            classNames={{
              root: 'relative',
              months: 'flex',
              month: 'flex flex-col gap-2',
              month_caption: 'flex h-11 items-center px-2',
              caption_label: 'text-[15px] font-bold',
              nav: 'absolute top-0 right-0 flex gap-1',
              button_previous:
                'flex size-11 items-center justify-center rounded-control text-ink-secondary hover:bg-surface-muted disabled:opacity-40',
              button_next:
                'flex size-11 items-center justify-center rounded-control text-ink-secondary hover:bg-surface-muted disabled:opacity-40',
              chevron: '',
              month_grid: 'border-collapse',
              weekdays: '',
              weekday: 'size-11 text-xs font-semibold text-ink-muted',
              week: '',
              day: 'size-11 p-0 text-center',
              day_button:
                'size-11 rounded-control text-sm figures hover:bg-surface-muted disabled:cursor-not-allowed disabled:hover:bg-transparent',
              selected:
                '[&>button]:bg-sign [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-sign-raised',
              today:
                '[&>button]:font-bold [&>button]:underline [&>button]:decoration-2 [&>button]:underline-offset-4',
              disabled: '[&>button]:text-border-input',
              outside: '[&>button]:text-ink-muted',
            }}
          />
          <div className="mt-1 flex justify-between border-t border-surface-muted px-1 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="min-h-10 rounded-control px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-muted"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!!minDate && toIso(new Date()) < (min ?? '')}
              onClick={() => {
                onChange(toIso(new Date()));
                setOpen(false);
              }}
              className="min-h-10 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-tint disabled:opacity-40"
            >
              Today
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
