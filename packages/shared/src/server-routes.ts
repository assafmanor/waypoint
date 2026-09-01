// URL prefixes the backend owns on the single origin (ADR-0020). The PWA
// service worker must let navigations to these hit the network instead of the
// cached app shell (`frontend/src/sw.ts`), and openapi-contract.spec.ts fails any
// controller route that falls outside them — one list, enforced on both ends.
export const SERVER_ROUTE_PREFIXES = [
  'api',
  'auth',
  'destinations',
  // Stored enrichment image bytes (ADR-0166 §7 / Phase 2). Here for the SERVICE WORKER
  // half, exactly as `users` is below: an enrichment thumbnail is loaded by a plain
  // `<img src>`, so without this prefix the PWA would answer that request with the cached
  // app shell and every photo would fail to decode.
  'enrichment',
  'health',
  'invites',
  // The shared coarse basemap archive (ADR-0186 §4). Here for the SERVICE WORKER half,
  // for the same reason `enrichment` and `users` are: it is fetched by the map renderer
  // as raw bytes over byte RANGES, so without this prefix the PWA would answer with the
  // cached app shell and the archive would fail to parse. It is deliberately trip-less —
  // one public OSM layer shared by every trip — which is why it needs a prefix of its own
  // rather than living under `trips`.
  'map',
  'me',
  // The push subscription routes (ADR-0197 §2). Control plane, beside `me` rather than
  // under `trips`: a subscription belongs to a person and a device, and one device is
  // reached about every trip that person is in.
  'notifications',
  // The unauthenticated itinerary share reads (ADR-0213 §5). Here for BOTH halves, and
  // the service-worker one is the trap: the public page's own path is `/s/<code>` and is
  // NOT in this list, while the JSON and PDF it then fetches must reach the backend. Two
  // different prefixes for one feature, on purpose — miss this one and production answers
  // the API call with `index.html`. (`/s/<code>` has a rule of its own now; see
  // `PUBLIC_READER_PATTERN` below.)
  'shared-itineraries',
  'trips',
  // Uploaded avatar bytes (ADR-0133 §12). It has to be here for the SERVICE WORKER
  // half, not just the contract test: an avatar is loaded by a plain `<img src>`, so
  // without this prefix the PWA would answer that request with the cached app shell
  // and every uploaded face would fail to decode in production.
  'users',
] as const;

export const SERVER_ROUTE_PATTERN = new RegExp(`^/(${SERVER_ROUTE_PREFIXES.join('|')})(/|$)`);

/**
 * **The public reader's own path** — `/s/<code>`, the page a stranger lands on
 * (ADR-0213's seventeenth amendment).
 *
 * Not a backend prefix: the SPA owns this route, and `sharing.service.ts` composes the
 * same `/s/<code>` when it hands a link out. It is here because it is the second answer to
 * the one question this file exists to answer — **which navigations may the cached app
 * shell NOT be the whole answer to** — and the reason is different from every prefix above.
 *
 * The shell is precached, so a device that already has the worker keeps being served the
 * PREVIOUS build's `index.html` here until the parked build is taken (ADR-0185 makes that
 * wait deliberate, and right, for the app). The app survives it because it is whole; this
 * page does not, because the payload it then fetches comes from the deploy that just
 * happened, and `sharedItinerarySchema` is strict in both directions. So this one
 * navigation prefers the network and keeps the shell as its offline fallback
 * (`frontend/src/sw.ts`).
 */
export const PUBLIC_READER_PATTERN = /^\/s(\/|$)/;
