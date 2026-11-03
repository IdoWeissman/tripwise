import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { graphql } from '../gql';
import { MeDocument } from '../lib/session';

const SignInMutation = graphql(`
  mutation SignIn($input: SignInInput!) {
    signIn(input: $input) {
      user {
        id
        name
        email
      }
    }
  }
`);

const DEMO = { email: 'demo@tripwise.app', password: 'tripwise-demo' };

const POINTS = [
  { t: 'One shared itinerary', d: 'Drag activities between days. Everyone sees changes live.' },
  { t: 'Vote on ideas', d: 'Proposals with enough votes land on the plan automatically.' },
  { t: 'Split costs fairly', d: 'Log expenses and settle up in as few payments as possible.' },
];

const inputCls =
  'h-12 rounded-control border border-border-input bg-surface px-3.5 text-[15px] font-normal text-ink';

export function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signIn, { loading, error }] = useMutation(SignInMutation, {
    refetchQueries: [{ query: MeDocument }],
    awaitRefetchQueries: true,
    onCompleted: () => navigate('/'),
  });

  const submit = (input: { email: string; password: string }) =>
    void signIn({ variables: { input } });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit({ email, password });
  };

  return (
    <div className="flex min-h-screen flex-wrap bg-surface">
      {/* Form first on mobile (rules §2 · Sign in) */}
      <section
        aria-label="Sign in"
        className="order-1 flex flex-[1_1_480px] items-center justify-center px-8 py-12 md:order-2"
      >
        <form onSubmit={onSubmit} className="flex w-full max-w-[400px] flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-bold tracking-[-0.02em]">Welcome back</h1>
            <p className="text-[15px] text-ink-muted">Sign in to see your trips.</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputCls}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-negative-ink">
              {error.message}
            </p>
          )}
          <Button type="submit" disabled={loading} className="h-12">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
          <div className="flex items-center gap-3 text-[13px] text-ink-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="secondary"
            className="h-12"
            disabled={loading}
            onClick={() => submit(DEMO)}
          >
            Explore with the demo account
          </Button>
        </form>
      </section>

      <section
        aria-label="About Tripwise"
        className="order-2 flex flex-[1_1_480px] flex-col justify-between gap-12 bg-accent-tint px-8 py-12 md:order-1 md:px-16"
      >
        <Logo />
        <div className="flex max-w-[520px] flex-col gap-8">
          <h2 className="text-4xl leading-[1.12] font-bold tracking-[-0.025em] text-accent-deep md:text-[44px]">
            Plan the trip together. Skip the group-chat chaos.
          </h2>
          <ul className="flex flex-col gap-4.5">
            {POINTS.map((p) => (
              <li key={p.t} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface text-accent">
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
                  <strong className="font-semibold text-accent-deep">{p.t}</strong>
                  <span className="text-[15px] text-[#33524f]">{p.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-[#33524f]">
          An open-source portfolio project · React, GraphQL, PostgreSQL
        </p>
      </section>
    </div>
  );
}
