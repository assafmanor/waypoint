// **The post-deploy freeze check** (ADR-0185). Two real builds, a `dist` swapped
// underneath a live tab, driven in real Chromium.
//
// ADR-0181 called this untestable — "it needs two builds and a dist swapped
// underneath a live tab" — and that was true of a unit test, not of a script. It
// is not in the vitest or Playwright suites because it needs two production
// builds and a server whose contents change mid-run; run it by hand when
// touching `vite.config.ts`'s PWA block or `lib/useAppUpdate.ts`. It earns its
// keep: it caught the reload that never fired (see `useAppUpdate.ts` on
// `onNeedReload`), which every unit test in the repo passed straight through.
//
// Run from `frontend/` (it imports Playwright's chromium):
//
//   pnpm --filter @waypoint/frontend build && cp -r dist /tmp/A
//   # …make any source change, then…
//   pnpm --filter @waypoint/frontend build && cp -r dist /tmp/B
//   cd frontend && node ../scripts/deploy-swap-check.mjs /tmp/A /tmp/B
//
// Note the change between builds must survive minification — a comment does not,
// and two builds with identical hashes prove nothing.
//
// What it asserts, in order:
//   1. after the deploy, is the new worker PARKED or has it claimed the tab?
//   2. can the live page still fetch a chunk only the old build had? (`no-store`
//      on the assets, so the service worker is the only thing that could serve it)
//   3. released from the hold, does the app take the new build with no user action?
//
// A focused <input> is injected before the deploy on purpose: it trips
// `canReloadQuietly()`, so the automatic swap is HELD and the parked state is
// observable. Blurring it releases the same path and proves it end to end.
//
// Against the pre-ADR-0185 config (`autoUpdate` + `skipWaiting: true`) step 2
// answers 404 — that 404 IS the blank screen.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from '@playwright/test';

const [dirA, dirB] = process.argv.slice(2);
let serving = dirA;

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
  const url = new URL(req.url, 'http://localhost');
  let file = join(serving, decodeURIComponent(url.pathname));
  if (!existsSync(file) || statSync(file).isDirectory()) {
    // The real deploy 404s a missing hashed asset and only falls back for navigations.
    if (extname(url.pathname)) {
      res.writeHead(404).end('gone');
      return;
    }
    file = join(serving, 'index.html');
  }
  const body = await readFile(file);
  // `no-store` on the assets so nothing but the service worker can be the reason
  // an old chunk still resolves. Production sends `immutable` here — a second,
  // independent layer of the same protection, deliberately not relied on below.
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(body);
});
await new Promise((r) => server.listen(4321, r));

const assetsA = await readdir(join(dirA, 'assets'));
const assetsB = new Set(await readdir(join(dirB, 'assets')));
const vanished = assetsA.filter((f) => !assetsB.has(f) && f.endsWith('.js'));
if (!vanished.length) throw new Error('builds are identical — nothing to prove');
console.log(`\nbuild B deletes ${vanished.length} of build A's ${assetsA.length} assets`);

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    : undefined,
});
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    console.log(`  [console.${m.type()}] ${m.text().slice(0, 160)}`);
});

const swState = () =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return {
      waiting: !!r?.waiting,
      installing: !!r?.installing,
      controlled: !!navigator.serviceWorker.controller,
      activeIsController: r?.active === navigator.serviceWorker.controller,
    };
  });

await page.goto('http://localhost:4321/');
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
  timeout: 20_000,
});
// Which entry chunk this document is running — the marker for "did it reload".
const entryA = await page.evaluate(
  () =>
    [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).join() ||
    performance.getEntriesByType('resource').find((e) => e.name.includes('/assets/index-'))?.name,
);
console.log(`[A] controlled by a service worker, running ${entryA}`);

// Hold the automatic swap: a focused field is unsaved work.
await page.evaluate(() => {
  const i = document.createElement('input');
  i.id = 'hold';
  document.body.append(i);
  i.focus();
});

// ── the deploy ────────────────────────────────────────────────────────────────
serving = dirB;
console.log('[deploy] dist swapped to build B');
await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
await page.waitForTimeout(5000);

const after = await swState();
console.log(`[after update] new worker PARKED (waiting):     ${after.waiting}`);
console.log(`[after update] tab still on its own worker:     ${after.activeIsController}`);

const victim = `/assets/${vanished[0]}`;
const reach = await page.evaluate(async (u) => {
  const cached = await caches.match(u);
  const res = await fetch(u).catch(() => null);
  return { inSwCache: !!cached, ok: !!res?.ok, status: res?.status ?? 'network error' };
}, victim);
console.log(`\n>>> a chunk only build A had: ${victim}`);
console.log(`>>> still in the service-worker cache: ${reach.inSwCache}`);
console.log(`>>> still fetchable by the live page:  ${reach.ok} (${reach.status})`);
console.log(
  reach.ok
    ? '>>> VERDICT: the running build stayed whole — no blank screen possible.'
    : '>>> VERDICT: the running build was broken by the deploy — this IS the freeze.',
);

// ── release the hold, and let the app take the update by itself ───────────────
if (after.waiting) {
  console.log('\n[release] blurring the field; nothing else is touched');
  // Spy on the one observable the app's quiet path produces.
  await page.evaluate(async () => {
    window.__probe = {
      skipWaitingSent: false,
      controllerChanged: false,
      marker: 'build-A-document',
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.__probe.controllerChanged = true;
    });
    const r = await navigator.serviceWorker.getRegistration();
    const w = r.waiting;
    const orig = w.postMessage.bind(w);
    w.postMessage = (...a) => {
      window.__probe.skipWaitingSent = JSON.stringify(a[0]);
      return orig(...a);
    };
  });
  const navigated = page.waitForNavigation({ timeout: 90_000 }).catch(() => null);
  await page.evaluate(() => document.getElementById('hold')?.blur());
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(10_000);
    const probe = await page.evaluate(async () => {
      if (!window.__probe) return { sent: 'PAGE RELOADED' };
      const r = await navigator.serviceWorker.getRegistration();
      return {
        sent: window.__probe.skipWaitingSent,
        ctrlChanged: window.__probe.controllerChanged,
        waiting: !!r?.waiting,
        activeIsController: r?.active === navigator.serviceWorker.controller,
      };
    });
    console.log(
      `  t+${i * 10}s  skipWaiting: ${probe.sent} | controllerchange fired: ${probe.ctrlChanged} | still waiting: ${probe.waiting} | tab on new worker: ${probe.activeIsController === false ? 'NO (stale)' : probe.activeIsController}`,
    );
    if (probe.sent === 'PAGE RELOADED') break;
  }
  await navigated;
  const entryB = await page.evaluate(
    () =>
      [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).join() ||
      performance.getEntriesByType('resource').find((e) => e.name.includes('/assets/index-'))?.name,
  );
  console.log(
    `  [page] visible text: ${(await page.evaluate(() => document.body.innerText)).slice(0, 120).replace(/\n/g, ' | ')}`,
  );
  const state = await swState();
  console.log(`[released] now running ${entryB}`);
  console.log(
    entryB !== entryA && !state.waiting
      ? '>>> VERDICT: the app took the new build on its own, with no user action.'
      : '>>> VERDICT: the automatic swap did NOT happen.',
  );
}

await browser.close();
server.close();
