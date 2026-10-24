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
 * **The link as it LEAVES the app** — clipboard, share sheet, anywhere a string becomes
 * somebody else's message. Scheme included, and that is the whole point of it existing
 * (ADR-0220's 2026-09-05 amendment).
 *
 * The header above argued that dropping the scheme was free because "the chat apps an
 * invite is actually pasted into linkify a bare host + path". **They linkify it and they do
 * not preview it** (owner, 2026-09-05, from a device): a pasted `travelive.app/join/<code>`
 * arrives in WhatsApp as tappable text with no card, so every `og:*` tag ADR-0220 added was
 * invisible on exactly the paths it was added for. The scheme is what makes the crawler run.
 *
 * The tell that this was already half-known: three share-sheet call sites had grown their own
 * `` `https://${publicAppLink(…)}` `` template and four clipboard writes had not — the fix
 * existed, inline, at some of the places that needed it. It lives here now, once.
 *
 * The page's own protocol rather than a hardcoded `https:` — in production that IS https and
 * `.app` is HSTS-preloaded anyway, and in dev a copied link stays openable on `http://localhost`.
 *
 * @param path the root-relative path the API returned (`/join/<code>`, `/s/<code>`).
 */
export function publicAppUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  url.hostname = url.hostname.replace(/^www\./i, '');
  return url.toString();
}

/**
 * **The link as it is SHOWN** — the same link with the scheme taken off the front, because
 * `https://` is plumbing on a 360px line and nobody reads it (owner, 2026-09-05: _"url
 * previews should exclude the https prefix … but when copying or sharing them it should add
 * them"_).
 *
 * The rule this file shipped with — label and clipboard must be the same string, or the
 * label is a small lie — survives in the only form that still holds: this is **derived from**
 * {@link publicAppUrl} rather than built beside it, so the two cannot drift and the label is
 * exactly the copied link minus a prefix that changes nothing about where it goes. What was
 * wrong was not the short label; it was shipping the short form to the clipboard too.
 *
 * **Two links take exactly these liberties** (ADR-0213): `/join/<code>` and the shared
 * itinerary's `/s/<code>`. Both are pasted into somebody else's chat rather than clicked from
 * an `href` here, which is why this generalized rather than the share sheet growing a
 * near-copy that drops `www.` slightly differently.
 *
 * @param path the root-relative path the API returned (`/join/<code>`, `/s/<code>`).
 */
export function publicAppLink(path: string): string {
  return publicAppUrl(path).replace(/^https?:\/\//i, '');
}
