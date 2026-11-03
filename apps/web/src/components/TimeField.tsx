import { Select } from './Select';

const NONE = 'none';
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});
const OPTIONS = [{ value: NONE, label: 'Any time' }, ...TIMES.map((t) => ({ value: t, label: t }))];

export interface TimeFieldProps {
  /** "HH:mm" (24h) or "" for any time. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  'aria-describedby'?: string;
}

/** 24h time in 15-minute steps (rules §1.7). Opens scrolled to the current value. */
export function TimeField({ value, onChange, id, ...aria }: TimeFieldProps) {
  const options = value && !TIMES.includes(value) ? [...OPTIONS, { value, label: value }] : OPTIONS;
  return (
    <Select
      id={id}
      {...aria}
      options={options}
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? '' : v)}
    />
  );
}
