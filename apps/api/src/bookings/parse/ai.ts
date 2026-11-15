/**
 * Optional AI extraction with Claude. Used when ANTHROPIC_API_KEY is set; otherwise (or when the
 * call fails) the rule-based readers are used on their own. The model must answer through a
 * tool with a strict schema, and every value is validated before it reaches a draft.
 */
import { z } from 'zod';
import { withProvenance, type Draft } from './types.js';
import { fieldsToCheck, type Evidence } from './verify.js';

export interface AiConfig {
  apiKey: string;
  model: string;
  /** Stronger model to retry with when the first result fails verification (optional). */
  escalationModel?: string | null;
  /** Override for tests. */
  fetch?: typeof fetch;
  /** Called after each API call with token usage and latency (used by the evals). */
  onUsage?: (usage: AiUsage) => void;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface AiInput {
  subject?: string | null;
  /** Email body / PDF text / pasted text. */
  text?: string | null;
  /** Raw calendar attachments (.ics / .vcs). */
  calendars?: string[];
  /** A photo or screenshot of a ticket. */
  image?: { mediaType: 'image/png' | 'image/jpeg'; data: Buffer } | null;
  /** PDFs, sent as documents so the model sees the pages, not just their text layer. */
  pdfs?: Buffer[];
  /**
   * Plain text of everything sent, used to check the model's quotes. Null for photos and
   * scanned PDFs, where there is no text to check against.
   */
  docText?: string | null;
}

const TYPES = [
  'FLIGHT',
  'STAY',
  'EVENT',
  'ATTRACTION',
  'TOUR',
  'TRANSPORT',
  'DINING',
  'OTHER',
] as const;

const SYSTEM = `You read travel booking confirmations (emails, PDFs, ticket photos) and record every booking in them with the record_bookings tool.

Rules:
- One booking per reservation. A round trip or multi-leg itinerary on one confirmation is ONE booking of type FLIGHT (or TRANSPORT for trains/buses/ferries) with one segment per leg, in order.
- title: short and human, never the email subject. Flights/trains: city names, "Tel Aviv ⇄ Rome" for a round trip, "Tel Aviv → Rome" one way (connections don't count as destinations). Stays: the property name. Events, tours, attractions, restaurants: the name of the show, place or venue.
- Times are local wall-clock times at that place, formatted "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" when there is no time). Never convert to UTC. departTz/arriveTz/timeZone: IANA zone (e.g. "Europe/Rome") when you can tell the city, else null.
- Stays: startLocal = check-in, endLocal = check-out.
- price: the total actually paid for the whole booking including taxes and fees, as a decimal string with a dot ("324.97"); currency: ISO 4217 code. Not a per-person fare or a single tax line. Vouchers and package bookings often state no price: then leave it empty. Never use optional fees, deposits, parking, pet or resort fees as the price.
- travellers: number of people on the booking ("Dana Levi +1 guest" is 2). 0 when not stated.
- Stays: when check-in/check-out times appear only in the policy text ("Check-in from 4:00 PM", "Check-out by 11:00 AM"), use them.
- provider: the airline, hotel, venue or ticket seller (not the email service).
- bookingUrl: the link to view or manage this booking, if present. Not images, unsubscribe or marketing links.
- fromCode/toCode: 3-letter IATA airport codes for flights; fromName/toName: airport or station name.
- notes: short practical facts worth keeping (baggage allowance, terminal, seat, check-in instructions). One line each, max 5 lines.
- Use an empty string (or 0 for travellers) for anything not stated. Never guess codes, numbers, prices or times.
- evidence: for confirmationCode, startLocal, endLocal and price, copy the exact text from the document you read each value from (a short verbatim snippet, e.g. "Total Amount: USD 1450.00"). Empty when the field is empty. Never paraphrase.
- If there is no booking at all, call the tool with an empty list.`;

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SEGMENT = obj({
  carrier: str,
  number: str,
  fromCode: str,
  fromName: str,
  toCode: str,
  toName: str,
  departLocal: str,
  arriveLocal: str,
  departTz: str,
  arriveTz: str,
});

/** Verbatim snippets the values were read from; checked against the document. */
export const EVIDENCE_FIELDS = ['confirmationCode', 'startLocal', 'endLocal', 'price'] as const;

/**
 * Strict tool: the API guarantees the answer matches this schema. Every field is required and
 * "not stated" is an empty string, which keeps the schema free of optional fields and unions
 * (both are limited in strict mode); validation below turns "" into null.
 */
const TOOL = {
  name: 'record_bookings',
  description: 'Record the bookings found in the document.',
  strict: true,
  input_schema: obj({
    bookings: {
      type: 'array',
      items: obj({
        type: { type: 'string', enum: TYPES },
        title: str,
        provider: str,
        confirmationCode: str,
        bookingUrl: str,
        startLocal: str,
        endLocal: str,
        timeZone: str,
        location: str,
        address: str,
        price: str,
        currency: str,
        travellers: { type: 'integer' },
        notes: str,
        segments: { type: 'array', items: SEGMENT },
        evidence: obj(Object.fromEntries(EVIDENCE_FIELDS.map((f) => [f, str]))),
      }),
    },
  }),
} as const;

// --- validation: anything malformed becomes null instead of failing the whole import ---

const LOCAL = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const local = z
  .string()
  .nullish()
  .transform((v) => (v && LOCAL.test(v.trim()) ? v.trim() : null));
const text = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v?.trim() ? v.trim().slice(0, max) : null));
const zone = z
  .string()
  .nullish()
  .transform((v) => {
    if (!v) return null;
    if (/^[+-]\d{2}:\d{2}$/.test(v)) return v;
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return v;
    } catch {
      return null;
    }
  });
