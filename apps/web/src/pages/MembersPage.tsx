import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Bits';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CheckIcon, CopyIcon } from '../components/Icons';
import { SelectField } from '../components/Fields';
import { Select } from '../components/Select';
import { useToast } from '../components/Toast';
import { graphql } from '../gql';
import type { TripRole } from '../gql/graphql';
import { messageFromError } from '../lib/errors';
import { useTrip, type TripShell } from '../lib/trip';

const CreateInviteDocument = graphql(`
  mutation CreateInvite($tripId: ID!, $role: TripRole!) {
    createInviteLink(tripId: $tripId, role: $role)
  }
`);

const UpdateRoleDocument = graphql(`
  mutation UpdateMemberRole($tripId: ID!, $userId: ID!, $role: TripRole!) {
    updateMemberRole(tripId: $tripId, userId: $userId, role: $role) {
      role
    }
  }
`);

const RemoveMemberDocument = graphql(`
  mutation RemoveMember($tripId: ID!, $userId: ID!) {
    removeMember(tripId: $tripId, userId: $userId)
  }
`);

const ROLE_LABEL: Record<TripRole, string> = { OWNER: 'Owner', EDITOR: 'Editor', VIEWER: 'Viewer' };
type Member = TripShell['members'][number];

export function MembersPage() {
  const { trip, viewerId, isOwner } = useTrip();
  const toast = useToast();
  const navigate = useNavigate();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [updateRole] = useMutation(UpdateRoleDocument, {
    refetchQueries: ['TripShell'],
    onError: (e) => toast(messageFromError(e), 'error'),
  });
  const [removeMember, { loading: removingBusy }] = useMutation(RemoveMemberDocument, {
    refetchQueries: ['TripShell'],
  });

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await removeMember({ variables: { tripId: trip.id, userId: removing.user.id } });
      const self = removing.user.id === viewerId;
      setRemoving(null);
      if (self) navigate('/');
      else toast(`${removing.user.name} was removed from the trip.`);
    } catch (e) {
      toast(messageFromError(e), 'error');
    }
  };

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <PageHeader
        title="Members"
        subtitle="Owners manage the trip. Editors add and vote. Viewers can only look."
      />

      {isOwner && <InviteCard tripId={trip.id} />}

      <section
        aria-label="People on this trip"
        className="rounded-card border border-border bg-surface py-2"
      >
        <h2 className="px-6 py-3.5 text-[17px] font-bold">On this trip · {trip.members.length}</h2>
        <ul>
          {trip.members.map((m, index) => {
            const isSelf = m.user.id === viewerId;
            const locked = !isOwner || m.role === 'OWNER';
            return (
              <li
                key={m.user.id}
                className="flex flex-wrap items-center gap-3.5 border-t border-surface-muted px-6 py-3.5"
              >
                <Avatar name={m.user.name} index={index} size="lg" />
                <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">
                    {m.user.name}
                    {isSelf && ' (you)'}
                  </span>
                  <span className="truncate text-[13px] text-ink-muted">{m.user.email}</span>
                </span>
                <Select
                  size="sm"
                  className="w-32"
                  aria-label={`Role for ${m.user.name}`}
                  value={m.role}
                  disabled={locked}
                  onValueChange={(role) =>
                    void updateRole({ variables: { tripId: trip.id, userId: m.user.id, role } })
                  }
                  options={[
                    ...(m.role === 'OWNER'
                      ? [{ value: 'OWNER' as const, label: ROLE_LABEL.OWNER }]
                      : []),
                    { value: 'EDITOR' as const, label: ROLE_LABEL.EDITOR },
                    { value: 'VIEWER' as const, label: ROLE_LABEL.VIEWER },
                  ]}
                />
                {((isOwner && !isSelf) || (isSelf && m.role !== 'OWNER')) && (
                  <Button
                    variant="destructive"
                    className="min-h-11 px-3 text-sm"
                    onClick={() => setRemoving(m)}
                  >
                    {isSelf ? 'Leave' : 'Remove'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {removing && (
        <ConfirmDialog
          title={
            removing.user.id === viewerId ? 'Leave this trip?' : `Remove ${removing.user.name}?`
          }
          body={
            removing.user.id === viewerId
              ? 'You will lose access until someone invites you again.'
              : `${removing.user.name} will lose access to this trip. Their balance must be settled first.`
          }
          confirmLabel={removing.user.id === viewerId ? 'Leave trip' : 'Remove'}
          busy={removingBusy}
          onClose={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </div>
  );
}

function InviteCard({ tripId }: { tripId: string }) {
  const [role, setRole] = useState<TripRole>('EDITOR');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [create, { loading, error }] = useMutation(CreateInviteDocument);

  const generate = async () => {
    const res = await create({ variables: { tripId, role } }).catch(() => null);
    const token = res?.data?.createInviteLink;
    if (token) {
      setLink(`${window.location.origin}/join/${token}`);
      setCopied(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      aria-label="Invite people"
      className="flex flex-col gap-5 rounded-card border border-border bg-surface p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-bold">Invite people</h2>
        <p className="text-[13px] text-ink-muted">Anyone with the link can join for 7 days.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <SelectField<TripRole>
            label="Role"
            value={role}
            onValueChange={(r) => {
              setRole(r);
              setLink(null);
            }}
            options={[
              { value: 'EDITOR', label: 'Editor' },
              { value: 'VIEWER', label: 'Viewer' },
            ]}
          />
        </div>
        <Button onClick={() => void generate()} disabled={loading}>
          {link ? 'New link' : 'Create invite link'}
        </Button>
      </div>
      {link && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Invite link
          <span className="flex flex-wrap gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="h-11 min-w-0 flex-[1_1_260px] rounded-control border border-border-input bg-bg px-3 text-sm font-normal text-ink-secondary"
            />
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-negative-ink">
          {messageFromError(error)}
        </p>
      )}
    </section>
  );
}
