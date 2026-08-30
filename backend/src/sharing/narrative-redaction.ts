/**
 * **The last thing that runs before text could leave the building.**
 *
 * ADR-0213 §2 is honest about what this is and is not. An allowlist proves that a *field*
 * named `confirmationCode` never reaches a model. It proves nothing about a free-text event
 * title somebody typed as `נחיתה — אישור ABCD-123456`, because the sensitivity is in the
 * prose, not the column. No pattern filter closes that gap either; what closes it is the
 * rule above this one — generation runs only over text already chosen for publication in
 * Summary, i.e. text an anonymous reader can already see.
 *
 * So this is defence in depth, not the defence: it strips the four shapes that are
 * *mechanically* recognisable and would be genuinely damaging to hand onward — an address
 * somebody can write to, a number they can call, a link, and a reservation code.
 *
 * Redaction removes rather than masks. A `[redacted]` marker tells a model there was a
 * secret here, which is a worse prompt and no safer.
 */

const PATTERNS: readonly RegExp[] = [
  // Email.
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gu,
  // URL, with or without a scheme.
  /\b(?:https?:\/\/|www\.)\S+/giu,
  /\b[a-z0-9-]+\.(?:com|net|org|io|app|co|il)\b(?:\/\S*)?/giu,
  // Phone: an optional country code then 7+ digits, however they are grouped.
  /\+?\d[\d\s().-]{6,}\d/gu,
  // A booking-code shape: letters and digits joined by a separator, at least one of each.
  // `KEF-4821`, `ABCD-123456`, `4B/7731`. Deliberately not bare words or bare numbers —
  // `כביש 1` and `Route 35` are the itinerary, not a secret.
  /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9-/]*\d)[A-Z0-9]{2,}[-/][A-Z0-9]{2,}\b/gu,
];

/** Collapse the whitespace a removal leaves behind, so the result still reads as a line. */
const tidy = (text: string): string =>
  text
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([,.·])/gu, '$1')
    .replace(/^[\s,.·-]+|[\s,.·-]+$/gu, '')
    .trim();

/** The app's separator between peer facts, which is also the natural seam to redact along:
 *  a segment whose whole content was a secret should leave no dangling `·` behind. */
const SEGMENT = ' · ';

export function redactNarrativeText(text: string): string {
  return text
    .split(SEGMENT)
    .map((segment) => tidy(PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ' '), segment)))
    .filter((segment) => segment.length > 0)
    .join(SEGMENT);
}

/** Redact and drop what is left of a string that was *only* a secret. */
export function redactedOrUndefined(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const redacted = redactNarrativeText(text);
  return redacted.length > 0 ? redacted : undefined;
}
