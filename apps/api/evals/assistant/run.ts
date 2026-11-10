/**
 * Retrieval evals for the trip assistant: builds an invented trip, indexes it, and checks that
 * each question finds the right booking, plan, expense or document.
 *
 *   pnpm --filter @tripwise/api eval:assistant           # keyword search (+ semantic and hybrid with VOYAGE_API_KEY)
 *   pnpm --filter @tripwise/api eval:assistant --check   # fail if keyword hit@5 drops below the baseline
 *   pnpm --filter @tripwise/api eval:assistant --update  # save the current scores as the baseline
 *   pnpm --filter @tripwise/api eval:assistant --verbose # show every question's top results
 *
 * Needs a migrated database (it creates and deletes its own trip). Writes evals/assistant/report.md.
 */
import '../../src/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { voyageEmbedder } from '../../src/assistant/embeddings.js';
import { searchTrip, syncTrip } from '../../src/assistant/search.js';
import { loadEnv } from '../../src/config.js';
import { createDb } from '../../src/db.js';
import { CASES } from './cases.js';
import { createFixture, deleteFixture } from './fixture.js';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const BASELINE = fileURLToPath(new URL('baseline.json', import.meta.url));
type Mode = 'keyword' | 'semantic' | 'hybrid';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const embedder = env.VOYAGE_API_KEY
  ? voyageEmbedder({ apiKey: env.VOYAGE_API_KEY, model: env.VOYAGE_MODEL })
  : null;
const modes: Mode[] = embedder ? ['keyword', 'semantic', 'hybrid'] : ['keyword'];

const tripId = await createFixture(db);
interface Row {
  id: string;
  tags: string[];
  rank: Record<Mode, number | null>;
  top: Record<Mode, string[]>;
}
const rows: Row[] = [];
try {
  const sync = await syncTrip(db, tripId, embedder);
  console.log(
    `Indexed ${sync.total} chunks${embedder ? ` (${embedder.model})` : ' (keyword only — set VOYAGE_API_KEY for semantic)'}.\n`,
  );
  for (const c of CASES) {
    const row: Row = { id: c.id, tags: c.tags, rank: {} as Row['rank'], top: {} as Row['top'] };
    for (const mode of modes) {
      const hits = await searchTrip(db, tripId, c.question, embedder, 5, mode);
      const idx = hits.findIndex((h) => c.expect.includes(h.title));
      row.rank[mode] = idx >= 0 ? idx + 1 : null;
      row.top[mode] = hits.map((h) => h.title);
    }
    rows.push(row);
  }
} finally {
  await deleteFixture(db, tripId);
  await db.$disconnect();
}

const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
function metrics(list: Row[], mode: Mode) {
  const ranks = list.map((r) => r.rank[mode]);
  return {
    hit1: ranks.filter((r) => r === 1).length,
    hit5: ranks.filter((r) => r !== null).length,
    mrr: ranks.reduce<number>((s, r) => s + (r ? 1 / r : 0), 0) / list.length,
    n: list.length,
  };
}

const lines = [
  '# Trip assistant retrieval eval',
  '',
  `${CASES.length} questions on an invented trip; top 5 results per search.`,
  '',
];
lines.push('| Search | hit@1 | hit@5 | MRR |', '| --- | --- | --- | --- |');
for (const mode of modes) {
  const m = metrics(rows, mode);
  lines.push(`| ${mode} | ${pct(m.hit1, m.n)} | ${pct(m.hit5, m.n)} | ${m.mrr.toFixed(2)} |`);
}
lines.push(
  '',
  '**hit@5 by question type**',
  '',
  `| Type | ${modes.join(' | ')} |`,
  `| --- |${modes.map(() => ' --- |').join('')}`,
);
for (const tag of ['exact', 'paraphrase', 'document', 'money', 'hebrew']) {
  const subset = rows.filter((r) => r.tags.includes(tag));
  lines.push(
    `| ${tag} (${subset.length}) | ${modes.map((m) => pct(metrics(subset, m).hit5, subset.length)).join(' | ')} |`,
  );
}
const misses = rows.filter((r) => modes.some((m) => r.rank[m] === null));
if (misses.length || has('--verbose')) {
  lines.push(
    '',
    '**Questions and ranks** (— = not in top 5)',
    '',
    `| Case | ${modes.join(' | ')} |`,
    `| --- |${modes.map(() => ' --- |').join('')}`,
  );
  for (const r of has('--verbose') ? rows : misses)
    lines.push(`| ${r.id} | ${modes.map((m) => r.rank[m] ?? '—').join(' | ')} |`);
}
const report = lines.join('\n');
console.log(report);
writeFileSync(fileURLToPath(new URL('report.md', import.meta.url)), report + '\n');
if (has('--verbose')) for (const r of rows) console.log(`\n${r.id}:`, JSON.stringify(r.top));

const keyword = metrics(rows, 'keyword').hit5;
if (has('--update')) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ keywordHit5: keyword, total: rows.length }, null, 2) + '\n',
  );
  console.log(`\nBaseline saved: keyword hit@5 ${keyword}/${rows.length}.`);
}
if (has('--check')) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as { keywordHit5: number };
  if (keyword < base.keywordHit5) {
    console.error(`\n✖ Keyword hit@5 dropped: ${keyword} < baseline ${base.keywordHit5}.`);
    process.exit(1);
  }
  console.log(`\n✔ No regressions (keyword hit@5 ${keyword} vs baseline ${base.keywordHit5}).`);
}
