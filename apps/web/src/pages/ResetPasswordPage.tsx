import { useMutation, useQuery } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { AuthLayout, authInputCls } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { ErrorState, Skeleton } from '../components/States';
import { graphql } from '../gql';
import { afterAuthPath } from '../lib/authRedirect';
import { codeFromError, messageFromError } from '../lib/errors';
import { MeDocument } from '../lib/session';

const PasswordResetPreviewDocument = graphql(`
  query PasswordResetPreview($token: String!) {
    passwordResetPreview(token: $token) {
      email
    }
  }
`);

const ResetPasswordDocument = graphql(`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password) {
      user {
        id
      }
    }
  }
`);

/** Same rule as sign-up and the API. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Reset password — rules §2 · 16. Opened from the emailed reset link: choose a new password
 * (typed twice), then you're signed in here and signed out everywhere else.
 */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const preview = useQuery(PasswordResetPreviewDocument, {
    variables: { token },
    fetchPolicy: 'network-only',
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [reset, { loading, error }] = useMutation(ResetPasswordDocument, {
    refetchQueries: [{ query: MeDocument }],
    awaitRefetchQueries: true,
  });

  const email = preview.data?.passwordResetPreview?.email ?? params.get('email') ?? '';
  const newLink = `/forgot-password${email ? `?${new URLSearchParams({ email })}` : ''}`;
  const spent =
    (preview.data && !preview.data.passwordResetPreview) ||
    codeFromError(error) === 'INVALID_RESET_LINK';

  if (preview.loading && !preview.data) {
    return (
      <AuthLayout label="Reset password">
        <div aria-busy="true" className="flex flex-col gap-5">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </AuthLayout>
    );
  }
  if (preview.error) {
    return (
      <AuthLayout label="Reset password">
        <ErrorState message="We couldn't check this link." onRetry={() => void preview.refetch()} />
      </AuthLayout>
    );
  }
  if (spent) {
    return (
      <AuthLayout label="Reset password">
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-sm font-extrabold tracking-[-0.02em]">
            This link has expired or was already used
          </h1>
          <p className="text-[15px] text-ink-muted">
            Reset links work once, for 30 minutes. Send yourself a new one.
          </p>
        </div>
        <Button className="h-12" onClick={() => navigate(newLink)}>
          Send a new link
        </Button>
        <Link to="/sign-in" className="flex min-h-11 items-center justify-center text-sm font-bold">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  const tooShort = password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const passwordError =
    tried && tooShort ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters` : null;
  const confirmError = (tried || mismatch) && confirm !== password ? "Passwords don't match" : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (tooShort || confirm !== password) return;
    const res = await reset({ variables: { token, password } }).catch(() => null);
    if (res?.data) navigate(afterAuthPath('signIn', params.get('next')), { replace: true });
  };

  return (
    <AuthLayout label="Reset password">
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-sm font-extrabold tracking-[-0.02em]">
            Choose a new password
          </h1>
          <p className="text-[15px] text-ink-muted">
            For <strong className="text-ink">{email}</strong>. You'll be signed out on every other
            device.
          </p>
        </div>
        {/* the account's email, so password managers save the new password against it */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          New password
          <PasswordInput
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? 'pw-error' : undefined}
            className={authInputCls}
          />
          {passwordError && (
            <span id="pw-error" className="text-[13px] font-normal text-negative-ink">
              {passwordError}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Confirm password
          <PasswordInput
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? 'confirm-error' : undefined}
            className={authInputCls}
          />
          {confirmError && (
            <span id="confirm-error" className="text-[13px] font-normal text-negative-ink">
              {confirmError}
            </span>
          )}
        </label>
        {error && codeFromError(error) !== 'INVALID_RESET_LINK' && (
          <p role="alert" className="text-sm text-negative-ink">
            {messageFromError(error)}
          </p>
        )}
        <Button type="submit" disabled={loading} className="h-12">
          {loading ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
