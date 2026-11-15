import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AuthLayout, authInputCls } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { graphql } from '../gql';
import { codeFromError, messageFromError } from '../lib/errors';

const RequestPasswordResetDocument = graphql(`
  mutation RequestPasswordReset($email: String!, $next: String) {
    requestPasswordReset(email: $email, next: $next)
  }
`);

/**
 * Forgot password — rules §2 · 16. Asks for the account's email and sends a reset link. Errors
 * name the problem: no account, too many emails this hour, or email not available.
 */
export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [request, { loading, error }] = useMutation(RequestPasswordResetDocument);
  const back = `/sign-in${params.get('next') ? `?${new URLSearchParams({ next: params.get('next')! })}` : ''}`;

  const send = async (address: string) => {
    // `next` rides through the emailed link, so an invited friend still lands on their trip.
    const res = await request({
      variables: { email: address.trim(), next: params.get('next') },
    }).catch(() => null);
    if (res?.data?.requestPasswordReset) setSentTo(address.trim());
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(email);
  };

  if (sentTo) {
    return (
      <AuthLayout label="Check your email">
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-sm font-extrabold tracking-[-0.02em]">Check your email</h1>
          <p className="text-[15px] text-ink-muted" role="status">
            We've sent a reset link to <strong className="text-ink">{sentTo}</strong>. It works for
            30 minutes.
          </p>
        </div>
        <p className="text-sm text-ink-muted">
          Didn't get it? Check your spam folder, or send it again.
        </p>
        {error && (
          <p role="alert" className="text-sm text-negative-ink">
            {messageFromError(error)}
          </p>
        )}
        <Button
          variant="secondary"
          className="h-12"
          disabled={loading}
          onClick={() => void send(sentTo)}
        >
          {loading ? 'Sending…' : 'Send it again'}
        </Button>
        <Link to={back} className="flex min-h-11 items-center justify-center text-sm font-bold">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  const code = codeFromError(error);
  return (
    <AuthLayout label="Forgot password">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-sm font-extrabold tracking-[-0.02em]">
            Forgot your password?
          </h1>
          <p className="text-[15px] text-ink-muted">
            Enter your account's email and we'll send you a link to choose a new one.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={code === 'ACCOUNT_NOT_FOUND' ? true : undefined}
            className={authInputCls}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-negative-ink">
            {messageFromError(error)}{' '}
            {code === 'ACCOUNT_NOT_FOUND' && (
              <Link
                to={`/sign-up?${new URLSearchParams({ ...(params.get('next') ? { next: params.get('next')! } : {}) })}`}
                className="font-bold"
              >
                Create an account
              </Link>
            )}
          </p>
        )}
        <Button type="submit" disabled={loading || !email.trim()} className="h-12">
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
        <Link to={back} className="flex min-h-11 items-center justify-center text-sm font-bold">
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
