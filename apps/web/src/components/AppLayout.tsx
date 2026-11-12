import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { graphql } from '../gql';
import { MeDocument } from '../lib/session';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { SparkleIcon } from './Icons';
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
      <header className="flex items-center justify-between gap-2 bg-sign px-4 py-3 text-white sm:px-8">
        <Logo onSign />
        {me && (
          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              to="/settings/ai"
              aria-current={location.pathname === '/settings/ai' ? 'page' : undefined}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-3 text-sm sm:px-4 font-bold text-white no-underline hover:bg-white/10 hover:text-white aria-[current=page]:bg-sign-raised"
            >
              <SparkleIcon size={16} className="text-signal sm:hidden" />
              <span className="max-sm:sr-only">AI assistants</span>
            </Link>
            <Button
              variant="ghost"
              className="text-sm text-white hover:bg-white/10"
              onClick={async () => {
                await signOut();
                await client.clearStore();
                navigate('/sign-in');
              }}
            >
              Sign out
            </Button>
            <span className="hidden sm:block">
              <Avatar name={me.name} index={0} size="lg" />
            </span>
          </div>
        )}
      </header>
      <Outlet />
    </div>
  );
}
