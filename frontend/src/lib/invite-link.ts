// **The invite link is one string — the shortest one that still works.**
//
// The API hands back a path (`/join/7Kq2mB`, ADR-0067) — the origin is the client's to
// supply, because the backend serves the app and the API on one host and has no business
// hardcoding which name that host answers to. So the url is built against the origin this
// page is on, which the server has already canonicalised (ADR-0169): land on `www.` and you
// were sent to the bare host before this code ever ran.
//
// **What comes off is the scheme, and only the scheme.** `https://travelive.app/join/7Kq2mB`
// is plumbing on a 360px line; every link has a scheme and nobody reads it. Dropping it is
// free here: `.app` is an HSTS-preloaded TLD, so a scheme-less link to this app cannot be
// downgraded to http — the browser upgrades it before the first request — and the chat apps
// an invite is actually pasted into linkify a bare host + path.
//
// **And the `www.` comes off too** (owner, 2026-08-06). This reverses the rule this file
// shipped with, so the reason it was safe to reverse matters more than the strip itself.
//
// The original rule was: an invite has no `href` behind it — it IS the href, pasted into
// another app — so it may only drop what cannot change where it goes, and a `www.` removed
// while `www` is the canonical host would be a dead link in somebody's group chat. That was
// true when written. It stopped being true once **both** of these held: the apex resolves to
// the service (Cloudflare flattens the apex `CNAME` onto Railway), and ADR-0169 §2 redirects
// **any** host this service answers on to the canonical one with the path intact. So
// `travelive.app/join/<code>` now arrives wherever the app actually lives — apex-canonical or
// www-canonical — and the short form cannot strand anyone.
//
// The residual risk is a browser holding a **cached 301** from the era when the apex was a
// GoDaddy parked page: that device opens the lander no matter what we write. It is per-device
// and shrinking, and it does not apply to the people invites are sent to, who have typically
// never visited the domain at all.
//
// Note this is still not `prettyUrl` (`lib/external-url.ts`), which also strips tracking
// params and trailing slashes. That one abbreviates a LABEL sitting on a working href and may
// take liberties; this one is the link, and takes exactly two.

/**
 * A public app link as one string, shown and copied — deliberately the same string, because
 * a label that differs from what the clipboard holds is a small lie the reader can't see.
 *
 * **Two links now take exactly these two liberties** (ADR-0213): `/join/<code>` and the
 * shared itinerary's `/s/<code>`. Both are pasted into somebody else's chat rather than
 * clicked from an `href` here, so both need the same rule about what may come off — which
 * is why this generalized rather than the share sheet growing a near-copy that drops
 * `www.` slightly differently.
 *
 * @param path the root-relative path the API returned (`/join/<code>`, `/s/<code>`).
 */
export function publicAppLink(path: string): string {
  const url = new URL(path, window.location.origin);
  return url.host.replace(/^www\./i, '') + url.pathname + url.search;
}

/** The invite link, which is what its call sites read. */
export const inviteLink = publicAppLink;
