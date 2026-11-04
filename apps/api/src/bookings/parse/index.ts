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

/** Plain text of a PDF (first 20 pages). */
async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return text.slice(0, 200_000);
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
}): AiConfig | null {
  return env.ANTHROPIC_API_KEY
    ? { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }
    : null;
}

const legKey = (s: SegmentDraft) =>
  s.number
    ? s.number.replace(/\s+/g, '').toUpperCase()
    : `${s.fromCode}-${s.toCode}-${s.departLocal.slice(0, 10)}`;

/**
 * Combines what the model read with what the rules read. Calendar legs are exact, so their times
 * win; any field the model left empty is filled from the matching rule-based draft.
 */
export function reconcile(ai: Draft[], rules: Draft[], exactLegs: SegmentDraft[]): Draft[] {
  const exact = new Map(exactLegs.map((l) => [legKey(l), l]));
  return ai.map((d) => {
    const match =
      rules.find((r) => r.type === d.type) ?? (rules.length === 1 ? rules[0] : undefined);
    const segments = d.segments.map((s) => {
      const e = exact.get(legKey(s));
      return e
        ? {
            ...s,
            departLocal: e.departLocal,
            arriveLocal: e.arriveLocal ?? s.arriveLocal,
            departTz: s.departTz ?? e.departTz,
            arriveTz: s.arriveTz ?? e.arriveTz,
            fromName: s.fromName ?? e.fromName,
            toName: s.toName ?? e.toName,
          }
        : s;
    });
    const merged: Omit<Draft, 'fromSource'> = { ...d, segments };
    if (match) {
      for (const k of [
        'provider',
        'confirmationCode',
        'bookingUrl',
        'startLocal',
        'endLocal',
        'location',
        'address',
        'price',
        'currency',
        'travellers',
      ] as const) {
        if (merged[k] === null || merged[k] === undefined)
          (merged as Record<string, unknown>)[k] = match[k] ?? null;
      }
      if (!segments.length && match.segments.length) merged.segments = match.segments;
    }
    return withProvenance(merged);
  });
}

/** Rule-based drafts for an email: structured data, then calendar attachments, then the text. */
function ruleDrafts(
  mail: ParsedMail,
  fileName: string,
): { drafts: Draft[]; exactLegs: SegmentDraft[]; text: string; calendars: string[] } {
  const html = typeof mail.html === 'string' ? mail.html : '';
  const text = mail.text ?? html.replace(/<[^>]+>/g, ' ');
  const calendars = mail.attachments
    .filter((a) => /calendar/i.test(a.contentType) || /\.(ics|vcs)$/i.test(a.filename ?? ''))
    .map((a) => a.content.toString('utf8'));
  const structured = html ? draftsFromJsonLd(html) : [];
  if (structured.length) return { drafts: structured, exactLegs: [], text, calendars };

  const sender = mail.from?.value[0] ?? null;
  const fromText = draftFromText(text, {
    subject: mail.subject,
    fallbackTitle: baseName(fileName),
    sender,
  });
  const fromCal = draftsFromCalendar(calendars.flatMap(parseCalendar));
  const exactLegs = fromCal.flatMap((d) => d.segments);
  if (!fromCal.length) return { drafts: fromText ? [fromText] : [], exactLegs, text, calendars };

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
  return { drafts, exactLegs, text, calendars };
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
      const ai = await extractWithAi(opts.ai, {
        subject: mail.subject,
        text: rules.text,
        calendars: rules.calendars,
      });
      return ai?.length ? reconcile(ai, rules.drafts, rules.exactLegs) : rules.drafts;
    }
    if (kind === 'PDF') {
      const text = await pdfText(buf);
      const d = draftFromText(text, { fallbackTitle: baseName(fileName) });
      const rules = d ? [d] : [];
      if (!opts.ai) return rules;
      // Scanned PDFs have no text layer: let the model look at the pages instead.
      const scanned = text.replace(/\s+/g, '').length < 40;
      const ai = await extractWithAi(
        opts.ai,
        scanned && buf.length <= 20 * 1024 * 1024 ? { pdf: buf } : { text },
      );
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

/** Bookings from pasted email text (HTML with markup also works). */
export async function parseText(text: string, opts: ParseOptions = {}): Promise<Draft[]> {
  let rules: Draft[] = [];
  if (/application\/ld\+json/i.test(text)) rules = draftsFromJsonLd(text);
  if (!rules.length) {
    const subject = /^subject:\s*(.+)$/im.exec(text)?.[1];
    const d = draftFromText(text, { subject });
    rules = d ? [d] : [];
  }
  if (!opts.ai) return rules;
  const ai = await extractWithAi(opts.ai, { text });
  return ai?.length ? reconcile(ai, rules, []) : rules;
}
