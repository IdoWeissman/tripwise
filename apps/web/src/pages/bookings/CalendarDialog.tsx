import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { CopyIcon, DownloadIcon } from '../../components/Icons';
import { ErrorState, Skeleton } from '../../components/States';
import { useToast } from '../../components/Toast';
import { graphql } from '../../gql';
import type { ReminderPreferencesInput } from '../../gql/graphql';
import { messageFromError } from '../../lib/errors';
import { useTrip } from '../../lib/trip';

const CalendarSettingsDocument = graphql(`
  query CalendarSettings($id: ID!) {
    trip(id: $id) {
      id
      calendarUrl
      myReminderPreferences {
        checkIn
        leaveForAirport
        checkOut
        startingSoon
        email
      }
    }
  }
`);

const UpdateRemindersDocument = graphql(`
  mutation UpdateReminderPreferences($tripId: ID!, $input: ReminderPreferencesInput!) {
    updateReminderPreferences(tripId: $tripId, input: $input) {
      checkIn
      leaveForAirport
      checkOut
      startingSoon
      email
    }
  }
`);

const ResetCalendarDocument = graphql(`
  mutation ResetCalendarLink($tripId: ID!) {
    resetCalendarLink(tripId: $tripId)
  }
`);

type PrefKey = keyof Required<ReminderPreferencesInput>;

const REMINDERS: { key: PrefKey; title: string; when: string }[] = [
  {
    key: 'checkIn',
    title: 'Online check-in opens',
    when: 'Flights · usually 24 h before departure',
  },
  {
    key: 'leaveForAirport',
    title: 'Time to leave for the airport',
    when: 'Flights · 2 h 30 min before departure',
  },
  { key: 'checkOut', title: 'Check-out today', when: 'Stays · 08:00 on check-out day' },
  {
    key: 'startingSoon',
    title: 'Starting soon',
    when: 'Shows, tours and reservations · 1 h before',
  },
  { key: 'email', title: 'Also email me', when: 'To the address on your account' },
];

/** Calendar & reminders — design canvas "Calendar and reminders" / rules §2 · 11. */
export function CalendarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { trip, isOwner } = useTrip();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { data, loading, error, refetch } = useQuery(CalendarSettingsDocument, {
    variables: { id: trip.id },
    skip: !open,
  });
  const [update] = useMutation(UpdateRemindersDocument);
  const [reset, { loading: resetting }] = useMutation(ResetCalendarDocument);

  const url = data?.trip?.calendarUrl ?? '';
  const webcal = url.replace(/^https?:/, 'webcal:');
  const prefs = data?.trip?.myReminderPreferences;
  const apps = [
    {
      label: 'Google Calendar',
      href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    },
    { label: 'Apple Calendar', href: webcal },
    {
      label: 'Outlook',
      href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent(trip.name)}`,
    },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(webcal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy failed — select the link and copy it manually.', 'error');
    }
  }

  function toggle(key: PrefKey) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    void update({
      variables: { tripId: trip.id, input: { [key]: next[key] } },
      optimisticResponse: {
        __typename: 'Mutation',
        updateReminderPreferences: { ...next, __typename: 'ReminderPreferences' },
      },
      update: (cache, { data: d }) => {
        if (!d) return;
        cache.modify({
          id: cache.identify({ __typename: 'Trip', id: trip.id }),
          fields: { myReminderPreferences: () => d.updateReminderPreferences },
        });
      },
    }).catch((err: unknown) => toast(messageFromError(err), 'error'));
  }

  return (
    <Dialog open={open} onClose={onClose} title="Calendar & reminders" wide>
      {loading && !data ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : error || !data?.trip || !prefs ? (
        <ErrorState
          message="We couldn't load your calendar settings."
          onRetry={() => void refetch()}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="cal-sub" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 id="cal-sub" className="text-[15px] font-bold">
                Subscribe in your calendar
              </h3>
              <p className="text-[13px] text-ink-muted">
                Bookings and plans stay in sync when anything changes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {apps.map((a) => (
                <a
                  key={a.label}
                  href={a.href}
                  target={a.href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  className="flex min-h-11 items-center rounded-control border border-border-input px-3.5 text-sm font-semibold text-ink no-underline hover:bg-surface-muted"
                >
                  {a.label}
                </a>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Private calendar link
              <span className="flex flex-wrap gap-2">
                <input
                  readOnly
                  value={webcal}
                  onFocus={(e) => e.target.select()}
                  className="h-11 min-w-0 flex-[1_1_240px] rounded-control border border-border-input bg-bg px-3 text-sm font-normal text-ink-secondary"
                />
                <Button variant="secondary" onClick={() => void copy()}>
                  <CopyIcon size={16} />
                  <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </span>
            </label>
            <p className="text-[13px] text-ink-muted">
              Anyone with this link can see the trip schedule.{' '}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="min-h-6 font-semibold text-negative-ink"
                >
                  Reset link
                </button>
              )}
            </p>
          </section>

          <section aria-labelledby="cal-rem" className="flex flex-col">
            <div className="mb-1.5 flex flex-col gap-1">
              <h3 id="cal-rem" className="text-[15px] font-bold">
                Reminders for you
              </h3>
              <p className="text-[13px] text-ink-muted">
                Shown on the trip overview and sent by email. Only you see your settings.
              </p>
            </div>
            {REMINDERS.map((r) => {
              const on = prefs[r.key];
              const disabled =
                r.key === 'email' && !REMINDERS.slice(0, 4).some((x) => prefs[x.key]);
              return (
                <div
                  key={r.key}
                  className="flex min-h-14 items-center gap-3 border-t border-surface-muted"
                >
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold">{r.title}</span>
                    <span className="text-xs text-ink-muted">{r.when}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={r.title}
                    disabled={disabled}
                    onClick={() => toggle(r.key)}
                    className="flex h-11 w-14 shrink-0 items-center justify-center disabled:opacity-50"
                  >
                    <span
                      className={`flex h-[26px] w-11 rounded-full p-[3px] transition-colors ${on ? 'justify-end bg-accent' : 'justify-start bg-border-input'}`}
                    >
                      <span className="size-5 rounded-full bg-surface shadow-segment" />
                    </span>
                  </button>
                </div>
              );
            })}
          </section>

          <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4">
            <a
              href={url}
              download={`${trip.name}.ics`}
              className="flex min-h-11 items-center gap-2 rounded-control px-3.5 text-sm font-semibold no-underline"
            >
              <DownloadIcon size={16} />
              Download .ics
            </a>
            <Button onClick={onClose}>Done</Button>
          </div>

          {confirmReset && (
            <ConfirmDialog
              title="Reset the calendar link?"
              body="Calendars subscribed with the old link stop updating. Everyone will need the new link."
              confirmLabel="Reset link"
              busy={resetting}
              onClose={() => setConfirmReset(false)}
              onConfirm={() =>
                void reset({ variables: { tripId: trip.id } })
                  .then(async () => {
                    await refetch();
                    setConfirmReset(false);
                    toast('New calendar link created');
                  })
                  .catch((err: unknown) => toast(messageFromError(err), 'error'))
              }
            />
          )}
        </div>
      )}
    </Dialog>
  );
}
