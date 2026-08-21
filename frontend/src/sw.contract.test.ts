// A contract test over the service worker's SOURCE, and the reason it exists is the
// reason ADR-0197 §8 made the worker its own phase: under `generateSW`, five of the
// six behaviours below were emitted by workbox-build's template. They are now lines
// in `src/sw.ts`, and **every one of them fails silently.** Delete the SKIP_WAITING
// listener and `updateServiceWorker()` posts into the void — no error, no failing
// test, just a build that is never taken until the next cold load. Delete
// `cleanupOutdatedCaches()` and every old precache lives on the device forever.
// Delete the denylist and `/api` navigations answer with the cached app shell.
//
// Why it reads text rather than importing the module: `src/sw.ts` needs the
// `WebWorker` lib (see `tsconfig.sw.json`), whose globals collide with `DOM`, so
// importing it here would drag the conflict into the app's own program. The shape is
// the one `styles/exit-animations.contract.test.ts` already established — a lint rule
// that happens to live in vitest, because there is no linter in this toolchain that
// could hold the rule instead.
//
// What this test canNOT see, stated so nobody trusts it further than it goes: whether
// the worker actually installs, precaches and serves. That needs two real builds and a
// dist swapped under a live tab, which is `scripts/deploy-swap-check.mjs` — run it
// when touching this file or the PWA block, as its own header says.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Comments legitimately name every symbol asserted below — this file's subject is
 *  what the worker DOES, so match declarations only. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SW_SRC = read('./sw.ts');
const SW = stripComments(SW_SRC);
const VITE_CONFIG = stripComments(read('../vite.config.ts'));

