// The service worker — ours since phase 0, because a `push` listener cannot be added to a
// generated one (ADR-0197 §8). Phase 1 adds that listener, at the bottom of this file.
//
// **Everything in this file was previously declarative config** in
// `vite.config.ts`'s `workbox` block, emitted by workbox-build's `sw-template`.
// Under `injectManifest` that template is gone and each line is ours to keep, so
// the comments that explained the config moved here with the code they explain.
// A missing line is a silently degraded PWA and NOT a build error, which is why
// `sw.contract.test.ts` sits beside this file and fails the build over every line
// below that has no other alarm — and over the config that decides this file is
// shipped at all, since flipping back to `generateSW` breaks nothing and simply
// stops using it.
//
// It was written by reading the worker `generateSW` actually produced — not from
// the option list — and that is how `cleanupOutdatedCaches()` got in: it is not
// mentioned in any option we set, it was emitted anyway, and without it every
// old precache survives forever on the device.
//
// **This file is not in the app's TypeScript program.** It needs the `WebWorker`
// lib, whose globals collide with `DOM`, so it has its own `tsconfig.sw.json`
// which `pnpm typecheck` runs as a second pass. Nothing here may import from the
// app graph: this bundle is built separately (`inlineDynamicImports`), so an
// import reaching `state/` or `ui/` would inline the app into the worker.
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
// A relative source import, for the same two reasons `vite.config.ts` states for
// the same module: the alias does not apply here, and `@waypoint/shared`'s built
// dist is CommonJS. It is also deliberately the FILE and not the package barrel —
// the barrel would inline zod and every entity schema into the worker, and this
// module imports nothing itself.
import {
  PUBLIC_READER_PATTERN,
  SERVER_ROUTE_PATTERN,
} from '../../packages/shared/src/server-routes';
// The same rule as the line above, and the reason `push.ts` is zod-free: this bundle is
// built with `inlineDynamicImports`, so importing the package barrel would inline zod and
// every entity schema into the worker.
import { parsePushPayload } from '../../packages/shared/src/push';

/** The worker's own global. Declared rather than imported: `__WB_MANIFEST` is a
 *  build-time injection point, not a runtime value, and writing its shape here is
 *  cheaper than an ambient-types dependency. */
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// **The swap is the app's to time, not the browser's** (ADR-0185 §1). `skipWaiting`
// is not called on install; the worker waits, and takes the tab only when
// `lib/useAppUpdate.ts` posts SKIP_WAITING at a moment a reload costs nothing.
// That listener is the whole of `registerType: 'prompt'` on this side — under
// `generateSW` it was emitted only because `skipWaiting: false`, and losing it
// here means `updateServiceWorker()` posts into the void and no build is ever
// taken until the next cold load. The contract test guards exactly this.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Kept ON, and it is not the other half of that pair (ADR-0185 §1): with no
// previous worker there is no old build to be incoherent with, so this only means
// "the first visit is offline-capable without a second load". On an update the
// claim rides our own `skipWaiting` above.
clientsClaim();

// The precache. `globPatterns` (still in `vite.config.ts`, since choosing WHICH
// files is manifest generation and not worker behaviour) is what puts the
// self-hosted `.woff2` faces in here — workbox-build's default patterns silently
// skip a font sitting beside the `.css` that matched.
precacheAndRoute(self.__WB_MANIFEST);

// Emitted by the old template and easy to lose in a rewrite: without it, every
// precache from every previous build stays on the device forever.
cleanupOutdatedCaches();

// The app shell, precached and bound once — the fallback below and the public
// reader's own route both answer with THIS handler, so there is one shell in the
// worker rather than two.
const appShell = createHandlerBoundToURL('index.html');

