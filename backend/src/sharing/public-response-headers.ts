import type { Response } from 'express';

/**
 * **The headers every public sharing response carries**, in one place because they are one
 * decision rather than three (ADR-0213).
 *
 * A shared itinerary is a bearer-link secret with no discovery layer, and each header
 * closes a specific way that promise leaks in practice:
 *
 * - `no-store` — a shared proxy or a browser cache holding the projection outlives the
 *   revocation that was supposed to end it. It also keeps the response out of the PWA's
 *   Cache Storage, so a rotated code cannot be read back off a device offline.
 * - `no-referrer` — a reader tapping a map link would otherwise hand the destination site
 *   the full `/s/<code>` URL in `Referer`, i.e. the credential itself.
 * - `noindex, nofollow, noarchive` — the page is meant to be passed between people, not
 *   found. A crawler that follows one pasted link would put a private trip in a search
 *   index and a cache that outlives the link.
 */
export const PUBLIC_SHARE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

export function applyPublicShareHeaders(res: Response): void {
  for (const [name, value] of Object.entries(PUBLIC_SHARE_HEADERS)) res.setHeader(name, value);
}

/** True for a URL the SPA fallback is about to answer with the app shell, when that URL is
 *  a public share page. The shell itself carries no itinerary, but the response must still
 *  refuse indexing and referrer leakage — the code is in the URL being requested. */
export function isPublicSharePath(url: string): boolean {
  return /^\/s\/[^/?#]+/.test(url);
}
