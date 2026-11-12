import { useMutation, useQuery } from '@apollo/client/react';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { TextField } from '../components/Fields';
import { AlertIcon, CheckIcon, ChevronLeftIcon, CopyIcon, PlusIcon } from '../components/Icons';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { graphql } from '../gql';
import { messageFromError } from '../lib/errors';
import { formatRelative } from '../lib/format';
import { setupSnippet, TOKEN_PLACEHOLDER, type McpClient as Client } from '../lib/mcp';

const ApiTokensQuery = graphql(`
  query ApiTokens {
    myApiTokens {
      id
      name
      prefix
      createdAt
      lastUsedAt
    }
  }
`);

const CreateApiTokenDocument = graphql(`
  mutation CreateApiToken($name: String!) {
    createApiToken(name: $name) {
      token
      apiToken {
        id
      }
    }
  }
`);

const RevokeApiTokenDocument = graphql(`
  mutation RevokeApiToken($id: ID!) {
    revokeApiToken(id: $id)
  }
`);

/** "Just now" / "Yesterday" read mid-sentence. */
const sentenceCase = (s: string) =>
  /^(Just|Yesterday)/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;

const WHERE: Record<Client, string> = {
  'claude-code': 'Run this in a terminal.',
  'claude-desktop':
    'Settings → Developer → Edit config, add this to claude_desktop_config.json, then restart Claude.',
  cursor: 'Add this to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).',
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** Read-only value + Copy. The label names only the input (the button has its own name). */
function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="h-11 min-w-0 flex-[1_1_260px] rounded-control border border-border-input bg-bg px-3 font-mono text-[13px] text-ink"
        />
        <CopyButton text={value} label={label.toLowerCase()} />
      </div>
    </div>
  );
}

function CreateTokenDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [create, { loading, error }] = useMutation(CreateApiTokenDocument, {
    refetchQueries: ['ApiTokens'],
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await create({ variables: { name: name.trim() } }).catch(() => null);
    const created = res?.data?.createApiToken.token;
    if (created) {
      setToken(created);
      onCreated(created);
    }
  };

  return (
    <Dialog open onClose={onClose} title={token ? 'Copy your token' : 'Create a token'}>
      <div className="flex flex-col gap-5">
        {token ? (
          <>
            <p className="flex items-start gap-2 rounded-control border border-attention bg-attention/40 px-4 py-3 text-sm text-attention-ink">
              <AlertIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              Copy it now — you won't be able to see it again. Anyone with it can read and add to
              your trips.
            </p>
            <CopyField label="Token" value={token} />
            <p className="text-sm text-ink-muted">
              The setup steps on this page now include it, ready to copy.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
            <TextField
              label="Name"
              hint="Where you'll use it, so you can tell tokens apart."
              placeholder="e.g. Claude Desktop on my laptop"
              value={name}
              maxLength={60}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              error={error ? messageFromError(error) : null}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !name.trim()}>
                Create token
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}

export function AiAssistantsPage() {
  const { data, loading, error, refetch } = useQuery(ApiTokensQuery);
  const [revoke, { loading: revoking }] = useMutation(RevokeApiTokenDocument, {
    refetchQueries: ['ApiTokens'],
  });
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<{ id: string; name: string } | null>(null);
  const [client, setClient] = useState<Client>('claude-code');
  const url = `${window.location.origin}/mcp`;
  const tokens = data?.myApiTokens ?? [];
  const snippet = setupSnippet(client, url, newToken ?? undefined);

  return (
    <main className="mx-auto flex max-w-[880px] flex-col gap-8 px-4 pt-8 pb-16 sm:px-8 sm:pt-12">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-ink-secondary no-underline hover:text-ink"
      >
        <ChevronLeftIcon size={16} aria-hidden="true" />
        Your trips
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] md:text-[34px]">
          Connect an AI assistant
        </h1>
        <p className="text-[15px] text-ink-secondary">
          Ask Claude, Cursor or any MCP client about your trips — what's next, who owes whom — and
          let it add bookings, ideas and expenses for you.
        </p>
      </div>

      {/* 1. Tokens */}
      <section
        aria-labelledby="tokens-heading"
        className="flex min-w-0 flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="tokens-heading" className="text-[17px] font-bold">
              1. Create a token
            </h2>
            <p className="text-[13px] text-ink-muted">
              Each assistant gets its own token. It acts as you, with your role on each trip.
            </p>
          </div>
          {tokens.length > 0 && (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              Create token
            </Button>
          )}
        </div>

        {loading && !data && <Skeleton className="h-[72px]" />}
        {error && (
          <ErrorState
            message="We couldn't load your tokens."
            onRetry={() => void refetch().catch(() => undefined)}
          />
        )}
        {data && tokens.length === 0 && (
          <EmptyState
            title="No tokens yet"
            body="Create one to connect your first assistant."
            action={
              <Button className="mt-2" onClick={() => setCreating(true)}>
                <PlusIcon />
                Create token
              </Button>
            }
          />
        )}
        {tokens.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold break-words">{t.name}</span>
                    <span className="rounded-chip bg-surface-muted px-2 py-0.5 font-mono text-xs font-bold text-ink-secondary">
                      {t.prefix}…
                    </span>
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    Created {sentenceCase(formatRelative(t.createdAt))} ·{' '}
                    {t.lastUsedAt
                      ? `Last used ${sentenceCase(formatRelative(t.lastUsedAt))}`
                      : 'Never used'}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setToRevoke({ id: t.id, name: t.name })}
                  aria-label={`Revoke ${t.name}`}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Setup */}
      <section
        aria-labelledby="setup-heading"
        className="flex min-w-0 flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="setup-heading" className="text-[17px] font-bold">
            2. Add Tripwise to your assistant
          </h2>
          <p className="text-[13px] text-ink-muted">
            {newToken
              ? 'Your new token is filled in below.'
              : `Replace ${TOKEN_PLACEHOLDER} with the token you created.`}
          </p>
        </div>

        <CopyField label="Server URL" value={url} />

        <Segmented<Client>
          label="Assistant"
          value={client}
          onChange={setClient}
          className="self-start max-sm:self-stretch max-sm:[&>button]:px-2"
          options={[
            { value: 'claude-code', label: 'Claude Code' },
            { value: 'claude-desktop', label: 'Claude Desktop' },
            { value: 'cursor', label: 'Cursor' },
          ]}
        />

        <div role="tabpanel" aria-label={`${client} setup`} className="flex flex-col gap-2">
          <p className="text-sm text-ink-secondary">{WHERE[client]}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-control border border-border bg-bg p-4 font-mono text-[13px] leading-relaxed text-ink">
              <code>{snippet}</code>
            </pre>
            <CopyButton text={snippet} label="setup" />
          </div>
        </div>
      </section>

      {/* 3. Capabilities */}
      <section
        aria-labelledby="can-heading"
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <h2 id="can-heading" className="text-[17px] font-bold">
          What your assistant can do
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Read</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-secondary">
              <li>Your trips, members and what's up next</li>
              <li>The day-by-day itinerary</li>
              <li>Bookings and their details</li>
              <li>Proposals and votes</li>
              <li>Expenses, balances and who owes whom</li>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Add</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-secondary">
              <li>Bookings, typed or read from a pasted confirmation</li>
              <li>Activity ideas for the group to vote on</li>
              <li>Your votes</li>
              <li>Expenses split equally</li>
            </ul>
          </div>
        </div>
        <p className="text-[13px] text-ink-muted">
          It can't delete anything, and on trips where you're a viewer it can only read.
        </p>
      </section>

      {creating && <CreateTokenDialog onClose={() => setCreating(false)} onCreated={setNewToken} />}
      {toRevoke && (
        <ConfirmDialog
          title={`Revoke "${toRevoke.name}"?`}
          body="Assistants using this token lose access right away. This can't be undone."
          confirmLabel="Revoke token"
          busy={revoking}
          onClose={() => setToRevoke(null)}
          onConfirm={async () => {
            try {
              await revoke({ variables: { id: toRevoke.id } });
              toast(`Revoked "${toRevoke.name}".`);
              setNewToken(null);
            } catch (err) {
              toast(messageFromError(err), 'error');
            }
            setToRevoke(null);
          }}
        />
      )}
    </main>
  );
}
