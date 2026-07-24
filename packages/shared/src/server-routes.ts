// URL prefixes the backend owns on the single origin (ADR-0020). The PWA
// service worker must let navigations to these hit the network instead of the
// cached app shell (vite.config.ts), and openapi-contract.spec.ts fails any
// controller route that falls outside them — one list, enforced on both ends.
export const SERVER_ROUTE_PREFIXES = [
  'api',
  'auth',
  'destinations',
  'health',
  'invites',
  'me',
  'trips',
] as const;

export const SERVER_ROUTE_PATTERN = new RegExp(`^/(${SERVER_ROUTE_PREFIXES.join('|')})(/|$)`);
