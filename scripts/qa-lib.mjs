/**
 * Shared helpers for browser QA scripts (pnpm qa:smoke and the qa agent's throwaway scripts).
 *
 *   import { launch, signIn, scrollGlitches, BASE } from '../scripts/qa-lib.mjs';
 *   const browser = await launch();
 *   const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
 *   await signIn(page);
 *   console.log(await scrollGlitches(page)); // [] when fine
 */
import { chromium } from 'playwright';

export const BASE = (process.env.QA_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');

/**
 * Chromium with **visible scrollbars**. Headless Chromium hides them by default
 * (--hide-scrollbars), so double-scrollbar and overflow bugs don't show in screenshots.
 */
export function launch(options = {}) {
  return chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'], ...options });
}

/** Signs in with QA_EMAIL / QA_PASSWORD, or the demo account. */
export async function signIn(page) {
  await page.goto(`${BASE}/sign-in`);
  if (process.env.QA_EMAIL && process.env.QA_PASSWORD) {
    await page.getByLabel('Email').fill(process.env.QA_EMAIL);
    await page.locator('input[autocomplete="current-password"]').fill(process.env.QA_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  } else {
    await page.getByRole('button', { name: /demo account/i }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 15_000 });
}

/**
 * Scroll containers that scroll by only a few pixels — the signature of a double scrollbar or an
 * off-by-border height (e.g. a dialog 2px taller than its max-height). Measured, not eyeballed.
 * Returns [] when there are none.
 */
export function scrollGlitches(page, maxPx = 6) {
  return page.evaluate((max) => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      for (const [axis, overflow, size, client] of [
        ['vertical', s.overflowY, el.scrollHeight, el.clientHeight],
        ['horizontal', s.overflowX, el.scrollWidth, el.clientWidth],
      ]) {
        const extra = size - client;
        if (
          (overflow === 'auto' || overflow === 'scroll') &&
          client > 0 &&
          extra > 0 &&
          extra <= max
        ) {
          const name =
            el.tagName.toLowerCase() +
            (el.getAttribute('aria-label')
              ? `[aria-label="${el.getAttribute('aria-label')}"]`
              : '') +
            (typeof el.className === 'string' && el.className
              ? `.${el.className.split(' ').slice(0, 3).join('.')}`
              : '');
          out.push(`${axis} scroll of only ${extra}px on <${name}> (likely a double scrollbar)`);
        }
      }
    }
    return out;
  }, maxPx);
}
