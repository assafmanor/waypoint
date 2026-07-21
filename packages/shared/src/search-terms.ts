// Generic term-matching for "does this query match any of these strings"
// search — the shape `destinations.ts`'s `searchDestinations` and `icons.ts`'s
// `searchVibeIcons` each had a private, near-duplicate copy of (one now
// stripped a trailing period the other didn't — exactly the drift a shared
// helper prevents). Any future free-text search over a list of items (the
// Index bookings search, ADR-0101/0102, is the newest consumer) builds its
// per-item term list and calls `matchesAnyTerm` rather than growing another
// copy of the normalize+substring logic.

/** Normalize free text for a substring/term search: lowercase, strip
 *  quote-ish punctuation (straight/curly quotes, backtick, period, Hebrew
 *  geresh/gershayim), collapse whitespace. */
export function normalizeSearchTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'`.׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does `query` match ANY of `terms` (case/punctuation-insensitive substring)?
 *  Deliberately has no empty-query special case — every string trivially
 *  "contains" the empty string, so a blank query matches whenever at least
 *  one term is present, which is the right default for most callers (a
 *  blank search shows everything). A caller that wants blank to show
 *  *nothing* instead (`searchVibeIcons`) checks that itself before calling
 *  this, rather than this function guessing which behavior is wanted. */
export function matchesAnyTerm(query: string, terms: readonly (string | undefined)[]): boolean {
  const q = normalizeSearchTerm(query);
  return terms.some((term) => term != null && normalizeSearchTerm(term).includes(q));
}
