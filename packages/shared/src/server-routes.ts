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
  'trips',
  // Uploaded avatar bytes (ADR-0133 §12). It has to be here for the SERVICE WORKER
  // half, not just the contract test: an avatar is loaded by a plain `<img src>`, so
  // without this prefix the PWA would answer that request with the cached app shell
  // and every uploaded face would fail to decode in production.
  'users',
] as const;

export const SERVER_ROUTE_PATTERN = new RegExp(`^/(${SERVER_ROUTE_PREFIXES.join('|')})(/|$)`);
