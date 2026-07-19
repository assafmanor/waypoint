// Hebrew cardinal-count grammar for small counts — 1 and 2 have irregular
// (dual) forms, not "N + unit" (e.g. "יומיים", not "2 ימים"); a numeral only
// appears from 3 up, so callers that render numerals in mono/ltr (ticket
// mockup's #s-linkjoin numeric styling) show no numeral for 1-2.
export function dayCount(n: number): { value: string; unit: string } {
  if (n === 1) return { value: '', unit: 'יום' };
  if (n === 2) return { value: '', unit: 'יומיים' };
  return { value: String(n), unit: 'ימים' };
}

/** Same dual/plural rule for months: "חודש", "חודשיים", then "N חודשים". */
export function monthCount(n: number): { value: string; unit: string } {
  if (n === 1) return { value: '', unit: 'חודש' };
  if (n === 2) return { value: '', unit: 'חודשיים' };
  return { value: String(n), unit: 'חודשים' };
}

/** Nights (a hotel stay's duration). No dual form here — unlike days/months,
 *  it's "לילה אחד" for one (the explicit "אחד" reads clearer than a bare "לילה"
 *  next to a check-out) and a plain numeral "N לילות" from two up (not "ליליים"). */
export function nightCount(n: number): { value: string; unit: string } {
  if (n === 1) return { value: '', unit: 'לילה אחד' };
  return { value: String(n), unit: 'לילות' };
}

export function nightPhrase(n: number): string {
  return joinCount(nightCount(n));
}

/** Same rule, as a single string — for plain-text contexts (chip labels). */
export function dayPhrase(n: number): string {
  return joinCount(dayCount(n));
}

export function monthPhrase(n: number): string {
  return joinCount(monthCount(n));
}

function joinCount({ value, unit }: { value: string; unit: string }): string {
  return value ? `${value} ${unit}` : unit;
}
