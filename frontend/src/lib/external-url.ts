// **A user-typed url, as an href you can actually leave the app with.**
//
// `Note.url` is the only free-text url in the app — every other `target="_blank"` here is a
// link the app BUILT (a Maps directions url, a blob, Google's own deep link). A typed one is
// not an href: people write `tabelog.com/tokyo/A1303`, and a scheme-less string is a
// **relative** url, so the browser resolves it against the current page and the tap re-enters
// the app. In the installed PWA that is the whole window, with no address bar to escape from —
// which is how the owner found it.
//
// So the scheme is supplied here rather than demanded from the user: nobody types `https://`
// into a note, and refusing the note for want of it would be the app being pedantic about its
// own plumbing.
//
// **And the scheme is checked, not just added.** A note is group-visible free text, so
// `javascript:…` in a `url` field is a script one member can hand another — the classic stored
// self-XSS. Only the four schemes a travel note can legitimately mean are allowed through;
// anything else answers `null`, and the call site renders the text without making it a link.
//
// **Normalised for the HREF only.** `new URL()` tidies (`https://tabelog.com` gains its
// trailing slash), which is right for where the tap goes and wrong for what the reader sees.
// What the reader sees is `prettyUrl`'s job, below — and the two are deliberately different
// strings: the href must keep everything, the label must not.

/** The schemes a note may point at. `mailto:`/`tel:` are here because a hotel's contact line is
 *  a thing people paste; `javascript:`, `data:` and `file:` are exactly what this excludes. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Does this already carry a scheme? (`https:`, `mailto:`, and also `javascript:` — spotting
 *  it is the point, so the check below can refuse it rather than prefix it into safety.) */
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** **An address needs `mailto:`, and nothing was supplying it** (ADR-0202 §7, found while
 *  drawing `mockups/note-full-screen-v1.html`). `mailto:` has been in the allowlist above
 *  since this file shipped, on the reasoning that "a hotel's contact line is a thing people
 *  paste" — but the only scheme this function ever ADDED was `https://`, and under that
 *  branch the `@` is not an address separator, it is HTTP **userinfo**:
 *
 *      externalHref('tokyo-stay@example.com')
 *        → 'https://tokyo-stay@example.com/'    host=example.com  user=tokyo-stay
 *
 *  So a pasted address became a link to the bare domain with the local part handed over as
 *  credentials — and `prettyUrl` then labels it `example.com`, because `url.host` drops the
 *  userinfo, so the address the author typed was not even on screen. Reachable from the note
 *  editor's url field today, which is free text.
 *
 *  Deliberately narrow: one `@`, and a dotted domain after it. Anything looser starts
 *  claiming Twitter handles and file paths. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * An absolute, safe href for a user-typed url — or `null` when it cannot be one, which the
 * caller must render as plain text rather than as a dead link.
 */
export function externalHref(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  // `//host/path` is scheme-relative and would become `https:////host` under a blind prefix.
  const candidate = HAS_SCHEME.test(value)
    ? value
    : LOOKS_LIKE_EMAIL.test(value)
      ? `mailto:${value}`
      : value.startsWith('//')
        ? `https:${value}`
        : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    // Not a url at all (someone typed a sentence into the url field). Not a crash, not a link.
    return null;
  }
}

// **A url, as something a person reads** (owner, 2026-08-02: _"really long links look very
// ugly"_). A pasted share link is mostly not a url — `https://www.instagram.com/reel/
// DbTc4IRhNDT/?igsh=azVieW45b2lscHh2` is 64 characters of which 30 are a tracking token that
// means nothing to anybody, and it wrapped a note row onto three monospace lines.
//
// Three things come off, in order of how much they cost the reader and how little they mean:
// the scheme (every link has one), the `www.` (ditto), and the SHARE PARAMETERS — the ids a
// platform staples on so it can tell who forwarded what. What stays is the part that says
// where this goes: the host and the path.
//
// **The query is filtered, not dropped.** `youtube.com/watch?v=…` IS its query; deleting it
// would leave a label pointing at nothing. So this is an explicit list of the parameters that
// are known to be about tracking, and anything unrecognised is kept — a slightly long label
// is a much smaller failure than a label that lies about the destination.
//
// And it is only ever a LABEL. `externalHref` still builds the href from the full string, so
// a parameter dropped here is still sent when the link is followed: this cannot break a link,
// only shorten how one reads.
const TRACKING_PARAMS = new Set([
  'igsh', // Instagram
  'igshid',
  'fbclid', // Meta
  'mibextid',
  'si', // YouTube / Spotify share id
  'feature',
  'gclid', // Google Ads
  'ref',
  'ref_src', // X/Twitter
  '_r', // TikTok
  '_t',
]);
const isTracking = (key: string) =>
  TRACKING_PARAMS.has(key) || key.toLowerCase().startsWith('utm_');

/** The reader's half of a note's url. Falls back to the raw string for anything
 *  `externalHref` refuses, because an unparseable url is still what someone typed and
 *  printing nothing would be worse than printing it. */
export function prettyUrl(raw: string | null | undefined): string {
  const href = externalHref(raw);
  if (!href) return raw?.trim() ?? '';
  const url = new URL(href);
  // A contact scheme has no host to lead with — the address IS the label.
  if (url.protocol === 'mailto:' || url.protocol === 'tel:') return decodeURI(url.pathname);

  for (const key of [...url.searchParams.keys()]) {
    if (isTracking(key)) url.searchParams.delete(key);
  }
  const host = url.host.replace(/^www\./i, '');
  // A bare host reads as the host, not as `example.com/`.
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return decodeURI(host + path) + url.search + url.hash;
}
