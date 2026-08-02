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
// trailing slash), which is right for where the tap goes and wrong for what the reader sees —
// the display stays the string that was typed.

/** The schemes a note may point at. `mailto:`/`tel:` are here because a hotel's contact line is
 *  a thing people paste; `javascript:`, `data:` and `file:` are exactly what this excludes. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Does this already carry a scheme? (`https:`, `mailto:`, and also `javascript:` — spotting
 *  it is the point, so the check below can refuse it rather than prefix it into safety.) */
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

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
