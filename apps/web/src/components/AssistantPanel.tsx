import { useApolloClient } from '@apollo/client/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import {
  ask,
  confirmSuggestion,
  describeSuggestion,
  fetchStatus,
  parseBlocks,
  parseInline,
  type AssistantStatus,
  type Source,
  type Suggestion,
} from '../lib/assistant';
import { Button } from './Button';
import { CheckIcon, CloseIcon, SendIcon, SparkleIcon } from './Icons';
import { EmptyState, ErrorState, Skeleton } from './States';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  suggestions?: (Suggestion & { state?: 'saving' | 'saved' | 'dismissed'; error?: string })[];
  status?: string | null;
  error?: string;
  pending?: boolean;
}

const STARTERS = [
  "What's next?",
  'Who owes whom?',
  "What's planned tomorrow?",
  'Where are we staying?',
];

interface Props {
  tripId: string;
  currency: string;
  canEdit: boolean;
  messages: ChatMessage[];
  setMessages: (update: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onClose: () => void;
}

/**
 * Trip assistant side panel — design rules §14. Non-modal on desktop (the trip stays usable
 * beside it), a full-screen sheet on phones.
 */
export function AssistantPanel({
  tripId,
  currency,
  canEdit,
  messages,
  setMessages,
  onClose,
}: Props) {
  const client = useApolloClient();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = messages.some((m) => m.pending);

  const loadStatus = useCallback(() => {
    setStatusError(false);
    fetchStatus(tripId)
      .then(setStatus)
      .catch(() => setStatusError(true));
  }, [tripId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [status?.enabled]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  const updateLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages
      .filter((m) => !m.error && m.text)
      .map((m) => ({ role: m.role, content: m.text }));
    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: q },
      {
        role: 'assistant',
        text: '',
        sources: [],
        suggestions: [],
        pending: true,
        status: 'Thinking…',
      },
    ]);
    abort.current = new AbortController();
    try {
      await ask(
        tripId,
        q,
        history,
        (e) => {
          if (e.type === 'status') updateLast((m) => ({ ...m, status: e.text }));
          if (e.type === 'text') updateLast((m) => ({ ...m, text: m.text + e.text, status: null }));
          if (e.type === 'source')
            updateLast((m) => ({ ...m, sources: [...(m.sources ?? []), e] }));
          if (e.type === 'suggestion')
            updateLast((m) => ({ ...m, suggestions: [...(m.suggestions ?? []), e] }));
          if (e.type === 'error') updateLast((m) => ({ ...m, error: e.message }));
        },
        abort.current.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError')
        updateLast((m) => ({ ...m, error: (err as Error).message }));
    }
    updateLast((m) => ({ ...m, pending: false, status: null }));
    setStatus((s) => (s ? { ...s, remaining: Math.max(0, s.remaining - 1) } : s));
    inputRef.current?.focus();
  }

