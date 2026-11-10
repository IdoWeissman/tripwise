#!/usr/bin/env node
/**
 * Browser smoke test of the running app — used by the `qa` agent and by people.
 *
 *   pnpm qa:smoke                       # every main screen, phone + desktop
 *   pnpm qa:smoke --path /trips/:trip/bookings --path /sign-up
 *   pnpm qa:smoke --only mobile         # or: desktop
 *
 * Needs `pnpm dev` running and a seeded database (signs in with the demo account
 * unless QA_EMAIL / QA_PASSWORD are set). `:trip` in a path is the first trip.
 * Fails (exit 1) on page errors, console errors, failed API calls, GraphQL errors
 * horizontal overflow or tiny double-scrollbar overflow. Screenshots (with scrollbars visible) and
 * report.json go to qa-output/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASE, launch, scrollGlitches, signIn } from './qa-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const OUT = 'qa-output';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const only = flag('only')[0];
const extra = flag('path');

const DEFAULT_PATHS = [
  '/',
  '/trips/:trip/overview',
  '/trips/:trip/itinerary',
  '/trips/:trip/bookings',
  '/trips/:trip/bookings/:booking',
  '/trips/:trip/proposals',
  '/trips/:trip/expenses',
  '/trips/:trip/members',
];

/** First trip id and one booking id, so paths can use :trip and :booking. */
async function discover(page) {
  return page.evaluate(async () => {
    const q = (query, variables) =>
      fetch('/graphql', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      }).then((r) => r.json());
    const trips = (await q('{ trips { id } }')).data?.trips ?? [];
    const trip = trips[0]?.id ?? null;
    const booking = trip
      ? ((await q('query($id: ID!) { trip(id: $id) { bookings { id } } }', { id: trip })).data?.trip
          ?.bookings[0]?.id ?? null)
      : null;
    return { trip, booking };
  });
}

async function check(page, path, vpName) {
  const problems = [];
  const onConsole = (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`);
  const onError = (e) => problems.push(`page error: ${e.message}`);
  const onResponse = async (r) => {
    const url = r.url();
    if (!url.startsWith(BASE) || /\.(js|css|svg|png|woff2?)(\?|$)/.test(url)) return;
    if (r.status() >= 500)
      problems.push(`HTTP ${r.status()} ${r.request().method()} ${url.slice(BASE.length)}`);
    if (url.endsWith('/graphql') && r.request().method() === 'POST') {
      const body = await r.json().catch(() => null);
      for (const e of body?.errors ?? []) problems.push(`GraphQL: ${e.message}`);
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onError);
  page.on('response', onResponse);
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) problems.push(`horizontal overflow: ${overflow}px wider than the viewport`);
  for (const g of await scrollGlitches(page)) problems.push(g);
  const heading = await page
    .locator('h1')
    .first()
    .textContent()
    .catch(() => null);
  const shot = `${OUT}/${vpName}${path.replace(/[/:]+/g, '_') || '_root'}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  page.off('console', onConsole);
  page.off('pageerror', onError);
  page.off('response', onResponse);
  return { viewport: vpName, path, heading: heading?.trim() ?? null, screenshot: shot, problems };
}

const browser = await launch();
mkdirSync(OUT, { recursive: true });
const results = [];
try {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    if (only && only !== vpName) continue;
    const page = await (await browser.newContext({ viewport })).newPage();
    await signIn(page);
    const ids = await discover(page);
    for (const raw of [...DEFAULT_PATHS, ...extra]) {
      if ((raw.includes(':trip') && !ids.trip) || (raw.includes(':booking') && !ids.booking))
        continue;
      const path = raw.replace(':trip', ids.trip ?? '').replace(':booking', ids.booking ?? '');
      results.push(await check(page, path, vpName));
    }
  }
} catch (err) {
  console.error(`✘ QA could not run: ${err.message.split('\n')[0]}`);
  console.error(
    `  Is the app running at ${BASE} (pnpm dev) with a seeded database (pnpm db:seed)?`,
  );
  process.exitCode = 2;
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(
    `${r.problems.length ? '✘' : '✔'} ${r.viewport.padEnd(7)} ${r.path}  ${r.heading ? `— ${r.heading}` : ''}`,
  );
  for (const p of r.problems) console.log(`    ${p}`);
}
const failed = results.filter((r) => r.problems.length).length;
console.log(
  `\n${results.length - failed}/${results.length} pages clean · screenshots and report.json in ${OUT}/`,
);
if (failed) process.exitCode = 1;
