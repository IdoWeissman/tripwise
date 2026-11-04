import { useId, type ReactNode } from 'react';
import { DateField } from '../../components/DateField';
import { CloseIcon, PlusIcon } from '../../components/Icons';
import { Select } from '../../components/Select';
import { TimeField } from '../../components/TimeField';
import { BOOKING_TYPE_ORDER, BOOKING_TYPES } from '../../lib/bookings';
import type { BookingFormState, LegState } from './formState';

const inputCls =
  'h-11 w-full rounded-control border border-border-input bg-surface px-3 text-sm text-ink placeholder:text-ink-muted aria-[invalid=true]:border-negative aria-[invalid=true]:bg-tint-orange';

function Field({
  label,
  badge,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  badge?: 'read' | 'missing' | null;
  error?: boolean;
  hint?: string;
  wide?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? 'col-span-2' : ''}`}>
      <span className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {badge === 'read' && (
          <span className="text-xs font-semibold text-accent-strong">Read from file</span>
        )}
        {badge === 'missing' && (
          <span className="text-xs font-semibold text-attention-ink">Not found</span>
        )}
      </span>
      {children(id)}
      {hint && (
        <span className={`text-[13px] ${error ? 'text-attention-ink' : 'text-ink-muted'}`}>
          {hint}
        </span>
      )}
    </div>
  );
}

const CURRENCIES = ['EUR', 'USD', 'GBP', 'ILS', 'CHF', 'JPY'].map((c) => ({ value: c, label: c }));

interface Props {
  value: BookingFormState;
  onChange: (next: BookingFormState) => void;
  /** Show "Read from file" / "Not found" badges. */
  showProvenance?: boolean;
  tripTimeZone: string;
}

export function BookingForm({ value: f, onChange, showProvenance = false, tripTimeZone }: Props) {
  const set = <K extends keyof BookingFormState>(k: K, v: BookingFormState[K]) =>
    onChange({ ...f, [k]: v });
  const badge = (...keys: string[]) =>
    showProvenance && keys.some((k) => f.fromSource.includes(k)) ? 'read' : null;
  const usesLegs = f.type === 'FLIGHT' || f.type === 'TRANSPORT';
  const showLegs = usesLegs && (f.legs.length > 0 || f.type === 'FLIGHT');
  const missingStart = !showLegs && !f.startDate;
  const isStay = f.type === 'STAY';
  const startLabel = isStay ? 'Check-in' : 'Starts';
  const endLabel = isStay ? 'Check-out' : 'Ends';
  const setLeg = (i: number, patch: Partial<LegState>) =>
    set(
      'legs',
      f.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    );
  const emptyLeg = (): LegState => ({
    number: '',
    from: '',
    to: '',
    departDate: '',
    departTime: '',
    arriveDate: '',
    arriveTime: '',
    departTz: null,
    arriveTz: null,
    carrier: null,
  });

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Type</legend>
        <div role="radiogroup" aria-label="Booking type" className="flex flex-wrap gap-1.5">
          {BOOKING_TYPE_ORDER.map((t) => {
            const on = t === f.type;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() =>
                  onChange({
                    ...f,
                    type: t,
                    legs:
                      (t === 'FLIGHT' || t === 'TRANSPORT') && !f.legs.length && t === 'FLIGHT'
                        ? [emptyLeg()]
                        : f.legs,
                  })
                }
                className={`min-h-10 rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-border-input bg-surface text-ink hover:bg-surface-muted'}`}
              >
                {BOOKING_TYPES[t].label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Field label="Title" wide badge={badge('title')}>
          {(id) => (
            <input
              id={id}
              className={inputCls}
              value={f.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Fado night · Casa da Saudade"
            />
          )}
        </Field>
        <Field label={f.type === 'FLIGHT' ? 'Airline' : 'Provider'} wide badge={badge('provider')}>
          {(id) => (
            <input
              id={id}
              className={inputCls}
              value={f.provider}
              onChange={(e) => set('provider', e.target.value)}
              placeholder={f.type === 'FLIGHT' ? 'e.g. TAP Air Portugal' : 'Company or venue'}
            />
          )}
        </Field>

        {showLegs ? (
          <div className="col-span-2 flex flex-col gap-3">
            <span className="flex items-center justify-between text-sm font-semibold">
              {f.type === 'FLIGHT' ? 'Flights' : 'Legs'}
              {badge('segments') && (
                <span className="text-xs font-semibold text-accent-strong">Read from file</span>
              )}
            </span>
            {f.legs.map((l, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3 sm:grid-cols-4"
              >
                <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-semibold sm:col-span-1">
                  {f.type === 'FLIGHT' ? 'Flight no.' : 'Number'}
                  <input
                    className={inputCls}
                    value={l.number}
                    onChange={(e) => setLeg(i, { number: e.target.value })}
                    placeholder={f.type === 'FLIGHT' ? 'TP 1394' : 'Optional'}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                  From
                  <input
                    className={inputCls}
                    value={l.from}
                    onChange={(e) => setLeg(i, { from: e.target.value })}
                    placeholder={f.type === 'FLIGHT' ? 'TLV' : 'Station'}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                  To
                  <input
                    className={inputCls}
                    value={l.to}
                    onChange={(e) => setLeg(i, { to: e.target.value })}
                    placeholder={f.type === 'FLIGHT' ? 'LIS' : 'Station'}
                  />
                </label>
                <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                  {f.legs.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove leg ${i + 1}`}
                      onClick={() =>
                        set(
                          'legs',
                          f.legs.filter((_, j) => j !== i),
                        )
                      }
                      className="flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted"
                    >
                      <CloseIcon size={16} />
                    </button>
                  )}
                </div>
                <div className="col-span-2 flex flex-col gap-1.5 text-[13px] font-semibold">
                  Departs
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
                    <DateField
                      value={l.departDate}
                      onChange={(v) => setLeg(i, { departDate: v })}
                      aria-invalid={!l.departDate}
                    />
                    <TimeField
                      value={l.departTime}
                      onChange={(v) => setLeg(i, { departTime: v })}
                    />
                  </div>
                </div>
                <div className="col-span-2 flex flex-col gap-1.5 text-[13px] font-semibold">
                  Arrives
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
                    <DateField
                      value={l.arriveDate}
                      min={l.departDate || undefined}
                      onChange={(v) => setLeg(i, { arriveDate: v })}
                    />
                    <TimeField
                      value={l.arriveTime}
                      onChange={(v) => setLeg(i, { arriveTime: v })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('legs', [...f.legs, emptyLeg()])}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border-input text-sm font-semibold text-ink-secondary hover:bg-surface-muted"
            >
              <PlusIcon size={16} />
              Add {f.type === 'FLIGHT' ? 'flight' : 'leg'}
            </button>
          </div>
        ) : (
          <>
            <Field
              label={`${startLabel} date`}
              badge={missingStart && showProvenance ? 'missing' : badge('startLocal')}
              error={missingStart}
              hint={missingStart ? 'Needed to show it on the itinerary.' : undefined}
            >
              {(id) => (
                <DateField
                  id={id}
                  value={f.startDate}
                  onChange={(v) => set('startDate', v)}
                  aria-invalid={missingStart}
                />
              )}
            </Field>
            <Field label={`${startLabel} time`}>
              {(id) => (
                <TimeField id={id} value={f.startTime} onChange={(v) => set('startTime', v)} />
              )}
            </Field>
            <Field label={`${endLabel} date`} badge={badge('endLocal')}>
              {(id) => (
                <DateField
                  id={id}
                  value={f.endDate}
                  min={f.startDate || undefined}
                  onChange={(v) => set('endDate', v)}
                />
              )}
            </Field>
            <Field label={`${endLabel} time`}>
              {(id) => <TimeField id={id} value={f.endTime} onChange={(v) => set('endTime', v)} />}
            </Field>
            {usesLegs && (
              <button
                type="button"
                onClick={() => set('legs', [emptyLeg()])}
                className="col-span-2 justify-self-start text-sm font-semibold text-accent"
              >
                Add departure and arrival details
              </button>
            )}
          </>
        )}

        <Field label="Confirmation code" badge={badge('confirmationCode')}>
          {(id) => (
            <input
              id={id}
              className={`${inputCls} font-mono tracking-wider uppercase`}
              value={f.confirmationCode}
              onChange={(e) => set('confirmationCode', e.target.value)}
              placeholder="Optional"
            />
          )}
        </Field>
        <Field
          label={f.type === 'DINING' ? 'Party size' : f.type === 'STAY' ? 'Guests' : 'Travellers'}
          badge={badge('travellers')}
        >
          {(id) => (
            <input
              id={id}
              className={inputCls}
              inputMode="numeric"
              value={f.travellers}
              onChange={(e) => set('travellers', e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="Optional"
            />
          )}
        </Field>
        <Field label="Price" badge={badge('price')}>
          {(id) => (
            <input
              id={id}
              className={`${inputCls} tabular-nums`}
              inputMode="decimal"
              value={f.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="0.00"
            />
          )}
        </Field>
        <Field label="Currency">
          {(id) => (
            <Select
              id={id}
              value={f.currency}
              onValueChange={(v) => set('currency', v)}
              options={CURRENCIES}
            />
          )}
        </Field>
        {!showLegs && (
          <Field
            label={isStay ? 'Address' : 'Location'}
            wide
            badge={badge(isStay ? 'address' : 'location', 'address')}
          >
            {(id) =>
              isStay ? (
                <input
                  id={id}
                  className={inputCls}
                  value={f.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Street, city"
                />
              ) : (
                <input
                  id={id}
                  className={inputCls}
                  value={f.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="Venue, neighbourhood or address"
                />
              )
            }
          </Field>
        )}
        <Field label="Booking link" wide badge={badge('bookingUrl')}>
          {(id) => (
            <input
              id={id}
              type="url"
              className={inputCls}
              value={f.bookingUrl}
              onChange={(e) => set('bookingUrl', e.target.value)}
              placeholder="https://… (manage or view the booking)"
            />
          )}
        </Field>
        <Field label="Notes" wide>
          {(id) => (
            <textarea
              id={id}
              rows={2}
              className={`${inputCls} h-auto resize-y py-2.5`}
              value={f.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Door codes, what to bring, who has the tickets…"
            />
          )}
        </Field>
      </div>
      <p className="text-[13px] text-ink-muted">
        Times are local to{' '}
        {f.timeZone && !/^[+-]/.test(f.timeZone)
          ? f.timeZone.replace(/_/g, ' ')
          : f.timeZone
            ? `UTC${f.timeZone}`
            : tripTimeZone.replace(/_/g, ' ')}
        .
      </p>
    </div>
  );
}
