import { simpleParser, type ParsedMail } from 'mailparser';
import { extractWithAi, type AiConfig } from './ai.js';
import { draftsFromCalendar, parseCalendar } from './calendar.js';
import { draftsFromJsonLd } from './schemaOrg.js';
import { cityNames, draftFromText } from './text.js';
import { flightTitle } from './title.js';
import { withProvenance, type Draft, type SegmentDraft } from './types.js';

export type { Draft, SegmentDraft } from './types.js';

export type SourceKind = 'EMAIL' | 'PDF' | 'IMAGE' | 'TEXT';

export const ACCEPTED_TYPES: Record<string, SourceKind> = {
  'application/pdf': 'PDF',
  'message/rfc822': 'EMAIL',
  'image/png': 'IMAGE',
  'image/jpeg': 'IMAGE',
};

/** Detects the real file type from its bytes (never trust the browser's MIME type). */
export function sniff(buf: Buffer): { mime: string; kind: SourceKind } | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-')
    return { mime: 'application/pdf', kind: 'PDF' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: 'image/png', kind: 'IMAGE' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', kind: 'IMAGE' };
  const head = buf.subarray(0, 4096).toString('utf8');
  if (
    /^(Return-Path|Received|From|Date|Subject|MIME-Version|Message-ID|Delivered-To|X-[\w-]+):/im.test(
      head,
    ) &&
    !head.includes('\u0000')
  )
    return { mime: 'message/rfc822', kind: 'EMAIL' };
  return null;
}

/**
 * Plain text of a PDF, plus the targets of its clickable links ("To manage your booking please
 * click here" hides the URL in a link, not in the text).
 */
async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  const links = new Set<string>();
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const annotations = await (await doc.getPage(p)).getAnnotations().catch(() => []);
    for (const a of annotations as { url?: string }[])
      if (a.url && /^https?:\/\//.test(a.url)) links.add(a.url);
  }
  const suffix = links.size ? `\n\nLinks:\n${[...links].join('\n')}` : '';
  return (text + suffix).slice(0, 200_000);
}

const baseName = (fileName: string) =>
  fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

export interface ParseOptions {
  /** Set to let Claude read the source; rule-based readers are always used as well. */
  ai?: AiConfig | null;
}

/** The AI settings from the environment, or null when AI reading is off. */
export function aiConfig(env: {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_ESCALATION_MODEL?: string;
}): AiConfig | null {
  return env.ANTHROPIC_API_KEY
    ? {
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL,
        escalationModel: env.ANTHROPIC_ESCALATION_MODEL ?? null,
      }
    : null;
}

const legKey = (s: SegmentDraft) =>
  s.number
    ? s.number.replace(/\s+/g, '').toUpperCase()
    : `${s.fromCode}-${s.toCode}-${s.departLocal.slice(0, 10)}`;

/**
 * Combines the model's drafts with what the rule-based readers found. The model's answer wins:
 * heuristic rules never overwrite it or fill its price, dates, title or travellers (a guessed
 * pet fee is worse than "not stated"). Only exact data beats it — calendar legs and schema.org
 * values — and rules fill just the two fields they read precisely: a labelled confirmation code
 * and a manage-booking link.
 */
export function reconcile(
  ai: Draft[],
  rules: Draft[],
  exactLegs: SegmentDraft[],
  opts: { exact?: boolean } = {},
): Draft[] {
  const exact = new Map(exactLegs.map((l) => [legKey(l), l]));
  return ai.map((d) => {
    const match =
      rules.find((r) => r.type === d.type) ?? (rules.length === 1 ? rules[0] : undefined);
    let toCheck = [...(d.toCheck ?? [])];
    const segments = d.segments.map((s) => {
      const e = exact.get(legKey(s));
      if (!e) return s;
      toCheck = toCheck.filter((f) => f !== 'segments');
      return {
        ...s,
        departLocal: e.departLocal,
        arriveLocal: e.arriveLocal ?? s.arriveLocal,
        departTz: s.departTz ?? e.departTz,
        arriveTz: s.arriveTz ?? e.arriveTz,
        fromName: s.fromName ?? e.fromName,
        toName: s.toName ?? e.toName,
      };
    });
    const merged: Omit<Draft, 'fromSource'> = { ...d, segments };
    if (match && opts.exact) {
      for (const k of EXACT_FIELDS) {
        if (match[k] !== null && match[k] !== undefined) {
          (merged as Record<string, unknown>)[k] = match[k];
          toCheck = toCheck.filter((f) => f !== k);
        }
      }
    } else if (match) {
      merged.confirmationCode ??= match.confirmationCode ?? null;
      merged.bookingUrl ??= match.bookingUrl ?? null;
    }
    return withProvenance({ ...merged, toCheck });
  });
}

/** Fields a schema.org block states exactly. */
const EXACT_FIELDS = [
  'confirmationCode',
  'startLocal',
  'endLocal',
  'price',
  'currency',
  'address',
  'bookingUrl',
] as const;