describe('the service worker is ours, and these lines have no other alarm', () => {
  // The guard the other contract test taught: an assertion suite that silently reads
  // an empty string passes everything.
  it('found both files', () => {
    expect(SW.length).toBeGreaterThan(500);
    expect(VITE_CONFIG.length).toBeGreaterThan(500);
  });

  // ADR-0185 §1. The worker must WAIT and be taken by an explicit message.
  it('answers SKIP_WAITING, and calls skipWaiting nowhere else', () => {
    expect(SW).toMatch(/addEventListener\(\s*['"]message['"]/);
    expect(SW).toContain('SKIP_WAITING');
    // Exactly one call site: an unconditional top-level `self.skipWaiting()` is the
    // pre-ADR-0185 behaviour restored, and it looks like a harmless line.
    expect(SW.match(/self\.skipWaiting\(\)/g)).toHaveLength(1);
    // …and it is inside the handler, not merely present in the file. The two must sit
    // in one expression, so the gap between them cannot hold another statement.
    const between = SW.slice(SW.indexOf('SKIP_WAITING'), SW.indexOf('self.skipWaiting()'));
    expect(between).not.toContain(';');
  });

  // Without this the worker precaches nothing and the app is not offline-capable —
  // and `injectManifest` FAILS the build on a missing injection point, so this
  // assertion is belt to that brace rather than the only guard.
  it('precaches the injected manifest', () => {
    expect(SW).toMatch(/precacheAndRoute\(\s*self\.__WB_MANIFEST\s*\)/);
  });

  // Emitted by the old template, named in no option we ever set, and the easiest
  // line in the file to lose in a rewrite.
  it('cleans up outdated precaches', () => {
    expect(SW).toContain('cleanupOutdatedCaches()');
  });

  // ADR-0185 §1: not the other half of the skipWaiting pair — it is what makes a
  // first visit offline-capable without a second load.
  it('claims uncontrolled clients', () => {
    expect(SW).toContain('clientsClaim()');
  });

  // The one rule whose absence is invisible until an image or an OAuth redirect is
  // answered with the app shell. It must READ the shared list, never restate it:
  // `SERVER_ROUTE_PREFIXES` is one list enforced on both ends, and the backend's
  // openapi contract spec fails any controller route outside it.
  it('denylists the backend-owned routes from the navigation fallback, from the shared list', () => {
    expect(SW).toMatch(/NavigationRoute\(/);
    expect(SW).toMatch(/denylist:\s*\[\s*SERVER_ROUTE_PATTERN\s*\]/);
    expect(SW).toMatch(/import\s*\{\s*SERVER_ROUTE_PATTERN\s*\}\s*from\s*['"]\S*server-routes['"]/);
  });

  // ADR-0186 §3/§5: cached on demand, deliberately not in the install manifest.
  it('serves the basemap glyphs cache-first under their own cache name', () => {
    expect(SW).toMatch(/map-glyphs\\?\/\.\*\\?\.pbf/);
    expect(SW).toMatch(/CacheFirst\(\{\s*cacheName:\s*['"]map-glyphs['"]/);
  });

  // ── PHASE 1: THE PUSH HANDLERS (ADR-0197 §8) ──────────────────────────────────────
  //
  // The first of these is the one with a penalty attached rather than merely a defect:
  // a `push` handler that resolves without showing a notification is an abuse signal,
  // and browsers eventually revoke the origin's permission for it. So the assertion is
  // not "a notification is shown somewhere" but "there is no path through the handler
  // that does not show one" — which is what the fallback constant exists to guarantee.
  it('shows a notification on every push, including one it cannot read', () => {
    expect(SW).toMatch(/addEventListener\(\s*['"]push['"]/);
    expect(SW).toContain('showNotification');
    // The parse must be the total one, not `event.data.json()` read directly: that
    // throws on a non-JSON body, and a throw inside the handler is a silent push.
    //
    // **Asserted as the CALL, not as the identifier.** `toContain('parsePushPayload')` was
    // the first version and mutation-testing found it vacuous: the import line and the
    // `ReturnType<typeof …>` annotation both satisfy it, so deleting the actual call left
    // the suite green. This is the failure mode `frontend/CLAUDE.md` names — an assertion
    // that reports green forever — caught only by breaking the code on purpose.
    expect(SW).toMatch(/parsePushPayload\(\s*event\.data/);
    // A single `??` onto the fallback is what makes the no-payload path draw something.
    expect(SW).toMatch(/\?\?\s*FALLBACK_NOTIFICATION/);
    // And it must be awaited by the event, or the worker may be killed mid-show.
    expect(SW).toMatch(/event\.waitUntil\(/);
  });

  // A notification that opens a second window every time is how a standalone PWA
  // accumulates them, and the tab already open is the one holding the app's state.
  it('focuses an existing client before opening a window', () => {
    expect(SW).toMatch(/addEventListener\(\s*['"]notificationclick['"]/);
    const click = SW.slice(SW.indexOf("'notificationclick'"));
    expect(click).toContain('matchAll');
    expect(click).toContain('.focus()');
    // `openWindow` must come after the loop that tries to focus, not instead of it.
    expect(click.indexOf('.focus()')).toBeLessThan(click.indexOf('openWindow'));
  });

  // The tap target comes from the payload, so it is the one field an attacker-shaped
  // payload could aim. `parsePushPayload` refuses anything but an absolute same-origin
  // path; the handler must not then widen it back.
  it('resolves the tap target against our own origin', () => {
    const click = SW.slice(SW.indexOf("'notificationclick'"));
    expect(click).toMatch(/new URL\([^)]*self\.location\.origin/);
    expect(click).toMatch(/startsWith\('\/'\)/);
  });

  // The worker is bundled separately with `inlineDynamicImports`, so one import
  // reaching the app graph inlines the app into the worker — megabytes, on the
  // critical path of every install.
  it('imports nothing from the app graph', () => {
    const imports = [...SW.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    const appGraph = imports.filter((spec) =>
      /(^|\/)(state|ui|screens|i18n|lib|constants|app-name)(\/|$)/.test(spec),
    );
    expect(appGraph).toEqual([]);
  });
});

describe('the PWA config still points at that worker', () => {
  // The highest-value assertion here, and the least obvious: flipping back to
  // `generateSW` does not delete `src/sw.ts` or fail anything — it just stops using
  // it. Every line above would still be present, still tested, and no longer shipped.
  it('builds the worker from src/sw.ts via injectManifest', () => {
    expect(VITE_CONFIG).toMatch(/strategies:\s*['"]injectManifest['"]/);
    expect(VITE_CONFIG).toMatch(/srcDir:\s*['"]src['"]/);
    expect(VITE_CONFIG).toMatch(/filename:\s*['"]sw\.ts['"]/);
  });

  // ADR-0185 §1 again, from the config side: `autoUpdate` forces Workbox's
  // `skipWaiting` on and the `waiting` event the whole swap hangs off never fires.
  it('keeps the prompt registration that makes the swap atomic', () => {
    expect(VITE_CONFIG).toMatch(/registerType:\s*['"]prompt['"]/);
  });

  // The plugin registers the worker as `type: 'classic'` in every production build,
  // so an ES-module worker is only ever accidentally valid.
  it('emits a classic script', () => {
    expect(VITE_CONFIG).toMatch(/rollupFormat:\s*['"]iife['"]/);
  });

  // A `workbox` block is silently IGNORED under `injectManifest`. Leaving one behind
  // would read as configured behaviour that does not run — which is how the four
  // lines above would come to be deleted from the worker as duplicates.
  it('carries no generateSW-only workbox block', () => {
    expect(VITE_CONFIG).not.toMatch(/^\s*workbox:\s*\{/m);
  });
});
