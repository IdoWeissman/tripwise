import * as RadixSelect from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon } from './Icons';
import { usePortalContainer } from './PortalContainer';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  options: SelectOption<T>[];
  /** Controlled value. `undefined` shows the placeholder. */
  value: T | undefined;
  onValueChange: (value: T) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** `md` = form field (44px), `sm` = inline control in rows/cards (40px tall, 44px touch area). */
  size?: 'md' | 'sm';
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Styled, accessible select (Radix): keyboard type-ahead, arrow keys, Esc, screen-reader labels.
 * Design rules §1.5 · Select.
 */
export function Select<T extends string>({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  id,
  disabled,
  size = 'md',
  className = '',
  ...aria
}: SelectProps<T>) {
  const container = usePortalContainer();
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        {...aria}
        className={`group flex items-center justify-between gap-2 rounded-control border border-border-input bg-surface pr-3 pl-3 text-left text-sm text-ink transition-colors hover:border-ink-muted data-[disabled]:cursor-not-allowed data-[disabled]:border-border data-[disabled]:bg-bg data-[disabled]:text-ink-secondary data-[placeholder]:text-ink-muted aria-[invalid=true]:border-negative data-[state=open]:border-accent ${
          size === 'md' ? 'h-11 w-full' : 'h-10 w-auto'
        } ${className}`}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className="flex shrink-0 text-ink-muted transition-transform group-data-[state=open]:rotate-180 group-data-[disabled]:opacity-50">
          <ChevronDownIcon size={16} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal container={container}>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] flex flex-col overflow-hidden rounded-card border border-border bg-surface text-ink shadow-popover"
        >
          <RadixSelect.Viewport className="max-h-[inherit] overflow-y-auto p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex min-h-10 cursor-pointer items-center rounded-control pr-9 pl-3 text-sm outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-muted data-[highlighted]:bg-surface-muted data-[state=checked]:font-semibold data-[state=checked]:text-accent-strong"
              >
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="absolute right-3 flex text-accent">
                  <CheckIcon size={16} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
