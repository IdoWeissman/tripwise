/**
 * Shows what the booking importer reads from a file — for debugging the parser and for the
 * add-import-format skill. Nothing is saved or uploaded.
 *
 *   pnpm --filter @tripwise/api import:inspect <file.eml|file.pdf|photo.jpg> [--text] [--ai]
 *
 * --text  also print the plain text the rules see (first 3000 characters)
 * --ai    also run the Claude extraction (needs ANTHROPIC_API_KEY; sends the file to the API)
 */
import '../src/env.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { simpleParser } from 'mailparser';
import { loadEnv } from '../src/config.js';
import { aiConfig, parseFile, sniff } from '../src/bookings/parse/index.js';
import { stripForwardHeaders } from '../src/bookings/parse/text.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('Usage: import:inspect <file> [--text] [--ai]');
  process.exit(2);
}
const buf = readFileSync(file);
const detected = sniff(buf);
if (!detected) {
  console.error(`Not a supported file (PDF, EML, PNG or JPG): ${file}`);
  process.exit(2);
}
console.log(`File: ${basename(file)} · ${detected.mime} · ${buf.length} bytes`);

if (flags.includes('--text') && detected.kind === 'EMAIL') {
  const mail = await simpleParser(buf);
  console.log(`Subject: ${mail.subject ?? '—'}`);
  console.log(
    `Attachments: ${mail.attachments.map((a) => `${a.filename} (${a.contentType})`).join(', ') || 'none'}`,
  );
  console.log('--- text the rules read (forward headers removed) ---');
  console.log(stripForwardHeaders(mail.text ?? '').slice(0, 3000));
  console.log('--- end ---');
}

const show = (label: string, drafts: unknown[]) => {
  console.log(`\n=== ${label}: ${drafts.length} booking(s) ===`);
  console.log(JSON.stringify(drafts, null, 2));
};

show('Rules', await parseFile(buf, detected.kind, basename(file)));

if (flags.includes('--ai')) {
  const ai = aiConfig(loadEnv());
  if (!ai) console.log('\n(--ai skipped: ANTHROPIC_API_KEY is not set)');
  else
    show(`Rules + AI (${ai.model})`, await parseFile(buf, detected.kind, basename(file), { ai }));
}
