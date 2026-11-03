import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { DateField, type DateFieldProps } from './DateField';
import { Select, type SelectProps } from './Select';
import { TimeField, type TimeFieldProps } from './TimeField';

const control =
  'w-full rounded-control border border-border-input bg-surface px-3 text-sm text-ink placeholder:text-ink-muted aria-[invalid=true]:border-negative';

interface FieldShellProps {
  label: string;
  error?: string | null;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} className="text-[13px] text-negative-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, className = '', ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${control} h-11 ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

interface SelectFieldProps<T extends string> extends Omit<SelectProps<T>, 'id'> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function SelectField<T extends string>({
  label,
  error,
  hint,
  ...rest
}: SelectFieldProps<T>) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

interface DateInputFieldProps extends Omit<DateFieldProps, 'id'> {
  label: string;
  error?: string | null;
}

export function DateInputField({ label, error, ...rest }: DateInputFieldProps) {
  return (
    <FieldShell label={label} error={error}>
      {(id, describedBy) => (
        <DateField
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

interface TimeInputFieldProps extends Omit<TimeFieldProps, 'id'> {
  label: string;
}

export function TimeInputField({ label, ...rest }: TimeInputFieldProps) {
  return (
    <FieldShell label={label}>
      {(id, describedBy) => <TimeField id={id} aria-describedby={describedBy} {...rest} />}
    </FieldShell>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string | null;
};

export function TextAreaField({ label, error, className = '', ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error}>
      {(id, describedBy) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          className={`${control} resize-y py-2.5 ${className}`}
          {...rest}
        />
      )}
    </FieldShell>
  );
}
