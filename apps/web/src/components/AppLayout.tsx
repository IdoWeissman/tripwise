import { useQuery } from '@apollo/client/react';
import { Navigate, Outlet } from 'react-router';
import { MeDocument } from '../lib/session';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { Skeleton } from './States';

/** Authenticated shell: top bar + routed content. */
export function AppLayout() {
  const { data, loading } = useQuery(MeDocument);

  if (loading) return <Skeleton className="m-8 h-24" />;
  if (!data?.me) return <Navigate to="/sign-in" replace />;

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-4 py-4 sm:px-8">
        <Logo />
        <Avatar name={data.me.name} index={0} size="lg" />
      </header>
      <Outlet />
    </div>
  );
}
