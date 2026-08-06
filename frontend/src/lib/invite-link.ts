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
// **What does NOT come off is the `www.`,** and this is the difference between this and
// `prettyUrl` (`lib/external-url.ts`), which strips it happily. `prettyUrl` labels a link
// that has a working `href` behind it, so it is allowed to abbreviate. An invite has nothing
// behind it — it IS the href, pasted into another app — so it may only drop what cannot
// change where it goes. A `www.` removed while `www` is the canonical host is a dead link in
// somebody's group chat. It disappears when the app moves to the apex, not before.

/**
 * The invite as one string, shown and copied — deliberately the same string, because a
 * label that differs from what the clipboard holds is a small lie the reader can't see.
 *
 * @param path the `inviteUrl` the API returned — a root-relative `/join/<code>`.
 */
export function inviteLink(path: string): string {
  const url = new URL(path, window.location.origin);
  return url.host + url.pathname + url.search;
}