  async function confirm(msgIndex: number, card: Suggestion) {
    const patch = (p: Partial<NonNullable<ChatMessage['suggestions']>[number]>) =>
      setMessages((prev) =>
        prev.map((m, i) =>
          i === msgIndex
            ? {
                ...m,
                suggestions: m.suggestions?.map((s) => (s.id === card.id ? { ...s, ...p } : s)),
              }
            : m,
        ),
      );
    patch({ state: 'saving', error: undefined });
    try {
      await confirmSuggestion(tripId, card);
      patch({ state: 'saved' });
      // Our own change doesn't come back over the live subscription: refresh what's on screen.
      void client.refetchQueries({ include: 'active' });
    } catch (err) {
      patch({ state: undefined, error: (err as Error).message });
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="assistant-title"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-50 flex flex-col bg-surface lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[420px] lg:border-l lg:border-border lg:shadow-popover"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <SparkleIcon className="text-accent" />
          <h2 id="assistant-title" className="text-[17px] font-bold">
            Trip assistant
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close assistant"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-control text-ink-secondary hover:bg-surface-muted"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite" aria-busy={busy}>
        {!status && !statusError && <Skeleton className="h-28" />}
        {statusError && (
          <ErrorState message="We couldn't reach the assistant." onRetry={loadStatus} />
        )}
        {status && !status.enabled && (
          <EmptyState
            title="The assistant is off"
            body="This server has no Claude API key. Set ANTHROPIC_API_KEY to turn it on."
          />
        )}
        {status?.enabled && messages.length === 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-secondary">
              Ask about bookings, plans, documents or money on this trip. Answers link to where they
              came from.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={status.remaining === 0}
                  className="min-h-11 rounded-full border border-border-input bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted disabled:opacity-60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="flex flex-col gap-5">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <li
                key={i}
                className="max-w-[85%] self-end rounded-card bg-accent-tint px-4 py-2.5 text-[15px] whitespace-pre-wrap text-accent-deep"
              >
                <span className="sr-only">You: </span>
                {m.text}
              </li>
            ) : (
              <li key={i} className="flex flex-col gap-3">
                <span className="sr-only">Assistant: </span>
                {m.text && <Answer text={m.text} sources={m.sources ?? []} tripId={tripId} />}
                {m.status && (
                  <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
                    <span
                      aria-hidden="true"
                      className="size-2 animate-pulse rounded-full bg-accent"
                    />
                    {m.status}
                  </p>
                )}
                {m.suggestions?.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    card={s}
                    currency={currency}
                    canEdit={canEdit}
                    onConfirm={() => void confirm(i, s)}
                    onDismiss={() =>
                      setMessages((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                suggestions: x.suggestions?.map((y) =>
                                  y.id === s.id ? { ...y, state: 'dismissed' } : y,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                ))}
                {m.sources && m.sources.length > 0 && !m.pending && (
                  <SourceList sources={m.sources} tripId={tripId} />
                )}
                {m.error && (
                  <p role="alert" className="text-sm text-negative-ink">
                    {m.error}
                  </p>
                )}
              </li>
            ),
          )}
        </ol>
        <div ref={endRef} />
      </div>

      {status?.enabled && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex flex-col gap-2 border-t border-border px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-end gap-2">
            <label htmlFor="assistant-input" className="sr-only">
              Ask about this trip
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about this trip…"
              disabled={status.remaining === 0}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-control border border-border-input bg-surface px-3 py-2.5 text-[15px] [field-sizing:content] placeholder:text-ink-muted"
            />
            <Button
              type="submit"
              aria-label="Send"
              className="px-3"
              disabled={busy || !input.trim() || status.remaining === 0}
            >
              <SendIcon />
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            {status.remaining === 0
              ? "You've used today's questions. They reset at midnight UTC."
              : `${status.remaining} of ${status.limit} questions left today · Answers can be wrong; check the source.`}
          </p>
        </form>
      )}
    </section>
  );
}

function Answer({ text, sources, tripId }: { text: string; sources: Source[]; tripId: string }) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const inline = (t: string) =>
    parseInline(t).map((part, i) => {
      if (part.kind === 'bold') return <strong key={i}>{part.text}</strong>;
      if (part.kind === 'text') return <span key={i}>{part.text}</span>;
      const src = byId.get(part.id);
      if (!src) return null;
      return (
        <Link
          key={i}
          to={`/trips/${tripId}/${src.path}`}
          title={src.title}
          aria-label={`Source: ${src.title}`}
          className="mx-0.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded-chip bg-surface-muted px-1.5 align-baseline text-xs font-semibold text-accent-strong no-underline hover:bg-accent-tint"
        >
          {part.id.slice(1)}
        </Link>
      );
    });
  return (
    <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-ink">
      {parseBlocks(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b.text)}
          </p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function SourceList({ sources, tripId }: { sources: Source[]; tripId: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-ink-muted">Sources</p>
      <ul className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <li key={s.id}>
            <Link
              to={`/trips/${tripId}/${s.path}`}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-control border border-border px-3 text-[13px] text-ink-secondary no-underline hover:bg-surface-muted"
            >
              <span className="font-semibold text-accent-strong">{s.id.slice(1)}</span>
              <span className="truncate">{s.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionCard({
  card,
  currency,
  canEdit,
  onConfirm,
  onDismiss,
}: {
  card: NonNullable<ChatMessage['suggestions']>[number];
  currency: string;
  canEdit: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (card.state === 'dismissed') return null;
  const { title, lines } = describeSuggestion(card, currency);
  return (
    <div className="flex flex-col gap-3 rounded-card border border-accent-tint-border bg-accent-tint p-4">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-accent-strong">{title}</p>
        <p className="text-[15px] font-semibold text-accent-deep">{lines[0]}</p>
        {lines[1] && <p className="text-[13px] text-accent-ink-soft">{lines[1]}</p>}
      </div>
      {card.state === 'saved' ? (
        <p
          role="status"
          className="flex items-center gap-1.5 text-sm font-semibold text-accent-strong"
        >
          <CheckIcon size={16} /> Added to the trip
        </p>
      ) : canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={card.state === 'saving'}>
            {card.state === 'saving' ? 'Adding…' : 'Confirm'}
          </Button>
          <Button variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-accent-ink-soft">
          Viewers can't add to this trip. Ask an editor to add it.
        </p>
      )}
      {card.error && (
        <p role="alert" className="text-sm text-negative-ink">
          {card.error}
        </p>
      )}
    </div>
  );
}