const code3 = z
  .string()
  .nullish()
  .transform((v) => (v && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null));

const Segment = z.object({
  carrier: text(80),
  number: text(12),
  fromCode: code3,
  fromName: text(80),
  toCode: code3,
  toName: text(80),
  departLocal: local,
  arriveLocal: local,
  departTz: zone,
  arriveTz: zone,
});

const Booking = z.object({
  type: z
    .preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(TYPES))
    .catch('OTHER'),
  title: z.string().trim().min(1).max(120),
  provider: text(120),
  confirmationCode: z
    .string()
    .nullish()
    .transform((v) => (v && /^[A-Za-z0-9-]{3,20}$/.test(v.trim()) ? v.trim().toUpperCase() : null)),
  bookingUrl: z
    .string()
    .nullish()
    .transform((v) => (v && /^https?:\/\/\S+$/.test(v.trim()) ? v.trim().slice(0, 2000) : null)),
  startLocal: local,
  endLocal: local,
  timeZone: zone,
  location: text(200),
  address: text(300),
  price: z
    .string()
    .nullish()
    .transform((v) => {
      const n = v ? Number(v.replace(/[^\d.]/g, '')) : NaN;
      return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n.toFixed(2) : null;
    }),
  currency: z
    .string()
    .nullish()
    .transform((v) => (v && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null)),
  travellers: z
    .number()
    .int()
    .nullish()
    .transform((v) => (v && v > 0 && v < 100 ? v : null)),
  notes: text(1000),
  segments: z.array(Segment).max(12).catch([]),
});

const Result = z.object({ bookings: z.array(z.unknown()).max(10) });

const EvidenceSchema = z
  .object(Object.fromEntries(EVIDENCE_FIELDS.map((f) => [f, z.string().max(500).catch('')])))
  .partial()
  .catch({});

/**
 * Validated drafts from the model's tool input. Invalid bookings are dropped one by one, and each
 * draft lists the fields its evidence doesn't support (`toCheck`).
 */
export function draftsFromAi(input: unknown, docText: string | null = null): Draft[] {
  const parsed = Result.safeParse(input);
  if (!parsed.success) return [];
  const drafts: Draft[] = [];
  for (const raw of parsed.data.bookings) {
    const b = Booking.safeParse(raw);
    if (!b.success) continue;
    const segments = b.data.segments
      .filter((s) => s.departLocal)
      .map((s) => ({ ...s, departLocal: s.departLocal! }));
    const draft = withProvenance({ ...b.data, segments });
    const evidence = EvidenceSchema.parse(
      (raw as { evidence?: unknown }).evidence ?? {},
    ) as Evidence;
    draft.toCheck = fieldsToCheck(draft, evidence, docText);
    drafts.push(draft);
  }
  return drafts;
}

/** How much of a result needs checking; lower is better. A failed call is worst. */
const doubt = (drafts: Draft[] | null) =>
  drafts === null ? Infinity : drafts.reduce((n, d) => n + (d.toCheck?.length ?? 0), 0);

/**
 * Reads the bookings with Claude: the fast model first, and the stronger model when the first
 * answer fails verification. Returns null when the calls fail, so callers fall back to rules.
 */
export async function extractWithAi(cfg: AiConfig, input: AiInput): Promise<Draft[] | null> {
  const first = await callModel(cfg, cfg.model, input);
  const stronger = cfg.escalationModel;
  if (!stronger || stronger === 'none' || stronger === cfg.model || doubt(first) === 0)
    return first;
  const second = await callModel(cfg, stronger, input);
  return doubt(second) <= doubt(first) ? second : first;
}

async function callModel(cfg: AiConfig, model: string, input: AiInput): Promise<Draft[] | null> {
  const content: unknown[] = [];
  if (input.image)
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.image.mediaType,
        data: input.image.data.toString('base64'),
      },
    });
  for (const pdf of input.pdfs ?? [])
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
    });
  const parts = [
    input.subject ? `Subject: ${input.subject}` : null,
    input.text ? `Content:\n${input.text.slice(0, 40_000)}` : null,
    ...(input.calendars ?? []).map((c, i) => `Calendar attachment ${i + 1}:\n${c.slice(0, 5_000)}`),
  ].filter(Boolean);
  content.push({
    type: 'text',
    text: parts.join('\n\n') || 'Read the booking in the attached file.',
  });

  const started = Date.now();
  try {
    const res = await (cfg.fetch ?? fetch)('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        // The prompt and schema never change: cache them across imports.
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn(
        `AI extraction failed (${model}): HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
      return null;
    }
    const json = (await res.json()) as {
      content?: { type: string; name?: string; input?: unknown }[];
      stop_reason?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
    cfg.onUsage?.({
      model,
      inputTokens:
        (json.usage?.input_tokens ?? 0) +
        (json.usage?.cache_read_input_tokens ?? 0) +
        (json.usage?.cache_creation_input_tokens ?? 0),
      outputTokens: json.usage?.output_tokens ?? 0,
      ms: Date.now() - started,
    });
    // A refusal or a cut-off answer may not match the schema: treat it as a failed call.
    if (json.stop_reason === 'refusal' || json.stop_reason === 'max_tokens') return null;
    const call = json.content?.find((c) => c.type === 'tool_use' && c.name === TOOL.name);
    return call ? draftsFromAi(call.input, input.docText ?? null) : null;
  } catch (err) {
    console.warn(`AI extraction failed (${model}):`, err instanceof Error ? err.message : err);
    return null;
  }
}
