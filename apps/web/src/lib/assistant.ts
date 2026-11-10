/** Client for the trip assistant: status, streaming answers (SSE over fetch) and confirm. */

export type SourceKind = 'TRIP' | 'BOOKING' | 'ACTIVITY' | 'EXPENSE' | 'DOCUMENT';
export type SuggestTool = 'add_booking' | 'propose_activity' | 'add_expense';

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  /** Trip page, relative to /trips/:tripId. */
  path: string;
}

export interface Suggestion {
  id: string;
  tool: SuggestTool;
  args: Record<string, unknown>;
}

export type AssistantEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; text: string }
  | ({ type: 'source' } & Source)
  | ({ type: 'suggestion' } & Suggestion)
  | { type: 'done'; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string };

export interface AssistantStatus {
  enabled: boolean;
  semantic: boolean;
  remaining: number;
  limit: number;
}

async function errorFrom(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error ?? 'Something went wrong. Please try again.');
}

export async function fetchStatus(tripId: string): Promise<AssistantStatus> {
  const res = await fetch(`/api/trips/${tripId}/assistant`, { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as AssistantStatus;
}

/** Splits an SSE byte stream into JSON events. Exported for tests. */
export function createSseParser(onEvent: (e: AssistantEvent) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (data) onEvent(JSON.parse(data) as AssistantEvent);
    }
  };
}

export async function ask(
  tripId: string,
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  onEvent: (e: AssistantEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/assistant/ask`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, history }),
    signal,
  });
  if (!res.ok || !res.body) throw await errorFrom(res);
  const feed = createSseParser(onEvent);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    feed(decoder.decode(value, { stream: true }));
  }
}

export async function confirmSuggestion(tripId: string, s: Suggestion): Promise<unknown> {
  const res = await fetch(`/api/trips/${tripId}/assistant/confirm`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: s.tool, args: s.args }),
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { result: unknown }).result;
}

/** Inline pieces of an answer: plain text, **bold**, and citations like [S2]. */
export type Inline =
  { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'cite'; id: string };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\[(S\d+)\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { kind: 'bold', text: m[1] } : { kind: 'cite', id: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Answer text as paragraphs and bullet lists (the model is asked for nothing fancier). */
export type BlockNode = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

export function parseBlocks(text: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (const para of text.trim().split(/\n{2,}/)) {
    const lines = para.split('\n').filter((l) => l.trim());
    let list: string[] | null = null;
    for (const line of lines) {
      const bullet = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
      if (bullet) {
        if (!list) blocks.push({ kind: 'ul', items: (list = []) });
        list.push(bullet[1]!);
      } else {
        list = null;
        const prev = blocks.at(-1);
        if (prev?.kind === 'p' && lines.indexOf(line) > 0) prev.text += `\n${line}`;
        else blocks.push({ kind: 'p', text: line });
      }
    }
  }
  return blocks;
}

/** One-line summary of what a suggestion card will add. */
export function describeSuggestion(
  s: Suggestion,
  currency: string,
): { title: string; lines: string[] } {
  const a = s.args as Record<string, string | string[] | number | undefined>;
  const money = (v: unknown, cur = currency) =>
    v ? new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(Number(v)) : null;
  switch (s.tool) {
    case 'add_expense':
      return {
        title: 'Add expense',
        lines: [
          `${a.description} · ${money(a.amount)}`,
          `Paid by ${a.paidBy === 'me' || !a.paidBy ? 'you' : a.paidBy} · split equally${
            Array.isArray(a.splitBetween)
              ? ` between ${a.splitBetween.join(', ')}`
              : ' with everyone'
          }`,
        ],
      };
    case 'propose_activity':
      return {
        title: 'Propose an activity',
        lines: [
          String(a.title),
          [
            a.date,
            a.startTime,
            a.location,
            a.costPerPerson && `${money(a.costPerPerson)} per person`,
          ]
            .filter(Boolean)
            .join(' · ') || 'For the group to vote on',
        ],
      };
    case 'add_booking':
      return {
        title: 'Add booking',
        lines: [
          `${String(a.title)}${a.provider ? ` · ${a.provider}` : ''}`,
          [
            a.startLocal && String(a.startLocal).replace('T', ' '),
            a.location,
            money(a.price, typeof a.currency === 'string' ? a.currency : currency),
          ]
            .filter(Boolean)
            .join(' · ') || String(a.type).toLowerCase(),
        ],
      };
  }
}
