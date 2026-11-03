import { useMutation, useQuery } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { PageHeader, ProgressBar } from '../components/Bits';
import { Button } from '../components/Button';
import { TextAreaField, SelectField, TextField } from '../components/Fields';
import { ChevronUpIcon, PlusIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { graphql } from '../gql';
import type { ActivityStatus, ProposalsQuery } from '../gql/graphql';
import { messageFromError } from '../lib/errors';
import { formatDay, formatMoney, formatRelative, toNumber } from '../lib/format';
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
  const { trip, canEdit, isOwner } = useTrip();
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
        {data?.trip?.proposals.length === 0 && (
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

        {data?.trip?.proposals.map((p) => {
          const remaining = Math.max(0, threshold - p.voteCount);
          const open = p.status === 'PROPOSED';
          return (
            <article
              key={p.id}
              className="flex gap-4 rounded-card border border-border bg-surface p-4 sm:gap-5 sm:p-5"
            >
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label={`Vote for ${p.title}`}
                  aria-pressed={p.viewerHasVoted}
                  disabled={!canEdit || !open}
                  onClick={() => vote(p)}
                  className={`flex size-11 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    p.viewerHasVoted
                      ? 'border-accent bg-accent text-white'
                      : 'border-border-input bg-surface text-ink-secondary hover:bg-surface-muted'
                  }`}
                >
                  <ChevronUpIcon size={20} />
                </button>
                <span className="text-lg font-bold tabular-nums">{p.voteCount}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[17px] font-bold">{p.title}</h2>
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
                  <p className="text-sm leading-relaxed text-ink-secondary">{p.description}</p>
                )}
                {open && (
                  <div className="flex items-center gap-3">
                    <ProgressBar
                      value={p.voteCount}
                      max={threshold}
                      label="Votes toward threshold"
                    />
                    <span className="text-[13px] font-semibold text-ink-muted">
                      {remaining} more to accept
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px] text-ink-muted">
                    <Avatar name={p.createdBy.name} index={avatarIndex(p.createdBy.id)} size="sm" />
                    Proposed by {p.createdBy.name} · {formatRelative(p.createdAt)}
                  </span>
                  {isOwner && open && (
                    <Button
                      variant="destructive"
                      className="min-h-10 px-3 text-sm"
                      onClick={() => void decline({ variables: { activityId: p.id } })}
                    >
                      Decline
                    </Button>
                  )}
                </div>
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
          label="Est. cost pp"
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
