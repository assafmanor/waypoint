// **A user-agent string turned into something a person recognises** (ADR-0197 §2, phase 1b).
//
// The schema stores `userAgent` "so a person can recognise the row in settings", and the
// mockup's own finding is that the raw string cannot do that job: it is ~120 Latin characters
// of noise in a Hebrew row, and it lies — Chrome on iOS reports itself as Safari, because
// every iOS browser is WebKit and Apple requires it.
//
// So two decisions follow, and the second is the one that makes the first safe:
//
// 1. **The label is derived here, on the server**, and the raw string never reaches the
//    client. Nothing on a settings screen needs it, and a value nothing needs is a value not
//    to ship.
// 2. **The label is a HINT, not an identity.** What carries recognition is the "this device"
//    mark beside it, which the client resolves from the subscription id it stored when it
//    subscribed. So the label only has to distinguish the OTHER rows from each other — which
//    is exactly the job a UA string can do honestly.
//
// Deliberately not a UA-parsing library: this is a dozen substring tests against a value that
// is already only a hint, and a dependency that ships a device database to answer it would be
// the heaviest thing in the module for the least load-bearing string in the app.

/** What a row says when the UA is missing or says nothing we recognise. */
export const UNKNOWN_DEVICE = 'מכשיר';

/** Ordered longest-claim-first, because these strings nest: every Edge UA also says
 *  `Chrome`, and every Chrome-on-iOS UA also says `Safari`. First match wins. */
const BROWSERS: [needle: string, label: string][] = [
  ['Edg/', 'Edge'],
  ['OPR/', 'Opera'],
  ['CriOS', 'Chrome'],
  ['FxiOS', 'Firefox'],
  ['Firefox', 'Firefox'],
  ['Chrome', 'Chrome'],
  ['Safari', 'Safari'],
];

/** Same ordering rule: an iPad UA can also say `Macintosh`, and Android's says `Linux`. */
const PLATFORMS: [needle: string, label: string][] = [
  ['iPhone', 'iPhone'],
  ['iPad', 'iPad'],
  ['Android', 'Android'],
  ['Macintosh', 'Mac'],
  ['Mac OS X', 'Mac'],
  ['Windows', 'Windows'],
  ['CrOS', 'ChromeOS'],
  ['Linux', 'Linux'],
];

const firstMatch = (ua: string, table: [string, string][]): string | null =>
  table.find(([needle]) => ua.includes(needle))?.[1] ?? null;

/**
 * `iPhone · Safari`, or as much of it as the string supports.
 *
 * `·` between the two facts, which is the app's own separator for peer information (root
 * `CLAUDE.md`) — and the right choice here for a second reason: this label is rendered inside
 * a Hebrew row as an LTR island, and a dash would read as a range.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent?.trim();
  if (!ua) return UNKNOWN_DEVICE;
  const platform = firstMatch(ua, PLATFORMS);
  const browser = firstMatch(ua, BROWSERS);
  if (platform && browser) return `${platform} · ${browser}`;
  return platform ?? browser ?? UNKNOWN_DEVICE;
}
