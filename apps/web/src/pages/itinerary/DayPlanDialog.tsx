import { useLazyQuery, useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SelectField, TimeInputField } from '../../components/Fields';
import { AlertIcon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import { messageFromError } from '../../lib/errors';
import type { GetAround, Pace } from '../../gql/graphql';
import { DURATIONS, durationText, getAroundLabel, legText, paceLabel } from './planText';
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
        <p className="text-[13px] text-ink-muted">
          {paceLabel(pace)} pace · {getAroundLabel(getAround)}
          {plan.freeFrom && <> · free from {plan.freeFrom}</>}
          {plan.freeUntil && <> · until {plan.freeUntil}</>}
        </p>

        {dayIssues.length > 0 && <IssueList issues={dayIssues} />}

        {preview ? (
          <ArrangementPreview
            better={preview.better}
            reason={preview.reason}
            plan={preview.plan}
            applying={applying}
            onApply={() => void apply()}
            onDismiss={() => setPreviewing(false)}
          />
        ) : (
          <ol aria-label={`${dayName} in time order`} className="flex flex-col">
            {plan.stops.map((s, i) => (
              <StopRow
                key={s.activity.id}
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
            ))}
            {plan.backToStay && (
              <li className="flex min-h-9 items-center gap-2 border-l-2 border-dashed border-border-input pl-4 text-[13px] text-ink-muted">
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
              disabled={arrangement.loading || plan.stops.length < 2}
              onClick={() => {
                setPreviewing(true);
                void loadArrangement({ variables: { tripId, dayId } });
              }}
              className="self-start"
            >
              {arrangement.loading ? 'Working it out…' : 'Arrange this day'}
            </Button>
            <p className="text-[13px] text-ink-muted">
              Orders stops by route from where you stay and gives each a time. Booked plans keep
              theirs. You see the result before anything changes.
            </p>
          </div>
        )}

        <p className="text-xs text-ink-muted">
          {plan.travelEstimated
            ? 'Travel times are estimates from distance.'
            : 'Travel times and opening hours from Google, as of now.'}{' '}
          Lengths marked “typical” are usual for that kind of place.
        </p>
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
        <li className="flex min-h-9 items-center border-l-2 border-dashed border-border-input pl-4 text-[13px] text-ink-muted">
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
            <p className="text-[15px] font-extrabold text-accent-strong figures">
              {s.start}–{s.end}
            </p>
            <p className="text-sm font-semibold text-balance">{s.activity.title}</p>
            <p className="text-[13px] text-ink-muted">
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
          <p key={n} className="flex items-start gap-2 text-[13px] text-attention-ink">
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
  better,
  reason,
  plan,
  applying,
  onApply,
  onDismiss,
}: {
  better: boolean;
  reason: string;
  plan: DayPlan;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!better)
    return (
      <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface-column px-4 py-3">
        <p className="text-sm">{reason}</p>
        <Button variant="secondary" onClick={onDismiss}>
          Back to the day
        </Button>
      </div>
    );
  return (
    <section
      aria-label="Suggested order"
      className="flex flex-col gap-3 rounded-card border border-accent-tint-border bg-accent-tint px-4 py-3"
    >
      <h3 className="text-[15px] font-bold text-accent-deep">{reason}</h3>
      <ol className="flex flex-col gap-1.5">
        {plan.stops.map((s, i) => (
          <li key={s.activity.id} className="flex items-baseline gap-3 text-sm">
            <span className="w-12 shrink-0 font-bold text-accent-strong figures">{s.start}</span>
            <span className="min-w-0">
              <span className="font-semibold">{s.activity.title}</span>
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
        <p className="text-[13px] text-accent-ink-soft">
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
