// **Does the service worker actually draw a notification?** (ADR-0197 §8, phase 1.)
//
// The handler's rule has a penalty attached rather than merely a defect: a `push` that
// resolves without showing anything is an abuse signal, and browsers eventually revoke the
// origin's permission for it. `src/sw.contract.test.ts` asserts the grammar that makes that
// impossible; this asserts the behaviour.
//
// It needs no push service and no VAPID keypair. Chrome DevTools Protocol can deliver a push
// message straight to a registered worker (`ServiceWorker.deliverPushMessage`), and the page
// can then read back what the worker drew (`registration.getNotifications()`) — so the whole
// round trip is local and deterministic. FCM is not part of what this proves; what it proves
// is the half that is ours.
//
// Run it from anywhere, against a PRODUCTION build (there is no service worker under
// `pnpm dev`):
//
//   pnpm --filter @waypoint/frontend build
//   node scripts/push-handler-check.mjs
//
// Sibling of `deploy-swap-check.mjs` and deliberately not in the vitest or Playwright
// suites, for the same reason: it needs a production build and a real browser.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Resolved against `frontend/`, where the dependency lives — see deploy-swap-check.mjs's
// header for why the module's own URL is what matters here and the cwd is not.
const { chromium } = createRequire(new URL('../frontend/package.json', import.meta.url))(
  '@playwright/test',
);

const DIST = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../frontend/dist');
const PORT = 4322;
const ORIGIN = `http://localhost:${PORT}`;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  let file = join(DIST, decodeURIComponent(url.pathname));
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(url.pathname)) {
      res.writeHead(404).end('gone');
      return;
    }
    file = join(DIST, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));

// The pinned Chromium some sandboxes ship, the same probe `deploy-swap-check.mjs` and
// `playwright.config.ts` use — a version mismatch here otherwise sends Playwright looking
// for a headless shell that was never downloaded.
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(PINNED_CHROMIUM) ? PINNED_CHROMIUM : undefined,
});
const context = await browser.newContext();
// The permission the worker needs to draw anything. Granted rather than prompted: the
// prompt is a user gesture's business (ADR-0197 §7) and is not what this script tests.
await context.grantPermissions(['notifications'], { origin: ORIGIN });
const page = await context.newPage();

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

await page.goto(ORIGIN);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
  timeout: 30_000,
});
console.log('[sw] registered and controlling the page');

const cdp = await context.newCDPSession(page);

// **The registration id, resolved once and BEFORE any delivery.** The first version of this
// script asked for it lazily inside the first `deliver()`, and got it by cycling
// `ServiceWorker.disable`/`enable` to make CDP replay its registrations — which disturbed the
// worker enough that the first pushes went nowhere. The script reported four failures against
// a worker that was behaving perfectly, which is the more expensive kind of wrong: it accuses
// the code. `enable` replays the registrations on its own, so listen first and enable once.
const registrationId = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('no service worker registration found')), 15_000);
  cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
    const match = registrations.find((entry) => entry.scopeURL.startsWith(ORIGIN));
    if (!match) return;
    clearTimeout(timer);
    resolve(match.registrationId);
  });
  void cdp.send('ServiceWorker.enable');
});

/** What the worker currently has on screen, as the page can see it. */
const drawn = () =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();
    return notifications.map(({ title, body, data }) => ({ title, body, data }));
  });

/** Deliver one push and read back what the worker drew.
 *
 *  Polled with a deadline rather than a fixed sleep — the handler is async (`waitUntil`), so
 *  the notification lands some time after the CDP call resolves, and a sleep long enough to
 *  be safe is a sleep long enough to be slow five cases in a row. */
async function deliver(data) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    for (const notification of await registration.getNotifications()) notification.close();
  });
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId, data });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const shown = await drawn();
    if (shown.length > 0) return shown;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

// 1 — a well-formed payload draws itself.
const real = await deliver(
  JSON.stringify({ kind: 'test', title: 'משימה להיום', body: 'צילום דרכונים', url: '/trips/x' }),
);
check('a well-formed payload is drawn', real.length === 1, JSON.stringify(real[0]));
check('its title is the payload’s', real[0]?.title === 'משימה להיום');
check('its body is the payload’s', real[0]?.body === 'צילום דרכונים');
check('the tap target rides `data`', real[0]?.data?.url === '/trips/x');

// 2 — the case with the penalty attached: a payload this build cannot read must STILL draw.
for (const [label, data] of [
  ['not JSON at all', 'this is not json'],
  ['JSON that is not a payload', JSON.stringify({ nope: true })],
  [
    'a payload aimed off-origin',
    JSON.stringify({ kind: 'test', title: 't', body: 'b', url: 'https://evil.example' }),
  ],
  ['an empty body', ''],
]) {
  const shown = await deliver(data);
  check(`${label} still draws a notification`, shown.length === 1, shown[0]?.title);
  // And it must be the FALLBACK, not a half-read payload: a notification titled with
  // attacker-supplied text would defeat the parse it slipped past.
  if (label !== 'a payload aimed off-origin') continue;
  check('an off-origin payload draws the fallback, not its own title', shown[0]?.title !== 't');
}

await browser.close();
server.close();

console.log('');
if (failures.length) {
  console.log(`>>> VERDICT: ${failures.length} failure(s) — the worker can be silenced by a push.`);
  process.exit(1);
}
console.log('>>> VERDICT: every push draws a notification, including the ones it cannot read.');
