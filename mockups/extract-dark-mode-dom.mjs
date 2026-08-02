/* Captures the four surfaces `build-dark-mode-v1.mjs` draws, from the RUNNING
 * app (DEV_AUTH=1, seeded). Output is committed so the build step does not need
 * a server. See the generator's header for the whole recipe.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
const OUT = new URL('./dark-mode-v1.dom.json', import.meta.url).pathname;

const TRIP_LIVE = new Date('2026-08-02T05:45:00Z').getTime(); // mid-trip → Trip mode
const PRE_TRIP = new Date('2026-07-22T09:00:00Z').getTime(); // before it starts → Plan mode

const browser = await chromium.launch();
const out = {};

async function grab(key, { clock, route = '/', after }) {
  const ctx = await browser.newContext({
    viewport: { width: 411, height: 914 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
  });
  const page = await ctx.newPage();
  await page.addInitScript((c) => localStorage.setItem('waypoint:dev-now', String(c)), clock);
  if (key === 'login') {
    // DEV_AUTH treats an un-tokened request as the seeded user, so /login always
    // redirects. Refuse /me instead — that is the real signed-out condition.
    await page.route('**/me', (r) => r.fulfill({ status: 401, body: '{}' }));
  }
  await page.goto('http://localhost:5173' + route, { waitUntil: 'networkidle' });
  if (after) await after(page);
  await page.waitForTimeout(1200);
  const res = await page.evaluate(() => {
    const app = document.querySelector('.app');
    return {
      html: app ? app.outerHTML : document.body.innerHTML,
      mode: app?.getAttribute('data-mode') ?? null,
      cls: app?.className ?? '',
    };
  });
  out[key] = res;
  console.log(`${key.padEnd(12)} mode=${res.mode}  ${res.html.length} chars`);
  await ctx.close();
}

await grab('tripHome', { clock: TRIP_LIVE });
await grab('planHome', {
  clock: PRE_TRIP,
  after: async (page) => {
    const card = page.locator('.trip-card, .trip-hero').first();
    if (await card.count()) {
      await card.click();
      await page.waitForTimeout(1500);
    }
  },
});
await grab('login', { clock: TRIP_LIVE, route: '/login' });
await grab('settings', { clock: TRIP_LIVE, route: '/settings' });

writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('->', OUT);
await browser.close();