/** Rule-based drafts for an email: structured data, then calendar attachments, then the text. */
function ruleDrafts(
  mail: ParsedMail,
  fileName: string,
): {
  drafts: Draft[];
  exactLegs: SegmentDraft[];
  text: string;
  calendars: string[];
  /** Drafts read from schema.org data: their values are exact and beat the model's. */
  exact: boolean;
} {
  const html = typeof mail.html === 'string' ? mail.html : '';
  const text = mail.text ?? html.replace(/<[^>]+>/g, ' ');
  const calendars = mail.attachments
    .filter((a) => /calendar/i.test(a.contentType) || /\.(ics|vcs)$/i.test(a.filename ?? ''))
    .map((a) => a.content.toString('utf8'));
  const structured = html ? draftsFromJsonLd(html) : [];
  if (structured.length) return { drafts: structured, exactLegs: [], text, calendars, exact: true };

  const sender = mail.from?.value[0] ?? null;
  const fromText = draftFromText(text, {
    subject: mail.subject,
    fallbackTitle: baseName(fileName),
    sender,
  });
  const fromCal = draftsFromCalendar(calendars.flatMap(parseCalendar));
  const exactLegs = fromCal.flatMap((d) => d.segments);
  if (!fromCal.length)
    return { drafts: fromText ? [fromText] : [], exactLegs, text, calendars, exact: false };

  // Calendar events give exact legs/times; the text adds price, people, links and city names.
  const drafts = fromCal.map((d) => {
    if (!fromText) return d;
    const names = cityNames(text, mail.subject, d.segments);
    return withProvenance({
      ...d,
      title: d.type === 'FLIGHT' ? flightTitle(d.segments, names) : d.title,
      provider: d.provider ?? fromText.provider ?? null,
      confirmationCode: d.confirmationCode ?? fromText.confirmationCode ?? null,
      bookingUrl: fromText.bookingUrl ?? null,
      price: fromCal.length === 1 ? (fromText.price ?? null) : null,
      currency: fromCal.length === 1 ? (fromText.currency ?? null) : null,
      travellers: fromText.travellers ?? null,
    });
  });
  return { drafts, exactLegs, text, calendars, exact: false };
}

/** Plain text of an email or PDF, kept with the file so the trip assistant can search it. */
export async function documentText(buf: Buffer, kind: SourceKind): Promise<string | null> {
  try {
    if (kind === 'EMAIL') {
      const mail = await simpleParser(buf);
      const html = typeof mail.html === 'string' ? mail.html : '';
      const body = mail.text ?? html.replace(/<[^>]+>/g, ' ');
      return [mail.subject, body].filter(Boolean).join('\n\n').slice(0, 100_000) || null;
    }
    if (kind === 'PDF') return (await pdfText(buf)).slice(0, 100_000) || null;
  } catch {
    // Unreadable files are still stored; they just aren't searchable.
  }
  return null;
}

/** Reads bookings out of an uploaded file. */
export async function parseFile(
  buf: Buffer,
  kind: SourceKind,
  fileName: string,
  opts: ParseOptions = {},
): Promise<Draft[]> {
  try {
    if (kind === 'EMAIL') {
      const mail = await simpleParser(buf);
      const rules = ruleDrafts(mail, fileName);
      if (!opts.ai) return rules.drafts;
      // Attached e-tickets and vouchers go to the model as documents, as they are.
      const pdfs = mail.attachments
        .filter((a) => /pdf/i.test(a.contentType) && a.size <= MAX_AI_PDF)
        .slice(0, 3)
        .map((a) => a.content);
      const pdfTexts = await Promise.all(pdfs.map((p) => pdfText(p).catch(() => '')));
      const ai = await extractWithAi(opts.ai, {
        subject: mail.subject,
        text: rules.text,
        calendars: rules.calendars,
        pdfs,
        docText: [mail.subject, rules.text, ...rules.calendars, ...pdfTexts].join('\n'),
      });
      return ai?.length
        ? reconcile(ai, rules.drafts, rules.exactLegs, { exact: rules.exact })
        : rules.drafts;
    }
    if (kind === 'PDF') {
      const text = await pdfText(buf);
      const d = draftFromText(text, { fallbackTitle: baseName(fileName) });
      const rules = d ? [d] : [];
      if (!opts.ai || buf.length > MAX_AI_PDF) return rules;
      // The model gets the PDF itself (page images + text), not our flattened text layer, which
      // loses the layout ("27AUG2026Date:"). Scanned PDFs have no text to check quotes against.
      const scanned = text.replace(/\s+/g, '').length < 40;
      const links = /\n\nLinks:\n[\s\S]*$/.exec(text)?.[0].trim();
      const ai = await extractWithAi(opts.ai, {
        pdfs: [buf],
        text: links ? `Links in the file (they are not visible in the text):\n${links}` : null,
        docText: scanned ? null : text,
      });
      return ai?.length ? reconcile(ai, rules, []) : rules;
    }
    if (kind === 'IMAGE' && opts.ai && buf.length <= 5 * 1024 * 1024) {
      const mediaType = buf[0] === 0x89 ? 'image/png' : 'image/jpeg';
      return (await extractWithAi(opts.ai, { image: { mediaType, data: buf } })) ?? [];
    }
  } catch (err) {
    console.warn(`Could not read ${fileName}:`, err instanceof Error ? err.message : err);
  }
  return [];
}

/** Larger PDFs are read by the rules only (the API accepts up to 32 MB per request). */
const MAX_AI_PDF = 20 * 1024 * 1024;

/** Bookings from pasted email text (HTML with markup also works). */
export async function parseText(text: string, opts: ParseOptions = {}): Promise<Draft[]> {
  let rules: Draft[] = [];
  if (/application\/ld\+json/i.test(text)) rules = draftsFromJsonLd(text);
  const exactFromJsonLd = rules.length > 0;
  if (!rules.length) {
    const subject = /^subject:\s*(.+)$/im.exec(text)?.[1];
    const d = draftFromText(text, { subject });
    rules = d ? [d] : [];
  }
  if (!opts.ai) return rules;
  const ai = await extractWithAi(opts.ai, { text, docText: text });
  return ai?.length ? reconcile(ai, rules, [], { exact: exactFromJsonLd }) : rules;
}
