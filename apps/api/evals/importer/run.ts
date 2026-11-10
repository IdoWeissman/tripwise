/**
 * Booking-importer evals: runs every case in cases.ts and scores the result field by field.
 *
 *   pnpm --filter @tripwise/api eval:import            # rules only (free, offline, deterministic)
 *   pnpm --filter @tripwise/api eval:import --check    # CI gate: fail if any case scores below baseline
 *   pnpm --filter @tripwise/api eval:import --update   # accept the current rules scores as the baseline
 *   pnpm --filter @tripwise/api eval:import --ai       # rules + Claude (needs ANTHROPIC_API_KEY)
 *   pnpm --filter @tripwise/api eval:import --case train-pdf --verbose
 *
 * AI cost is shown when EVAL_PRICE_IN / EVAL_PRICE_OUT (USD per million tokens) are set — prices
 * change, so they aren't hard-coded. Writes evals/importer/report.md and, in GitHub Actions, the
 * job summary.
 */
import '../../src/env.js';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../../src/config.js';
import { aiConfig, parseFile, parseText } from '../../src/bookings/parse/index.js';
import type { AiUsage } from '../../src/bookings/parse/ai.js';
import type { Draft } from '../../src/bookings/parse/types.js';
import { CASES, type EvalCase } from './cases.js';
import { scoreCase, type CaseScore, type Field } from './score.js';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const value = (f: string) => args[args.indexOf(f) + 1];
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const BASELINE = here('baseline.json');

interface Baseline {
  mode: 'rules';
  passed: number;
  total: number;
  cases: Record<string, { passed: number; total: number }>;
}

interface Result {
  c: EvalCase;
  score: CaseScore;
  ms: number;
  drafts: Draft[];
}

const useAi = has('--ai');
const ai = useAi ? aiConfig(loadEnv()) : null;
if (useAi && !ai) {
  console.error('--ai needs ANTHROPIC_API_KEY (in .env.local, apps/api/.env or the environment).');
  process.exit(2);
}
const usage: AiUsage[] = [];
if (ai) ai.onUsage = (u) => usage.push(u);

async function run(c: EvalCase): Promise<Result> {
  const opts = { ai };
  const started = performance.now();
  const drafts =
    c.input.kind === 'TEXT'
      ? await parseText(c.input.text, opts)
      : await parseFile(c.input.file(), c.input.kind, c.input.fileName, opts);
  return { c, drafts, ms: performance.now() - started, score: scoreCase(c.expect, drafts) };
}

const only = has('--case') ? value('--case') : null;
const results: Result[] = [];
for (const c of CASES) if (!only || c.id === only) results.push(await run(c));

// ---------------------------------------------------------------- report
const pct = (p: number, t: number) => (t ? `${Math.round((p / t) * 100)}%` : '—');
const sum = (rs: Result[]) =>
  rs.reduce((a, r) => ({ p: a.p + r.score.passed, t: a.t + r.score.total }), { p: 0, t: 0 });
const all = sum(results);
const seen = sum(results.filter((r) => r.c.group === 'seen'));
const unseen = sum(results.filter((r) => r.c.group === 'unseen'));

const fieldTotals = new Map<Field, { passed: number; total: number }>();
for (const r of results)
  for (const [f, v] of Object.entries(r.score.fields) as [
    Field,
    { passed: number; total: number },
  ][]) {
    const t = fieldTotals.get(f) ?? { passed: 0, total: 0 };
    fieldTotals.set(f, { passed: t.passed + v.passed, total: t.total + v.total });
  }

const short = (v: unknown) => {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '∅');
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
};

const md: string[] = [];
md.push(`## Booking importer evals — ${useAi ? `rules + AI (${ai!.model})` : 'rules only'}`);
md.push('');
md.push(
  `**Overall ${pct(all.p, all.t)}** (${all.p}/${all.t} fields) · seen formats ${pct(seen.p, seen.t)} · unseen formats ${pct(unseen.p, unseen.t)} · ${results.length} cases`,
);
md.push('');
md.push('| Case | Group | Score | Time | Misses |');
md.push('| --- | --- | --- | --- | --- |');
for (const r of results) {
  const misses = r.score.misses.map(
    (m) => `${m.field}: expected ${short(m.expected)}, got ${short(m.actual)}`,
  );
  md.push(
    `| ${r.c.id} | ${r.c.group} | ${r.score.passed}/${r.score.total} | ${Math.round(r.ms)} ms | ${misses.join('<br>') || '✔'} |`,
  );
}
md.push('');
md.push('| Field | Accuracy |');
md.push('| --- | --- |');
for (const [f, v] of [...fieldTotals].sort(
  (a, b) => a[1].passed / a[1].total - b[1].passed / b[1].total,
))
  md.push(`| ${f} | ${pct(v.passed, v.total)} (${v.passed}/${v.total}) |`);

if (usage.length) {
  const inT = usage.reduce((a, u) => a + u.inputTokens, 0);
  const outT = usage.reduce((a, u) => a + u.outputTokens, 0);
  const avgMs = usage.reduce((a, u) => a + u.ms, 0) / usage.length;
  const pin = Number(process.env.EVAL_PRICE_IN);
  const pout = Number(process.env.EVAL_PRICE_OUT);
  const cost = pin && pout ? ((inT * pin + outT * pout) / 1e6 / usage.length).toFixed(4) : null;
  md.push('');
  md.push(
    `**AI calls:** ${usage.length} · avg ${Math.round(avgMs)} ms · avg ${Math.round(inT / usage.length)} input + ${Math.round(outT / usage.length)} output tokens per file${cost ? ` · ≈ $${cost} per file` : ' · set EVAL_PRICE_IN/EVAL_PRICE_OUT for cost'}`,
  );
}

const report = md.join('\n');
console.log(report);
if (!only) writeFileSync(here(`report${useAi ? '-ai' : ''}.md`), `${report}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);

if (has('--verbose'))
  for (const r of results) console.log(`\n--- ${r.c.id}\n${JSON.stringify(r.drafts, null, 2)}`);

// ---------------------------------------------------------------- baseline gate (rules only)
if (has('--update')) {
  if (useAi || only) {
    console.error('--update records the full rules-only run; drop --ai/--case.');
    process.exit(2);
  }
  const baseline: Baseline = {
    mode: 'rules',
    passed: all.p,
    total: all.t,
    cases: Object.fromEntries(
      results.map((r) => [r.c.id, { passed: r.score.passed, total: r.score.total }]),
    ),
  };
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\nBaseline updated: ${all.p}/${all.t}.`);
}

if (has('--check')) {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const r of results) {
    const b = baseline.cases[r.c.id];
    if (!b) {
      improvements.push(`${r.c.id} is new (${r.score.passed}/${r.score.total})`);
      continue;
    }
    if (r.score.passed < b.passed)
      regressions.push(`${r.c.id}: ${b.passed} → ${r.score.passed} fields right`);
    else if (r.score.passed > b.passed)
      improvements.push(`${r.c.id}: ${b.passed} → ${r.score.passed}`);
  }
  for (const id of Object.keys(baseline.cases))
    if (!results.some((r) => r.c.id === id))
      regressions.push(`${id} was removed from the eval set`);
  if (improvements.length)
    console.log(
      `\nBetter than the baseline — run with --update and commit baseline.json:\n  ${improvements.join('\n  ')}`,
    );
  if (regressions.length) {
    console.error(
      `\n✘ Importer regressed against evals/importer/baseline.json:\n  ${regressions.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(
    `\n✔ No regressions (${all.p}/${all.t} vs baseline ${baseline.passed}/${baseline.total}).`,
  );
}
