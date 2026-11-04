import { simpleParser } from 'mailparser';
import { draftsFromJsonLd } from './schemaOrg.js';
import { draftFromText } from './text.js';
import type { Draft } from './types.js';

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

/** Reads bookings out of an uploaded file. Images are stored but not read (no OCR). */
export async function parseFile(buf: Buffer, kind: SourceKind, fileName: string): Promise<Draft[]> {
  try {
    if (kind === 'EMAIL') {
      const mail = await simpleParser(buf);
      const html = typeof mail.html === 'string' ? mail.html : '';
      const structured = html ? draftsFromJsonLd(html) : [];
      if (structured.length) return structured;
      const text = mail.text ?? html.replace(/<[^>]+>/g, ' ');
      const d = draftFromText(text, { subject: mail.subject, fallbackTitle: baseName(fileName) });
      return d ? [d] : [];
    }
    if (kind === 'PDF') {
      const d = draftFromText(await pdfText(buf), { fallbackTitle: baseName(fileName) });
      return d ? [d] : [];
    }
  } catch (err) {
    console.warn(`Could not read ${fileName}:`, err instanceof Error ? err.message : err);
  }
  return [];
}

/** Bookings from pasted email text (HTML with markup also works). */
export function parseText(text: string): Draft[] {
  if (/application\/ld\+json/i.test(text)) {
    const structured = draftsFromJsonLd(text);
    if (structured.length) return structured;
  }
  const subject = /^subject:\s*(.+)$/im.exec(text)?.[1];
  const d = draftFromText(text, { subject });
  return d ? [d] : [];
}
