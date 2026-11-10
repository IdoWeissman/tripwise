import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { graphql } from '../gql';
import { MeDocument } from '../lib/session';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Logo } from './Logo';
import { Skeleton } from './States';

const SignOutDocument = graphql(`
  mutation SignOut {
    signOut
  }
`);

/** Requires a session; renders nested routes. */
export function RequireAuth() {
  const { data, loading } = useQuery(MeDocument);
  const location = useLocation();
  if (loading && !data) return <Skeleton className="m-8 h-24" />;
  if (!data?.me)
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}

/** Dashboard shell: top bar + routed content. */
export function AppLayout() {
  const { data } = useQuery(MeDocument);
  const client = useApolloClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [signOut] = useMutation(SignOutDocument);
  const me = data?.me;

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-4 py-4 sm:px-8">
        <Logo />
        {me && (
          <div className="flex items-center gap-3">
            <Link
              to="/settings/ai"
              aria-current={location.pathname === '/settings/ai' ? 'page' : undefined}
              className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-ink-secondary no-underline hover:bg-surface-muted aria-[current=page]:text-accent-strong"
            >
              AI assistants
            </Link>
            <Button
              variant="ghost"
              className="text-sm"
              onClick={async () => {
                await signOut();
                await client.clearStore();
                navigate('/sign-in');
              }}
            >
              Sign out
            </Button>
            <Avatar name={me.name} index={0} size="lg" />
          </div>
        )}
      </header>
      <Outlet />
    </div>
  );
}