// **The public reader prefers the network, and this route must be registered
// BEFORE the fallback** (ADR-0213's seventeenth amendment; workbox matches routes
// in registration order, so the NavigationRoute below would otherwise claim it).
//
// `/s/<code>` is the one navigation whose document cannot be one build behind the
// server: it fetches a projection from whatever was just deployed and parses it
// with a STRICT schema, so a shell served from the previous precache fails on a
// field that build has never heard of — and the reader, who has no app to reopen,
// reads that as a revoked link. Everywhere else ADR-0185's deliberate wait is
// right, because the app is whole while it waits; here the page is not.
//
// The shell stays the FALLBACK, on a throw (offline) and on any non-2xx: a
// rollout's few seconds of 502 must not put a proxy's error page in front of a
// reader when the cached document would have rendered and retried
// (`SharedItinerary`'s ladder).
const network = new NetworkOnly();
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && PUBLIC_READER_PATTERN.test(url.pathname),
  async (options) => {
    try {
      const response = await network.handle(options);
      if (response.ok) return response;
    } catch {
      /* offline, or nobody answered: the cached shell is the better answer */
    }
    return appShell(options);
  },
);

// Backend-owned navigations (the OAuth redirect, `/health`, and the byte routes
// that are fetched by a plain `<img src>` or a range request) must hit the
// network — the fallback otherwise answers EVERY path with the cached app shell,
// which for those routes means an app shell where an image or an archive should
// be. `SERVER_ROUTE_PREFIXES` is one list enforced on both ends, and the backend
// contract spec fails any controller route outside it.
registerRoute(
  new NavigationRoute(appShell, {
    denylist: [SERVER_ROUTE_PATTERN],
  }),
);

// **The basemap's glyphs, cached but deliberately NOT precached** (ADR-0186
// §3/§5). A GL renderer fetches pre-rendered SDF glyphs per 256-codepoint range
// and `public/map-glyphs/` holds all 768 of them — 11.1 MB, which is exactly the
// automatic-download-on-roaming §5 was written against, so they are not in the
// install manifest. Ranges arrive as labels need them and then survive offline;
// the archive download warms the rest under §5's gate, which needs no cache name
// of its own because this rule catches it.
//
// Ceiling worth naming: CacheFirst never revalidates, so re-vendoring different
// glyph bytes needs a new path (or a `cacheName` bump), not a redeploy. They are
// Noto releases — this will not happen often.
registerRoute(/\/map-glyphs\/.*\.pbf$/, new CacheFirst({ cacheName: 'map-glyphs' }), 'GET');

// ── NOTIFICATIONS (ADR-0197 §8, phase 1) ────────────────────────────────────────────────

/** What a malformed or empty payload draws. **The fallback exists because a `push` handler
 *  that shows nothing is punished**: browsers treat a silent push as an abuse signal and
 *  eventually revoke the origin's permission entirely. So there is no path through the
 *  handler below that does not call `showNotification` — including the one where our own
 *  server sent something this build cannot read.
 *
 *  Latin, and deliberately not from `i18n/he.ts`: the worker cannot import the app graph,
 *  and this string is only reachable through a bug. */
const FALLBACK_NOTIFICATION = { title: 'Travelive', body: '', url: '/' };

self.addEventListener('push', (event) => {
  // `event.data.json()` throws on a non-JSON body, and a throw here is a silent push.
  let parsed: ReturnType<typeof parsePushPayload> = null;
  try {
    parsed = parsePushPayload(event.data?.json());
  } catch {
    parsed = null;
  }
  const { title, body, url } = parsed ?? FALLBACK_NOTIFICATION;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // The app's own maskable icon, already precached — so a notification has our face
      // on it offline, and needs no asset of its own.
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      // Where the tap goes. Carried through `data` rather than the tag, because `tag` is
      // the COLLAPSE key: two notifications sharing one replace each other.
      data: { url },
      // Per-kind collapsing is ADR-0198's business (a second reminder about one task
      // should replace the first). Phase 1 has one kind and no such rule, so nothing
      // collapses yet and the tag is deliberately unset.
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: unknown } | null)?.url;
  const path = typeof raw === 'string' && raw.startsWith('/') ? raw : '/';
  const target = new URL(path, self.location.origin);
  event.waitUntil(
    (async () => {
      // **Focus an open tab before opening a new one.** A standalone PWA that opens a
      // second window on every notification tap accumulates them, and the one already
      // running holds the app's state. `includeUncontrolled` matters: a client loaded
      // before this worker took over is still the user's open app.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        // Navigate the focused client if it is somewhere else. `navigate` can reject (it
        // is not available to every client type), and a failed navigation must not lose
        // the focus we just gained.
        if (client.url !== target.href) await client.navigate(target.href).catch(() => {});
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
