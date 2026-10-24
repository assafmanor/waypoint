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

/**
 * **True for a URL whose own path contains a bearer credential**, which is the property the
 * headers above are protecting — not "is this the sharing feature".
 *
 * Four such paths: `/s/<code>` (ADR-0213's reader), `/join/<code>` (ADR-0067's invite), and
 * the per-trip link-preview cover each of them points `og:image` at — `/og/s/<code>.png` and
 * `/og/join/<code>.png` (ADR-0220's 2026-09-06 amendment), which carry the same credential in
 * the same position and now draw the trip's name into a picture.
 * The invite joined it in ADR-0220 and the reason is that its response CHANGED: until the
 * link preview it was a content-free app shell at a secret URL, and it is now the trip's
 * name and dates at one. `no-referrer` mattered even before that — a tap from the join
 * screen would hand the destination site the invite code in `Referer` — and it was simply
 * never applied here.
 *
 * The name moved with the meaning: `isPublicSharePath` said sharing, and the third caller
 * would have had to decide whether an invite counts as a share. A credential in a path is
 * not a judgement call.
 */
export function isBearerLinkPath(url: string): boolean {
  return /^\/(?:og\/)?(s|join)\/[^/?#]+/.test(url);
}
