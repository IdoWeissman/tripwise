import { useMutation, useQuery } from '@apollo/client/react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { EmptyState, Skeleton } from '../components/States';
import { graphql } from '../gql';
import { messageFromError } from '../lib/errors';
import { MeDocument } from '../lib/session';

const InvitePreviewDocument = graphql(`
  query InvitePreview($token: String!) {
    me {
      id
    }
    invitePreview(token: $token) {
      tripId
      tripName
      destination
      role
      invitedBy
      alreadyMember
    }
  }
`);

const JoinTripDocument = graphql(`
  mutation JoinTrip($token: String!) {
    joinTrip(token: $token) {
      id
    }
  }
`);

/** Landing page for invite links: /join/:token */
export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useQuery(InvitePreviewDocument, { variables: { token } });
  const [join, { loading: joining, error }] = useMutation(JoinTripDocument, {
    refetchQueries: [{ query: MeDocument }],
  });
  const next = encodeURIComponent(`/join/${token}`);
  const invite = data?.invitePreview;

  return (
    <div className="flex min-h-screen flex-col items-center gap-10 bg-bg px-4 py-10">
      <Logo />
      <main className="w-full max-w-[440px]">
        {loading && !data ? (
          <Skeleton className="h-64" />
        ) : !invite ? (
          <EmptyState
            title="This invite link doesn't work"
            body="It may have expired. Ask the trip owner for a new link."
            action={
              <Link to="/" className="font-semibold text-accent">
                Go to Tripwise
              </Link>
            }
          />
        ) : (
          <section className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6 text-center">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-muted">{invite.invitedBy} invited you to</p>
              <h1 className="text-[28px] font-bold tracking-[-0.02em]">{invite.tripName}</h1>
              <p className="text-[15px] text-ink-secondary">
                {invite.destination} · as {invite.role === 'EDITOR' ? 'an Editor' : 'a Viewer'}
              </p>
            </div>
            {invite.alreadyMember ? (
              <Link
                to={`/trips/${invite.tripId}`}
                className="flex min-h-12 items-center justify-center rounded-control bg-accent font-semibold text-white no-underline"
              >
                Open trip
              </Link>
            ) : data?.me ? (
              <Button
                className="h-12"
                disabled={joining}
                onClick={() =>
                  void join({ variables: { token } })
                    .then((res) => res.data && navigate(`/trips/${res.data.joinTrip.id}`))
                    .catch(() => {})
                }
              >
                {joining ? 'Joining…' : 'Join trip'}
              </Button>
            ) : (
              <div className="flex flex-col gap-3">
                <Link
                  to={`/sign-up?next=${next}`}
                  className="flex min-h-12 items-center justify-center rounded-control bg-accent font-semibold text-white no-underline"
                >
                  Create an account to join
                </Link>
                <Link
                  to={`/sign-in?next=${next}`}
                  className="flex min-h-12 items-center justify-center rounded-control border border-border-input font-semibold text-ink no-underline"
                >
                  I already have an account
                </Link>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-negative-ink">
                {messageFromError(error)}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
