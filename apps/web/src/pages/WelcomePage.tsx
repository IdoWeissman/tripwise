import { useQuery } from '@apollo/client/react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { SuitcaseIcon, UsersIcon, WalletIcon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { MeDocument } from '../lib/session';
import { TripForm } from './trips/TripForm';

const NEXT = [
  {
    icon: SuitcaseIcon,
    t: 'Add your bookings',
    d: "Drop a confirmation email, PDF or ticket photo and we'll fill in the details.",
  },
  { icon: UsersIcon, t: 'Invite the group', d: 'One link to paste into the group chat.' },
  {
    icon: WalletIcon,
    t: 'Add expenses already paid',
    d: 'Flights, deposits, tickets — log them now and settle up later.',
  },
];

/**
 * First run after sign-up — rules §2 · 15. The one required step is the trip itself; everything
 * else waits on the trip's Today screen as a checklist. Phone-first: the form leads.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const { data } = useQuery(MeDocument);
  const first = data?.me?.name.split(' ')[0];

  return (
    <div className="flex min-h-screen flex-wrap bg-surface">
      <section
        aria-labelledby="welcome-title"
        className="order-1 flex flex-[1_1_480px] items-center justify-center px-4 py-10 sm:px-8 md:py-12 lg:order-2"
      >
        <div className="flex w-full max-w-[440px] flex-col gap-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="flex flex-col gap-2">
            <h1
              id="welcome-title"
              className="text-headline-sm font-extrabold tracking-[-0.02em] md:text-headline"
            >
              Where are you going?
            </h1>
            <p className="text-[15px] text-ink-muted">
              {first ? `Welcome, ${first}. ` : ''}Start with the trip — bookings, friends and
              expenses come right after.
            </p>
          </div>
          <TripForm
            onCreated={(id) => navigate(`/trips/${id}/overview`)}
            actions={({ loading, disabled }) => (
              <div className="mt-2 flex flex-col gap-2">
                <Button type="submit" disabled={disabled} className="min-h-12 w-full">
                  {loading ? 'Creating…' : 'Create trip'}
                </Button>
                <Link
                  to="/"
                  className="flex min-h-11 items-center justify-center text-sm font-bold text-ink-secondary no-underline hover:text-ink"
                >
                  I'll do this later
                </Link>
              </div>
            )}
          />
        </div>
      </section>

      <section
        aria-labelledby="welcome-next"
        className="order-2 flex flex-[1_1_480px] flex-col justify-between gap-10 bg-sign px-4 py-10 text-white sm:px-8 md:px-16 md:py-12 lg:order-1"
      >
        <div className="max-lg:hidden">
          <Logo onSign />
        </div>
        <div className="flex max-w-[520px] flex-col gap-7">
          <h2
            id="welcome-next"
            className="text-headline-sm leading-[1.1] font-extrabold tracking-[-0.02em] md:text-board-sm"
          >
            Then, on your trip's Today screen
          </h2>
          <ul className="flex flex-col gap-5">
            {NEXT.map((n) => (
              <li key={n.t} className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sign-raised text-white">
                  <n.icon size={20} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong className="font-bold text-white">{n.t}</strong>
                  <span className="text-[15px] text-sign-ink-soft">{n.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-sign-ink-soft">
          All three are optional — do them now, later, or let your friends pitch in.
        </p>
      </section>
    </div>
  );
}
