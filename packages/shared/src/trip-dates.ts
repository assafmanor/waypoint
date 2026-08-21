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

/** A zone's UTC offset at an instant, as `+09:00` / `-04:00` / `+05:45`. Exported because
 *  `frontend/src/lib/time.ts`'s `zoneOffsetMinutes` parses the same string, and two copies
 *  of a DST-correct offset probe is the duplication root rule 8 exists to stop. */
export function zoneOffsetAt(at: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  return !name || name === 'GMT' ? '+00:00' : name.replace('GMT', '');
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
