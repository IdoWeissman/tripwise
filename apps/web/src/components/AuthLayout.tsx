import type { ReactNode } from 'react';
import { Logo } from './Logo';

const POINTS = [
  { t: 'One shared itinerary', d: 'Drag activities between days. Everyone sees changes live.' },
  { t: 'Vote on ideas', d: 'Proposals with enough votes land on the plan automatically.' },
  { t: 'Split costs fairly', d: 'Log expenses and settle up in as few payments as possible.' },
];

/** Shared field look on the signed-out screens (sign in, sign up, password reset). */
export const authInputCls =
  'h-12 rounded-control border border-border-input bg-surface px-3.5 text-[15px] font-normal text-ink placeholder:text-ink-muted aria-[invalid=true]:border-negative';

/**
 * The signed-out split layout — rules §2 · 01: the form panel (first on phones) beside the sign
 * panel that says what Tripwise is. Sign in, sign up and the password-reset screens share it.
 */
export function AuthLayout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap bg-surface">
      {/* Form first on mobile (rules §2 · Sign in) */}
      <section
        aria-label={label}
        className="order-1 flex flex-[1_1_480px] items-center justify-center px-8 py-12 md:order-2"
      >
        <div className="flex w-full max-w-[400px] flex-col gap-5">{children}</div>
      </section>

      <section
        aria-label="About Tripwise"
        className="order-2 flex flex-[1_1_480px] flex-col justify-between gap-12 bg-sign px-8 py-12 text-white md:order-1 md:px-16"
      >
        <Logo onSign />
        <div className="flex max-w-[520px] flex-col gap-8">
          <h2 className="text-4xl leading-[1.08] font-extrabold tracking-[-0.025em] text-white md:text-[52px]">
            Plan the trip together. Skip the group-chat chaos.
          </h2>
          <ul className="flex flex-col gap-4.5">
            {POINTS.map((p) => (
              <li key={p.t} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-sign-raised text-white">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong className="font-bold text-white">{p.t}</strong>
                  <span className="text-[15px] text-sign-ink-soft">{p.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-sign-ink-soft">
          An open-source portfolio project · React, GraphQL, PostgreSQL
        </p>
      </section>
    </div>
  );
}
