import { useLazyQuery, useMutation } from '@apollo/client/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SelectField, TimeInputField } from '../../components/Fields';
import { AlertIcon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import { BOOKING_TYPES, localTime } from '../../lib/bookings';
import { messageFromError } from '../../lib/errors';
import type { GetAround, Pace } from '../../gql/graphql';
import {
  canArrange,
  DURATIONS,
  durationText,
  getAroundLabel,
  legText,
  paceLabel,
} from './planText';
import { bookingTimeOn, legOn, type DayBooking } from './timeline';
import {
  ArrangeDayDocument,
  DayArrangementDocument,
  SetActivityTimingDocument,
  type DayPlan,
} from './queries';

type Stop = DayPlan['stops'][number];
type Issue = DayPlan['issues'][number];

interface Props {
  tripId: string;
  dayId: string;
  /** "Day 2 · Tue, Mar 2". */
  dayName: string;
  plan: DayPlan;
  /** The day's bookings that no plan stands for (a show, a sight): fixed points of the day. */
  bookings: DayBooking[];
  /** "YYYY-MM-DD" of the day. */
  date: string;
  pace: Pace;
  getAround: GetAround;
  canEdit: boolean;
  onClose: () => void;
  /** Called after a change, so the board and plans refetch. */
  onChanged: () => Promise<unknown>;
}

/**
 * The day plan (rules §2 · 03 Day plan): the day in time with travel between stops, what doesn't
 * work and why, per-stop timing, and "Arrange this day" with a preview before anything changes.
 */
export function DayPlanDialog({
  tripId,
  dayId,
  dayName,
  plan,
  bookings,
  date,
  pace,
  getAround,
  canEdit,
  onClose,
  onChanged,
}: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [loadArrangement, arrangement] = useLazyQuery(DayArrangementDocument, {
    fetchPolicy: 'network-only',
  });
  const [arrange, { loading: applying }] = useMutation(ArrangeDayDocument);
  const [previewing, setPreviewing] = useState(false);
  const preview = previewing ? arrangement.data?.trip?.day?.arrangement : undefined;
  const dayIssues = plan.issues.filter((i) => !i.activityId);
  const arrangeable = canArrange(plan.stops);

  // Focus follows the preview: into it when it opens, back to "Arrange this day" when it closes.
  const previewRef = useRef<HTMLElement>(null);
  const arrangeRef = useRef<HTMLButtonElement>(null);
  const wasPreviewing = useRef(false);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
    else if (wasPreviewing.current) arrangeRef.current?.focus();
    wasPreviewing.current = Boolean(preview);
  }, [preview]);

  // The day's bookings sit among the stops by time, fixed, so a clash names something listed.
  const fixed = bookings
    .map((b) => {
      const leg = legOn(b, date);
      return {
        booking: b,
        start: bookingTimeOn(b, date),
        end: localTime(leg?.arriveLocal ?? b.endLocal),
        title: leg?.fromCode && leg.toCode ? `${leg.fromCode} → ${leg.toCode}` : b.title,
      };
    })
    .sort((x, y) => (x.start ?? '99').localeCompare(y.start ?? '99'));
  const bookingsBefore = (time: string | null) =>
    fixed.filter((x) => x.start && time && x.start <= time);
  const shown = new Set<string>();
  const bookingRows = (list: typeof fixed) =>
    list
      .filter((x) => !shown.has(x.booking.id) && shown.add(x.booking.id))
      .map((x) => <BookingRow key={x.booking.id} {...x} />);
  const hasTravel = plan.stops.some((s) => s.travel) || Boolean(plan.backToStay);
  const hasTypical = plan.stops.some((s) => s.durationEstimated);

  const apply = async () => {
    try {
      await arrange({ variables: { dayId } });
      await onChanged();
      toast(`${dayName} arranged.`);
      onClose();
    } catch (err) {
      toast(messageFromError(err, "Couldn't arrange the day. Nothing was changed."), 'error');
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Day plan · ${dayName}`} wide>
      <div className="flex flex-col gap-5">
        <p className="text-meta text-ink-muted">
          {paceLabel(pace)} pace · {getAroundLabel(getAround)}
          {plan.freeFrom && <> · free from {plan.freeFrom}</>}
          {plan.freeUntil && <> · until {plan.freeUntil}</>}
        </p>

        {dayIssues.length > 0 && <IssueList issues={dayIssues} />}

        {preview && (
          <ArrangementPreview
            ref={previewRef}
            better={preview.better}
            reason={preview.reason}
            plan={preview.plan}
            applying={applying}
            onApply={() => void apply()}
            onDismiss={() => setPreviewing(false)}
          />
        )}
        {/* "nothing to re-order" is a note above the day, never instead of it */}
        {!preview?.better && (
          <ol aria-label={`${dayName} in time order`} className="flex flex-col gap-0">
            {plan.stops.map((s, i) => (
              <Fragment key={s.activity.id}>
                {bookingRows(bookingsBefore(s.start))}
                <StopRow
                  stop={s}
                  first={i === 0}
                  issues={plan.issues.filter((x) => x.activityId === s.activity.id)}
                  canEdit={canEdit}
                  editing={editing === s.activity.id}
                  onEdit={() => setEditing(s.activity.id)}
                  onDone={async (changed) => {
                    setEditing(null);
                    if (changed) await onChanged();
                  }}
                />
              </Fragment>
            ))}
            {bookingRows(fixed)}
            {plan.backToStay && (
              <li className="flex min-h-9 items-center gap-2 border-l-2 border-dashed border-border-input pl-4 text-meta text-ink-muted">
                {legText(plan.backToStay)} back to where you stay
              </li>
            )}
          </ol>
        )}

        {previewing && arrangement.error && (
          <p role="alert" className="text-sm text-attention-ink">
            {messageFromError(arrangement.error, "Couldn't work out a better order. Try again.")}
          </p>
        )}

        {canEdit && !preview && !editing && (
          <div className="flex flex-col gap-1.5">
            <Button
              ref={arrangeRef}
              disabled={arrangement.loading || !arrangeable}
              aria-describedby="arrange-why"
              onClick={() => {
                setPreviewing(true);
                void loadArrangement({ variables: { tripId, dayId } });
              }}
              className="self-start"
            >
              {arrangement.loading ? 'Working it out…' : 'Arrange this day'}
            </Button>
            <p id="arrange-why" className="text-meta text-ink-muted">
              {arrangeable
                ? 'Orders stops by route from where you stay and gives each a time. Booked plans keep theirs. You see the result before anything changes.'
                : 'Needs two plans with a place that aren’t booked: pick a place for a plan (on its card) to let the day be arranged.'}
            </p>
          </div>
        )}

        {(hasTravel || hasTypical) && (
          <p className="text-xs text-ink-muted">
            {hasTravel &&
              (plan.travelEstimated
                ? 'Travel times are estimates from distance. '
                : 'Travel times and opening hours from Google, as of now. ')}
            {hasTypical && 'Lengths marked “typical” are usual for that kind of place.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul className="flex flex-col gap-1.5 rounded-card border border-attention bg-tint-orange px-4 py-3">
      {issues.map((i, n) => (
        <li key={n} className="flex items-start gap-2 text-sm text-attention-ink">
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          {i.message}
        </li>
      ))}
    </ul>
  );
}

function StopRow({
  stop: s,
  first,
  issues,
  canEdit,
  editing,
  onEdit,
  onDone,
}: {
  stop: Stop;
  first: boolean;
  issues: Issue[];
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: (changed: boolean) => Promise<void>;
}) {
  const booked = Boolean(s.activity.booking);
  return (
    <>
      {s.travel && (
        <li className="flex min-h-9 items-center border-l-2 border-dashed border-border-input pl-4 text-meta text-ink-muted">
          {legText(s.travel)}
          {first ? ' from where you stay' : ''}
        </li>
      )}
      <li
        className={`flex flex-col gap-1 rounded-card border bg-surface px-4 py-3 ${
          issues.length ? 'border-attention' : 'border-border'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body font-extrabold text-accent-strong figures">
              {s.start}–{s.end}
            </p>
            <p className="text-sm font-semibold text-balance">
              <bdi dir="auto">{s.activity.title}</bdi>
            </p>
            <p className="text-meta text-ink-muted">
              {durationText(s.durationMinutes)}
              {s.durationEstimated ? ' (typical)' : ''}
              {booked ? ' · booked, time fixed' : !s.activity.startTime ? ' · any time' : ''}
            </p>
          </div>
          {canEdit && !booked && !editing && (
            <Button variant="ghost" className="-mr-2 shrink-0 px-3 text-sm" onClick={onEdit}>
              Edit time<span className="sr-only"> for {s.activity.title}</span>
            </Button>
          )}
        </div>
        {issues.map((i, n) => (
          <p key={n} className="flex items-start gap-2 text-meta text-attention-ink">
            <AlertIcon size={16} className="mt-px shrink-0" />
            {i.message}
          </p>
        ))}
        {editing && <TimingEditor stop={s} onDone={onDone} />}
      </li>
    </>
  );
}

function TimingEditor({
  stop,
  onDone,
}: {
  stop: Stop;
  onDone: (changed: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const [startTime, setStartTime] = useState(stop.activity.startTime ?? '');
  const [length, setLength] = useState(String(stop.activity.durationMinutes ?? 'typical'));
  const [save, { loading }] = useMutation(SetActivityTimingDocument);
  const options = [
    { value: 'typical', label: `Typical (${durationText(stop.durationMinutes)})` },
    ...DURATIONS.map((m) => ({ value: String(m), label: durationText(m) })),
  ];
  if (stop.activity.durationMinutes && !DURATIONS.includes(stop.activity.durationMinutes))
    options.push({
      value: String(stop.activity.durationMinutes),
      label: durationText(stop.activity.durationMinutes),
    });

  const submit = async () => {
    try {
      await save({
        variables: {
          activityId: stop.activity.id,
          startTime: startTime || null,
          durationMinutes: length === 'typical' ? null : Number(length),
        },
      });
      await onDone(true);
    } catch (err) {
      toast(messageFromError(err, "Couldn't save the time."), 'error');
    }
  };

  return (
    <form
      className="mt-2 flex flex-col gap-3 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TimeInputField label="Starts" value={startTime} onChange={setStartTime} />
        <SelectField label="Takes" value={length} onValueChange={setLength} options={options} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save time'}
        </Button>
        <Button variant="secondary" onClick={() => void onDone(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ArrangementPreview({
  ref,
  better,
  reason,
  plan,
  applying,
  onApply,
  onDismiss,
}: {
  ref: React.Ref<HTMLElement>;
  better: boolean;
  reason: string;
  plan: DayPlan;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!better)
    return (
      <section
        ref={ref}
        tabIndex={-1}
        aria-label="Arrange this day"
        className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface-column px-4 py-3"
      >
        <p className="text-sm">{reason}</p>
        <Button variant="secondary" onClick={onDismiss}>
          Done
        </Button>
      </section>
    );
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label="Suggested order"
      className="flex flex-col gap-3 rounded-card border border-accent-tint-border bg-accent-tint px-4 py-3"
    >
      <h3 className="text-body font-bold text-accent-deep">{reason}</h3>
      <ol className="flex flex-col gap-1.5">
        {plan.stops.map((s, i) => (
          <li key={s.activity.id} className="flex items-baseline gap-3 text-sm">
            <span className="w-12 shrink-0 font-bold text-accent-strong figures">{s.start}</span>
            <span className="min-w-0">
              <bdi dir="auto" className="font-semibold">
                {s.activity.title}
              </bdi>
              {s.travel && (
                <span className="text-ink-muted">
                  {' '}
                  · {legText(s.travel).toLowerCase()}
                  {i === 0 ? ' from the stay' : ''}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {plan.issues.length > 0 && (
        <p className="text-meta text-accent-ink-soft">
          Still to check after this: {plan.issues.map((i) => i.message).join('; ')}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={applying} onClick={onApply}>
          {applying ? 'Applying…' : 'Use this order'}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          Keep my order
        </Button>
      </div>
    </section>
  );
}

/** A booking on the day (a show, a sight): a fixed point in the day plan, not moved or retimed. */
function BookingRow({
  booking,
  start,
  end,
  title,
}: {
  booking: DayBooking;
  start: string | null;
  end: string | null;
  title: string;
}) {
  const t = BOOKING_TYPES[booking.type];
  return (
    <li className="my-1 flex flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3">
      <p className="text-body font-extrabold text-accent-strong figures">
        {start ? (end ? `${start}–${end}` : start) : 'Time missing'}
      </p>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span
          className={`rounded-chip px-1.5 py-0.5 text-xs font-bold tracking-[0.04em] ${t.chip}`}
        >
          <span className="sr-only">{t.label} booking: </span>
          {t.code}
        </span>
        <bdi dir="auto" className="min-w-0 text-balance">
          {title}
        </bdi>
      </p>
      <p className="text-meta text-ink-muted">Booked, time fixed</p>
    </li>
  );
}
