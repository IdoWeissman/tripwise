import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../components/Button';
import { AuthLayout, authInputCls as inputCls } from '../components/AuthLayout';
import { PasswordInput } from '../components/PasswordInput';
import { graphql } from '../gql';
import { afterAuthPath, safeNext } from '../lib/authRedirect';
import { codeFromError, messageFromError } from '../lib/errors';
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

const SignUpMutation = graphql(`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      user {
        id
        name
        email
      }
    }
  }
`);

const DEMO = { email: 'demo@tripwise.app', password: 'tripwise-demo' };

export function SignInPage({ mode = 'signIn' }: { mode?: 'signIn' | 'signUp' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const isSignUp = mode === 'signUp';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const options = {
    refetchQueries: [{ query: MeDocument }],
    awaitRefetchQueries: true,
    onCompleted: () => navigate(afterAuthPath(mode, params.get('next'))),
  };
  const [signIn, signInState] = useMutation(SignInMutation, options);
  const [signUp, signUpState] = useMutation(SignUpMutation, options);
  const loading = signInState.loading || signUpState.loading;
  const error = isSignUp ? signUpState.error : signInState.error;

  const submit = (input: { email: string; password: string }) =>
    void signIn({ variables: { input } }).catch(() => {});
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isSignUp) void signUp({ variables: { input: { name, email, password } } }).catch(() => {});
    else submit({ email, password });
  };
  const switchHref = `${isSignUp ? '/sign-in' : '/sign-up'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;
  // The reset screens carry the typed email (and where to go after) so nothing is retyped.
  const forgotHref = `/forgot-password?${new URLSearchParams({
    ...(email.trim() ? { email: email.trim() } : {}),
    ...(params.get('next') ? { next } : {}),
  })}`;
  const accountExists = isSignUp && codeFromError(error) === 'ACCOUNT_EXISTS';
  // Only a wrong email/password points at a reset — not a network error.
  const wrongCredentials = !isSignUp && codeFromError(error) === 'BAD_USER_INPUT';

  return (
    <AuthLayout label={isSignUp ? 'Create account' : 'Sign in'}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-sm font-extrabold tracking-[-0.02em]">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-[15px] text-ink-muted">
            {isSignUp ? 'Start planning trips with your friends.' : 'Sign in to see your trips.'}
          </p>
        </div>
        {isSignUp && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Name
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What friends call you"
              className={inputCls}
            />
          </label>
        )}
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
          <PasswordInput
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={inputCls}
          />
        </label>
        {/* after a failed sign-in the error carries this link instead */}
        {!isSignUp && !error && (
          <Link
            to={forgotHref}
            className="-mt-3 flex min-h-11 items-center self-end text-[13px] font-bold"
          >
            Forgot password?
          </Link>
        )}
        {error && (
          <p role="alert" className="text-sm text-negative-ink">
            {messageFromError(error)} {/* the two dead ends offer the way out (rules §2 · 01) */}
            {accountExists ? (
              <>
                <Link to={switchHref} className="font-bold">
                  Sign in
                </Link>{' '}
                ·{' '}
                <Link to={forgotHref} className="font-bold">
                  Reset your password
                </Link>
              </>
            ) : (
              wrongCredentials && (
                <Link to={forgotHref} className="font-bold">
                  Forgot password?
                </Link>
              )
            )}
          </p>
        )}
        <Button type="submit" disabled={loading} className="h-12">
          {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
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
        <p className="text-center text-sm text-ink-muted">
          {isSignUp ? 'Already have an account? ' : 'New to Tripwise? '}
          <Link to={switchHref} className="font-semibold text-accent">
            {isSignUp ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
