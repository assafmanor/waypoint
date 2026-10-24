// **Calendar-date arithmetic and the wall-clock → instant conversion**, shared because the
// server now asks the same questions the screens do.
//
// Moved out of `frontend/src/lib/time.ts` for ADR-0198 phase C, and for exactly the reason
// phase 2 moved the zone model (ADR-0197 §5): `computeReadiness` needs `tripDates`,
// `addDays` and `zonedIso`, and a readiness nudge that disagreed with the readiness card
// about which nights a trip has would be worse than no nudge. `lib/time.ts` re-exports all
// three, so the 22 call sites that import them from there did not churn.
//
// Everything here is deterministic in its arguments — `Intl` with an explicit `timeZone` is
// fine in this package; `Intl` reading the ENVIRONMENT is not (see this package's
// `CLAUDE.md`, amended 2026-08-21).

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

/** Add whole days to a YYYY-MM-DD date string. */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** **Every calendar day of a trip**, inclusive, as `YYYY-MM-DD`. Calendar dates, so read in
 *  UTC like every other date here — a trip's span is not an instant. */
export function tripDates(startDate: string, endDate: string): string[] {
  const total = Math.round((Date.parse(endDate) - Date.parse(startDate)) / MS_PER_DAY) + 1;
  return Array.from({ length: Math.max(0, total) }, (_, i) => addDays(startDate, i));
}

/** Noon — the safe wall-clock instant to sample a date at when only the calendar day matters
 *  and never the time: the day's **ambient zone** (ADR-0107, so a crossing near either
 *  boundary can't decide which zone frames the whole day) and the day's weekday label.
 *  Mid-day is far from every DST/midnight edge. */
export const DAY_NOON = '12:00';

/** Local midnight, as the wall time a day's own instants are measured from — what `dayLight`
 *  needs to know where the day starts. Named beside {@link DAY_NOON} rather than inlined for
 *  the same reason that one is: a bare `'00:00'` at a call site says when, not why.
 *
 *  Both were `frontend/src/constants.ts`'s until 2026-09-03, and moved together because
 *  `zones.ts`'s day consensus needs the noon one server-side — they are arguments to
 *  {@link zonedIso}, which is here, so this is where the pair belongs. `frontend/constants.ts`
 *  re-exports them. */
export const DAY_MIDNIGHT = '00:00';

/** A zone's UTC offset at an instant, as `+09:00` / `-04:00` / `+05:45`. Exported because
 *  `frontend/src/lib/time.ts`'s `zoneOffsetMinutes` parses the same string, and two copies
 *  of a DST-correct offset probe is the duplication root rule 8 exists to stop. */
export function zoneOffsetAt(at: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  return !name || name === 'GMT' ? '+00:00' : name.replace('GMT', '');
}

/** A zone's UTC offset in signed **minutes** at an instant (DST-correct), e.g. `Asia/Tokyo`
 *  → 540, `America/New_York` in July → -240, `Asia/Kolkata` → 330.
 *
 *  Here rather than in `frontend/src/lib/time.ts`, where it lived, for the reason
 *  {@link zoneOffsetAt}'s docblock has always given: two copies of a DST-correct offset probe
 *  is what rule 8 exists to stop. The server had grown the second one
 *  (`sharing-projection.service.ts`'s `zoneOffsetMinutesAt`, now deleted) and `zones.ts`'s
 *  day-consensus needs the third. `lib/time.ts` re-exports it, so its call sites did not churn. */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const offset = zoneOffsetAt(at, timeZone); // "+09:00" | "-04:00" | "+05:30" | "+00:00"
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(':').map(Number);
  return sign * (hours * 60 + minutes);
}

/** Combine a `date` (YYYY-MM-DD) + `time` (HH:MM), read as wall-clock in `timeZone`, into a
 *  UTC ISO instant. **`date` must be a real calendar day** (the frontend's `isCalendarDay`)
 *  and `time` an `HH:MM` — anything else is an Invalid Date and throws rather than
 *  returning one. That precondition is not pedantry: `zonedIso('', …)` builds
 *  `new Date('T12:00:00Z')`, whose offset probe throws `RangeError`, and one empty date from
 *  a platform control blanked the app once in a render path (field report #38).
 *
 *  The offset for a given wall-clock reading depends on the instant itself (DST), which is
 *  exactly what we are trying to compute — so this resolves the chicken-and-egg by fixed-point
 *  iteration: guess an offset, recompute the instant, re-derive the offset *at that instant*,
 *  repeat until it stops moving (verified against real DST boundaries; converges in at most 2
 *  steps in practice). A single noon-anchored guess (the obvious shortcut) is silently wrong by
 *  up to an hour for any wall time on the same calendar day as a transition — don't
 *  reintroduce that.
 *
 *  ponytail: the one input this can't resolve correctly is a wall-clock reading that's
 *  ambiguous (repeated) or nonexistent (skipped) *during* the transition hour itself (e.g.
 *  02:30 on a spring-forward day). It returns a stable, well-defined instant rather than
 *  looping or throwing, just not necessarily the one the user meant — every timezone library
 *  needs an explicit disambiguation policy for that hour; add one (e.g. "prefer standard
 *  time") if trip dates ever land there in practice. */
export function zonedIso(date: string, time: string, timeZone: string): string {
  let candidate = new Date(`${date}T${time}:00Z`);
  for (let i = 0; i < 3; i++) {
    const next = new Date(`${date}T${time}:00${zoneOffsetAt(candidate, timeZone)}`);
    if (next.getTime() === candidate.getTime()) break;
    candidate = next;
  }
  return candidate.toISOString();
}

// ── The shape of a trip's date range ────────────────────────────────────────────────────

/** **Which parts a trip's date range has to print**, and nothing about the words.
 *
 * `same-month` prints the start's day alone (`11–22 בספטמבר`), `same-year` names both months
 * (`27 בספטמבר – 3 באוקטובר`), `cross-year` names both years too. */
export type TripRangeShape = 'same-day' | 'same-month' | 'same-year' | 'cross-year';

/**
 * **The range's shape, derived once and rendered twice** (ADR-0220 §4).
 *
 * `frontend/src/lib/time.ts`'s `proseTripRange` owned this branching and was the only thing
 * that knew it, which was fine until a link preview needed the same range **server-side**:
 * the crawler runs no JS, so the description is composed in Nest, and a second copy of these
 * four cases is how the invite ticket and the preview that advertised it come to disagree
 * about one trip.
 *
 * It returns a discriminant rather than a string on purpose, and that is not a compromise —
 * it is what `packages/shared/CLAUDE.md` asks for. Product formatting and the ambient locale
 * are the consumer's ("This package supplies stable _keys_ a consumer looks its own copy up
 * by"), so the **decision** is shared and the **month names** stay with whoever is rendering:
 * `Intl` on the screen, `Intl` again in `backend/src/sharing/hebrew.copy.ts` for the paper
 * and the preview. Same shape for `eventEndBoundary`, and the same reason.
 *
 * Calendar dates, so read in UTC — a trip's span is not an instant.
 */
export function tripRangeShape(startDate: string, endDate: string): TripRangeShape {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (start.getUTCFullYear() !== end.getUTCFullYear()) return 'cross-year';
  if (start.getUTCMonth() !== end.getUTCMonth()) return 'same-year';
  return start.getUTCDate() === end.getUTCDate() ? 'same-day' : 'same-month';
}
