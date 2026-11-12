import { useMutation, useQuery } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Bits';
import { Button } from '../components/Button';
import { TextAreaField, SelectField, TextField } from '../components/Fields';
import { CheckIcon, ChevronUpIcon, PlusIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { graphql } from '../gql';
import type { ActivityStatus, ProposalsQuery } from '../gql/graphql';
import { messageFromError } from '../lib/errors';
import { currencySymbol, formatDay, formatMoney, formatRelative, toNumber } from '../lib/format';
import { useMemberIndexOf, useTrip } from '../lib/trip';

const ProposalsDocument = graphql(`
  query Proposals($id: ID!, $status: ActivityStatus!) {
    trip(id: $id) {
      id
      voteThreshold
      proposalCounts {
        proposed
        scheduled
        declined
      }
      days {
        id
        position
        date
      }
      proposals(status: $status) {
        id
        title
        description
        location
        costPerPerson
        status
        createdAt
        voteCount
        viewerHasVoted
        voters {
          id
          name
        }
        createdBy {
          id
          name
        }
      }
    }
  }
`);

const ToggleVoteDocument = graphql(`
  mutation ToggleVote($activityId: ID!) {
    toggleVote(activityId: $activityId) {
      id
      voteCount
      viewerHasVoted
      voters {
        id
        name
      }
      status
    }
  }
`);

const DeclineDocument = graphql(`
  mutation DeclineActivity($activityId: ID!) {
    declineActivity(activityId: $activityId) {
      id
      status
    }
  }
`);

const ProposeDocument = graphql(`
  mutation Propose($input: ProposeActivityInput!) {
    proposeActivity(input: $input) {
      id
    }
  }
`);

const ANY_DAY = 'any';

type Proposal = NonNullable<ProposalsQuery['trip']>['proposals'][number];

const TABS: { value: ActivityStatus; label: string; key: 'proposed' | 'scheduled' | 'declined' }[] =
  [
    { value: 'PROPOSED', label: 'Open', key: 'proposed' },
    { value: 'SCHEDULED', label: 'Accepted', key: 'scheduled' },
    { value: 'DECLINED', label: 'Declined', key: 'declined' },
  ];

export function ProposalsPage() {
  const { trip, canEdit, isOwner, viewerId } = useTrip();
  const me = trip.members.find((m) => m.user.id === viewerId)?.user;
  const avatarIndex = useMemberIndexOf();
  const toast = useToast();
  const [status, setStatus] = useState<ActivityStatus>('PROPOSED');
  const [showForm, setShowForm] = useState(false);
  const { data, loading, error, refetch } = useQuery(ProposalsDocument, {
    variables: { id: trip.id, status },
  });

  const [toggleVote] = useMutation(ToggleVoteDocument, {
    refetchQueries: ['TripShell'],
    onCompleted: (res) => {
      if (res.toggleVote.status === 'SCHEDULED') {
        toast('Accepted — it’s on the itinerary now.');
        void refetch();
      }
    },
    onError: (err) => toast(messageFromError(err, "Couldn't save your vote."), 'error'),
  });
  const [decline] = useMutation(DeclineDocument, {
    refetchQueries: ['TripShell', 'Proposals'],
    onError: (err) => toast(messageFromError(err), 'error'),
  });

  const counts = data?.trip?.proposalCounts;
  // Activities are normalized in the cache, so an optimistic status change (accept by
  // vote, decline) removes the card from this tab instantly — no waiting, no flash.
  const proposals = (data?.trip?.proposals ?? []).filter((p) => p.status === status);
  const threshold = data?.trip?.voteThreshold ?? trip.voteThreshold;
  const days = data?.trip?.days ?? [];

  const vote = (p: Proposal) => {
    const voted = !p.viewerHasVoted;
    const voteCount = p.voteCount + (voted ? 1 : -1);
    void toggleVote({
      variables: { activityId: p.id },
      optimisticResponse: {
        __typename: 'Mutation',
        toggleVote: {
          __typename: 'Activity',
          id: p.id,
          voteCount,
          viewerHasVoted: voted,
          voters: voted
            ? [...p.voters, { __typename: 'User' as const, id: viewerId, name: me?.name ?? 'You' }]
            : p.voters.filter((v) => v.id !== viewerId),
          status: voteCount >= threshold ? 'SCHEDULED' : 'PROPOSED',
        },
      },
    });
  };

  const form = canEdit && (
    <ProposeForm
      tripId={trip.id}
      days={days}
      onDone={() => {
        setShowForm(false);
        setStatus('PROPOSED');
        void refetch();
      }}
    />
  );

  return (
    <div className="flex flex-wrap items-start gap-8">
      <section aria-label="Proposals" className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
        <PageHeader
          title="Proposals"
          subtitle={`Ideas need ${threshold} votes to land on the itinerary.`}
          actions={
            canEdit && (
              <Button
                className="lg:hidden"
                onClick={() => setShowForm((v) => !v)}
                aria-expanded={showForm}
              >
                <PlusIcon />
                Propose
              </Button>
            )
          }
        />
        {showForm && <div className="lg:hidden">{form}</div>}

        <div className="relative -mx-4 overflow-x-auto px-4">
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            className="w-max"
            options={TABS.map((t) => ({
              value: t.value,
              label: counts ? `${t.label} · ${counts[t.key]}` : t.label,
            }))}
          />
        </div>

        {error && (
          <ErrorState message="We couldn't load proposals." onRetry={() => void refetch()} />
        )}
        {loading &&
          !data &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40" />)}
        {data?.trip && proposals.length === 0 && (
          <EmptyState
            title={
              status === 'PROPOSED'
                ? 'No open proposals'
                : status === 'SCHEDULED'
                  ? 'Nothing accepted yet'
                  : 'Nothing declined'
            }
            body={
              status === 'PROPOSED'
                ? 'Propose an idea and let the group vote.'
                : 'Check back after the group votes.'
            }
          />
        )}

        {proposals.map((p) => {
          const remaining = Math.max(0, threshold - p.voteCount);
          const open = p.status === 'PROPOSED';
          return (
            <article
              key={p.id}
              className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-[17px] font-bold text-balance">{p.title}</h2>
                <span className="text-[13px] text-ink-muted">
                  {[
                    p.location,
                    p.costPerPerson &&
                      `${formatMoney(toNumber(p.costPerPerson), trip.currency)} pp`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {p.description && (
                <p className="max-w-[65ch] text-sm leading-relaxed text-ink-secondary">
                  {p.description}
                </p>
              )}

              {/* The group's decision, as faces: each vote takes a seat until the threshold is met. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-surface-muted pt-3">
                <VoteSeats
                  voters={p.voters}
                  seats={Math.max(threshold, p.voters.length)}
                  avatarIndex={avatarIndex}
                />
                <span className="flex min-w-0 flex-[1_1_180px] flex-col">
                  <span className="text-sm font-semibold">{voterLine(p.voters, viewerId)}</span>
                  <span className="text-[13px] text-ink-muted">
                    {open
                      ? remaining === 1
                        ? '1 more vote puts it on the plan'
                        : `${remaining} more votes put it on the plan`
                      : p.status === 'SCHEDULED'
                        ? 'On the itinerary'
                        : 'Declined'}
                  </span>
                </span>
                {open && (
                  <button
                    type="button"
                    aria-pressed={p.viewerHasVoted}
                    disabled={!canEdit}
                    onClick={() => vote(p)}
                    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-control border px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-ink-muted sm:w-auto ${
                      p.viewerHasVoted
                        ? 'border-accent bg-accent text-white hover:bg-accent-hover'
                        : 'border-border-input bg-surface text-ink hover:bg-surface-muted'
                    }`}
                  >
                    {p.viewerHasVoted ? <CheckIcon size={18} /> : <ChevronUpIcon size={18} />}
                    {p.viewerHasVoted ? 'Voted' : 'Vote'}
                    <span className="sr-only"> for {p.title}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] text-ink-muted">
                  <Avatar name={p.createdBy.name} index={avatarIndex(p.createdBy.id)} size="sm" />
                  Proposed by {p.createdBy.id === viewerId ? 'you' : p.createdBy.name} ·{' '}
                  {formatRelative(p.createdAt)}
                </span>
                {isOwner && open && (
                  <Button
                    variant="ghost"
                    className="min-h-11 px-3 text-sm hover:text-negative-ink"
                    onClick={() =>
                      void decline({
                        variables: { activityId: p.id },
                        optimisticResponse: {
                          __typename: 'Mutation',
                          declineActivity: {
                            __typename: 'Activity',
                            id: p.id,
                            status: 'DECLINED',
                          },
                        },
                      })
                    }
                  >
                    Decline
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {form && (
        <aside aria-label="New proposal" className="hidden flex-[1_1_300px] lg:block">
          {form}
        </aside>
      )}
    </div>
  );
}

type Voter = Proposal['voters'][number];

/** "No votes yet", "You voted", "Maya and you voted", "Ido, Maya and Noa voted". */
function voterLine(voters: Voter[], viewerId: string) {
  if (voters.length === 0) return 'No votes yet';
  // The viewer reads as "you", listed last so the group's names lead.
  const names = [
    ...voters.filter((v) => v.id !== viewerId).map((v) => v.name.split(' ')[0]!),
    ...(voters.some((v) => v.id === viewerId) ? ['you'] : []),
  ];
  const list =
    names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} voted`;
}

/** One seat per vote needed: voters' faces fill seats in voting order, open seats are dashed. */
function VoteSeats({
  voters,
  seats,
  avatarIndex,
}: {
  voters: Voter[];
  seats: number;
  avatarIndex: (userId: string) => number;
}) {
  return (
    <span
      role="img"
      aria-label={`${voters.length} of ${seats} votes`}
      className="flex shrink-0 items-center gap-1.5"
    >
      {Array.from({ length: seats }, (_, i) => {
        const v = voters[i];
        return v ? (
          <span key={v.id} className="motion-safe:animate-seat-in">
            <Avatar name={v.name} index={avatarIndex(v.id)} />
          </span>
        ) : (
          <span
            key={`seat-${i}`}
            className="size-8 rounded-full border-[1.5px] border-dashed border-border-input"
          />
        );
      })}
    </span>
  );
}

function ProposeForm({
  tripId,
  days,
  onDone,
}: {
  tripId: string;
  days: { id: string; position: number; date: string }[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [dayId, setDayId] = useState('');
  const [cost, setCost] = useState('');
  const [description, setDescription] = useState('');
  const { currency } = useTrip().trip;
  const toast = useToast();
  const [propose, { loading, error }] = useMutation(ProposeDocument, {
    refetchQueries: ['TripShell'],
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await propose({
        variables: {
          input: {
            tripId,
            title,
            dayId: dayId || null,
            costPerPerson: cost || null,
            description: description || null,
          },
        },
      });
      setTitle('');
      setDayId('');
      setCost('');
      setDescription('');
      toast('Proposal submitted for a vote.');
      onDone();
    } catch {
      /* error rendered below */
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6"
    >
      <h2 className="text-lg font-bold">Propose an activity</h2>
      <TextField
        label="Title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Surf lesson in Ericeira"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Day"
          value={dayId || ANY_DAY}
          onValueChange={(v) => setDayId(v === ANY_DAY ? '' : v)}
          options={[
            { value: ANY_DAY, label: 'Any day' },
            ...days.map((d) => ({
              value: d.id,
              label: `Day ${d.position + 1} · ${formatDay(d.date)}`,
            })),
          ]}
        />
        <TextField
          label={`Cost pp (${currencySymbol(currency)})`}
          inputMode="decimal"
          placeholder="0.00"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </div>
      <TextAreaField
        label="Why it's worth it"
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="A link, a note, a reason to say yes"
      />
      {error && (
        <p role="alert" className="text-sm text-negative-ink">
          {messageFromError(error)}
        </p>
      )}
      <Button type="submit" disabled={loading || !title.trim()}>
        {loading ? 'Submitting…' : 'Submit for a vote'}
      </Button>
    </form>
  );
}
