import { useMutation } from '@apollo/client/react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { ArrowRightIcon, CheckIcon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import { graphql } from '../../gql';
import { messageFromError } from '../../lib/errors';

const HideTripSetupDocument = graphql(`
  mutation HideTripSetup($tripId: ID!) {
    hideTripSetup(tripId: $tripId) {
      id
      setup {
        hasBookings
        hasInvited
        hasExpenses
        hidden
      }
    }
  }
`);

export interface TripSetupState {
  hasBookings: boolean;
  hasInvited: boolean;
  hasExpenses: boolean;
  hidden: boolean;
}

/**
 * "Get the trip ready" — rules §2 · 15. The three first moves after creating a trip, in any order,
 * all optional. Each row opens the real flow (`from=setup` brings a save back here).
 */
export function SetupChecklist({
  tripId,
  setup,
  started,
}: {
  tripId: string;
  setup: TripSetupState;
  /** Once the trip is under way, phones get one line per step instead of two. */
  started: boolean;
}) {
  const toast = useToast();
  const [hide, { loading }] = useMutation(HideTripSetupDocument, {
    variables: { tripId },
    onError: (err) => toast(messageFromError(err), 'error'),
  });

  const steps = [
    {
      done: setup.hasBookings,
      title: 'Add your bookings',
      help: "Drop a confirmation email, PDF or ticket photo — we'll fill in the details.",
      to: '../bookings?add&from=setup',
    },
    {
      done: setup.hasInvited,
      title: 'Invite the group',
      help: 'Create one link and paste it into the group chat.',
      to: '../members?invite&from=setup',
    },
    {
      done: setup.hasExpenses,
      title: 'Add expenses already paid',
      help: 'Flights, deposits, tickets — so balances start right.',
      to: '../expenses?add&from=setup',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const firstOpen = steps.findIndex((s) => !s.done);

  const hideButton = (
    <Button
      variant="ghost"
      className="shrink-0 px-3 text-sm"
      disabled={loading}
      onClick={() => void hide()}
    >
      {doneCount === steps.length ? 'Done' : 'Hide'}{' '}
      <span className="sr-only">setup checklist</span>
    </Button>
  );

  if (doneCount === steps.length) {
    return (
      <section
        aria-labelledby="setup-title"
        className="flex items-center gap-3 rounded-card bg-money-tint py-1 pr-2 pl-5"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-money text-white">
          <CheckIcon size={16} />
        </span>
        <h2 id="setup-title" className="flex-1 text-[15px] font-bold text-money">
          You're set — the trip is ready for the group.
        </h2>
        {hideButton}
      </section>
    );
  }

  return (
    <section aria-labelledby="setup-title" className="rounded-card border-2 border-sign bg-surface">
      <div className="flex items-center gap-3 py-1 pr-2 pl-5">
        <h2 id="setup-title" className="flex-1 text-lg font-extrabold">
          Get the trip ready
        </h2>
        <span className="figures text-sm font-bold text-ink-muted">
          {doneCount} of {steps.length} done
        </span>
        {hideButton}
      </div>
      <ol>
        {steps.map((s, i) => {
          const primary = i === firstOpen;
          return (
            <li key={s.title}>
              <Link
                to={s.to}
                relative="path"
                className="grid min-h-16 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-5 py-3 text-ink no-underline hover:bg-bg hover:text-ink"
              >
                {s.done ? (
                  <span className="flex size-7 items-center justify-center rounded-full bg-money text-white">
                    <CheckIcon size={16} />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={`size-7 rounded-full border-2 ${primary ? 'border-sign' : 'border-border-input'}`}
                  />
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={`text-base font-bold ${s.done ? 'text-ink-muted line-through decoration-1' : ''}`}
                  >
                    {/* the space sits outside the hidden span, which trims it */}
                    <span className="sr-only">{s.done ? 'Done:' : 'To do:'}</span> {s.title}
                  </span>
                  {!s.done && (
                    <span
                      className={`text-[13px] text-ink-muted ${started ? 'max-md:hidden' : ''}`}
                    >
                      {s.help}
                    </span>
                  )}
                </span>
                {s.done ? (
                  <span className="text-xs font-bold text-ink-muted">Add more</span>
                ) : primary ? (
                  <span className="flex size-11 items-center justify-center rounded-control bg-sign text-white">
                    <ArrowRightIcon size={18} />
                  </span>
                ) : (
                  <ArrowRightIcon size={18} className="mx-3 text-ink-muted" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
