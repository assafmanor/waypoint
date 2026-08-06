// **The app answers on one host, and sends every other host there.**
//
// A custom domain arrives as a pair — `travelive.app` and `www.travelive.app` — and both
// can be pointed at the same Railway service. Serving the app on both is the failure mode,
// not the feature: this app's session is a **host-only cookie** (`wp_refresh`, and the
// short-lived `wp_oauth` that carries the OAuth state), set without a `Domain` attribute
// (ADR-0020), so the two hosts are two different logins. Start the Google round-trip on
// one and land on the other — which is exactly what happens, since
// `GOOGLE_OAUTH_REDIRECT_URI` names a single fixed host — and the state cookie isn't sent,
// the callback can't verify itself, and the user is bounced home silently signed out.
//
// So one host is canonical (`FRONTEND_URL`, the same value the post-login redirect already
// uses) and every other host answering for this service redirects there, path and query
// intact, before anything else in the stack runs.
//
// **Production only.** In dev `FRONTEND_URL` is the *other* origin — Vite on `:5173`, with
// the API on `:3000` — so applying this locally would bounce every API call at the dev
// server. There it stays a CORS origin and nothing more.

/** `/health` and `/health/ready` are the deploy gate (railway.json). Railway calls them
 *  with its own `Host`, so a redirect here would read as a failing healthcheck and kill
 *  the deploy — the one path that must answer on any host. */
const HEALTH_PATH = '/health';

export interface HostRedirectRequest {
  method: string;
  /** Path + query, exactly as requested — the invite deep link is the whole point. */
  originalUrl: string;
  headers: { host?: string };
}

/**
 * Where this request should be sent instead, or `null` to serve it here.
 *
 * Only `GET`/`HEAD` are redirected: a 301 on a `POST` is turned into a `GET` by the
 * browser, silently dropping the body. Nothing else needs it — a document navigation is
 * a GET, and once that lands on the canonical host every request the page makes is
 * same-origin by construction.
 */
export function canonicalRedirectTarget(
  canonical: string | undefined,
  req: HostRedirectRequest,
): string | null {
  if (!canonical) return null;
  let origin: string;
  try {
    origin = new URL(canonical).origin;
  } catch {
    return null; // validate-config already refuses to boot on this; don't compound it.
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return null;

  const path = req.originalUrl.split('?')[0];
  if (path === HEALTH_PATH || path.startsWith(`${HEALTH_PATH}/`)) return null;

  const host = req.headers.host?.toLowerCase();
  if (!host || host === new URL(origin).host.toLowerCase()) return null;

  return origin + req.originalUrl;
}

export interface HostRedirectResponse {
  redirect(status: number, url: string): void;
}

/** **302, not 301.** A permanent redirect is what a canonical host normally warrants, but
 *  this app is invite-only — there is no search index to please — and a 301 is cached by
 *  the browser indefinitely, so one wrong `FRONTEND_URL` during a domain move would be
 *  stuck in the group's phones long after the variable was fixed. A temporary redirect
 *  costs one request and can always be taken back. */
export function canonicalHostMiddleware(canonical: string | undefined) {
  return (req: HostRedirectRequest, res: HostRedirectResponse, next: () => void): void => {
    const target = canonicalRedirectTarget(canonical, req);
    if (target) res.redirect(302, target);
    else next();
  };
}
