// **What the board's now-slot says when no event is running** (ADR-0211).
//
// `זמן חופשי` used to be `Board`'s final `else` — what got printed when the `in-transit`,
// `group-split` and `now` questions had all answered "no". So it was not a claim anybody
// decided to make, and it was wrong in most of the situations it covered: on a bus, in bed at
// ⁦02:40⁩, up at ⁦06:40⁩ before the day starts, on a day nobody planned. The owner reported the
// sharpest one from a device — the lifted hero printing `זמן חופשי` in its title while its own
// journey line, 40px lower, printed `נסיעה · בדרך`.
//
// ADR-0208 is titled _"a claim needs something to stand on"_ and ADR-0207 _"a fix may withdraw a
// claim, it may not make one"_. Every other sentence on this surface has been through that test:
// `travel.leavePassed` says `זמן היציאה עבר` and never `אתם באיחור`, because the app has no
// sensor and a settle mark is not one. The title slot is the one statement on the board that
// never took it. This file is that test, applied.
//
// The derivation is pure and clock-injected, like `hero-travel.ts` beside it: instants and flags
// in, a discriminant out. No formatting, no zone resolution, no `Date.now()`.
//
// `gapWords` at the foot is the one thing here that reads `i18n/he.ts`, and it is here rather
// than at the two render sites for the reason `lib/transitions.ts` exists: two components each
// mapping a discriminant to a phrase is two places for the phrase to drift. That file is the
// precedent in shape as well as in principle — shared presentation grammar, resolved from a key,
// living in `lib/`.
//
// **Read by both elevations, and that is the point** (ADR-0160 §1: one object at two elevations).
// `Board` and `HeroLift` both render this one answer, so the collapsed card and the lifted one
// cannot say different things about the same minute — which is exactly the drift ADR-0160 §S had
// to repair once already, when `free` was an `else` on one surface and an empty array on the
// other.
import { DAY_WINDOW, NIGHT_ENDS_HOUR } from '../constants';
import { t } from '../i18n/he';
import type { TripEvent } from '@waypoint/shared';

/**
 * The closed set. **First match wins, and the order is the file's** — a person's own assertion
 * outranks the plan's, and the plan's position outranks the absence of one.
 */
export const GAP_CHARACTER = {
  /** Somebody pressed `בדרך`. The strongest evidence on this screen, because a human supplied
   *  it (`lib/on-way.ts`'s own words: the one thing here that knows what a sensor would). */
  ON_THE_WAY: 'on-the-way',
  /** The plan says you are at a bed, and the clock is outside the waking window. A statement
   *  about a PLACE — never `ישנים`, which would be a claim about a person. */
  AT_THE_STAY: 'at-the-stay',
  /** Nothing left today, on a day that had something. */
  DAY_DONE: 'day-done',
  /** A day with no timed event at all. Not the same thing as a day that is over. */
  EMPTY_DAY: 'empty-day',
  /** A real gap: something later today. The one case `זמן חופשי` was always right about. */
  OPEN: 'open',
} as const;
export type GapCharacter = (typeof GAP_CHARACTER)[keyof typeof GAP_CHARACTER];

/** Which side of the window the clock is on — a claim about the HOUR, and the only reason
 *  `at-the-stay` is one member rather than two (ADR-0211 §3). */
export const NIGHT_BAND = { NIGHT: 'night', MORNING: 'morning' } as const;
export type NightBand = (typeof NIGHT_BAND)[keyof typeof NIGHT_BAND];

export interface GapRead {
  kind: GapCharacter;
  /** `at-the-stay` only — the stay the plan says you are at. The caller resolves its display
   *  name through the usual authority rule; this hands back the event so it can. */
  stay?: TripEvent;
  /** **Which side of the night the clock is on, and PRESENT EXACTLY WHEN it is outside
   *  `DAY_WINDOW`** — a fact about the hour, so it is carried by every arm rather than by the
   *  one that happened to need it first (the 2026-09-01 amendment to ADR-0211 §3/§4).
   *
   *  Two things read it. `gapWords` gives the label to `at-the-stay` and to `open`, which are
   *  the two arms whose words are wrong at ⁦01:12⁩ without it; and {@link gapDrawsDayRail} asks
   *  only whether it is there at all, because "outside the rail's own window" is the whole
   *  question that function was written to answer. */
  band?: NightBand;
}

export interface GapCharacterInput {
  /** The trip-local hour, `0..23` — the caller resolves the zone (`tzParts`), because this
   *  file never reads a clock. */
  hour: number;
  /** `deriveNow`'s next, **whatever calendar day it falls on**. It is trip-scoped by
   *  construction (`lib/time.ts:312` has no date filter), which is the fact this whole read
   *  is built on: the board's lookahead already crosses midnight. */
  next?: TripEvent;
  /** The clock's own day, `YYYY-MM-DD` — never `activeDate`. Swiping the day strip must not
   *  change what the live surface says about the minute you are in. */
  today: string;
  /** Whether the CLOCK's day holds any timed event at all, settled or not. This is what
   *  separates a day that is over from a day nobody filled in, and the two want different
   *  words. The caller answers it because only the caller knows which list to count. */
  dayHasEvents: boolean;
  /** The bed, when `travelOrigin` fell through to it — i.e. nothing has started today
   *  (ADR-0206 §AD). Absent means the plan has a later position and the bed is stale. */
  wokeIn?: TripEvent;
  /** The device mark for `next` (`useOnWay`). */
  onWay: boolean;
}

/** Whether the clock is inside the hours the board's own rail agrees to draw. */
function insideWakingWindow(hour: number): boolean {
  return hour >= DAY_WINDOW.START_HOUR && hour < DAY_WINDOW.END_HOUR;
}

/**
 * **Which band an hour outside the window is in, or nothing when it is inside one.**
 *
 * **The band is not one comparison, and the test is what said so.** `hour < NIGHT_ENDS_HOUR`
 * reads ⁦23:30⁩ as morning, because the night wraps midnight and a single `<` cannot express a
 * range that does. Morning is the narrow slice — `NIGHT_ENDS_HOUR` up to the window opening —
 * and everything else outside the window, the late evening and the small hours alike, is night.
 */
function nightBandOf(hour: number): NightBand | undefined {
  if (insideWakingWindow(hour)) return undefined;
  return hour >= NIGHT_ENDS_HOUR && hour < DAY_WINDOW.START_HOUR
    ? NIGHT_BAND.MORNING
    : NIGHT_BAND.NIGHT;
}

/**
 * **The gap's character.**
 *
 * Every arm stands on something already in the app — a device mark, a position the leave-by
 * already derives, a date comparison, a count. Nothing here is a guess about a person, and
 * nothing here needs a field the app does not store.
 */
export function gapCharacter(input: GapCharacterInput): GapRead {
  const { hour, next, today, dayHasEvents, wokeIn, onWay } = input;
  // Resolved once, before any arm, because it is true of the MINUTE rather than of the arm —
  // which is the correction the 2026-09-01 amendment makes: keyed on the arm, the night was
  // only noticed when a bed happened to be there to name.
  const band = nightBandOf(hour);
  const at = <T extends GapRead>(read: T): T => (band ? { ...read, band } : read);

  // A person said they are moving. Nothing the plan knows outranks that — including the bed,
  // which is why this is first: somebody up and out at ⁦06:20⁩ is on their way, not at a hotel.
  if (onWay && next) return at({ kind: GAP_CHARACTER.ON_THE_WAY });

  // The plan's own position, but only while it is still fresh. `wokeIn` is `travelOrigin`'s
  // fallback and it survives all day — at ⁦11:00⁩ on an empty day the bed is still the last
  // position the plan has, and by then you are out. `DAY_WINDOW` is the bound: inside the
  // waking window the bed is a stale claim, so the gap falls through to what it really is.
  if (wokeIn && band) return at({ kind: GAP_CHARACTER.AT_THE_STAY, stay: wokeIn });

  // `next` crossing midnight is the ordinary case, not the exception — so "is there anything
  // left" is a question about the DATE, never about whether `next` exists.
  if (next?.date === today) return at({ kind: GAP_CHARACTER.OPEN });

  return at({ kind: dayHasEvents ? GAP_CHARACTER.DAY_DONE : GAP_CHARACTER.EMPTY_DAY });
}

/** **Whether the day rail still describes the frame you are in.**
 *
 *  `in-transit` already drops the rail on exactly this reasoning (ADR-0059 §2 — the flight IS
 *  the day's current activity), and the night is the same case from the other end: at ⁦02:40⁩
 *  `dayProgress` clamps to 0 and the board draws a knob at the start of a day you are not in
 *  yet, labelled `עכשיו`. Absence beats a pinned lie.
 *
 *  **It asks the HOUR, and the first version asked the arm** (the 2026-09-01 amendment).
 *  ADR-0211 §4 said "the rail comes off in the same states" and the states it named were
 *  `at-the-stay`'s — so the pinned lie survived wherever the plan had no bed to name: reported
 *  from a phone at ⁦01:12⁩ on a night whose next event was a ⁦07:00⁩ check-in, where the read is
 *  `open` and the knob sat at ⁦0%⁩ under `עכשיו`. `dayProgress` clamps at BOTH ends, so this also
 *  takes the rail off at ⁦23:40⁩, where it was drawing a knob at ~⁦98%⁩ for a day already over.
 *
 *  `band` is present exactly when the clock is outside `DAY_WINDOW` — the rail's own window —
 *  so its presence IS this question, and `empty-day` is the one arm that fails it from inside:
 *  a rail across a day with nothing on it describes a frame that has no content, at any hour. */
export function gapDrawsDayRail(read: GapRead): boolean {
  return read.band === undefined && read.kind !== GAP_CHARACTER.EMPTY_DAY;
}

/**
 * **The two lines the slot prints**, resolved from one answer so the collapsed board and the
 * lifted hero cannot word the same minute differently (ADR-0160 §1).
 *
 * `open` and `day-done` reuse the phrases the board already had — `freeLabel`/`freeTitle` and
 * `endOfDay` — rather than restating them under new keys, which is root rule 8 applied to copy:
 * the gap that really is a gap is the one case `זמן חופשי` was always right about, and
 * `סוף היום` is what the next slot has called this since the first build.
 *
 * @param stayName the stay's resolved display name, for `at-the-stay`. Missing degrades to the
 *   `open` words rather than printing a band label over an empty title — unreachable in practice,
 *   since a caller can always fall back to the event's own title.
 */
export function gapWords(read: GapRead, stayName?: string): { label: string; title: string } {
  const open = { label: t.board.freeLabel, title: t.board.freeTitle };
  switch (read.kind) {
    case GAP_CHARACTER.ON_THE_WAY:
      return t.board.gap.onTheWay;
    case GAP_CHARACTER.AT_THE_STAY:
      return stayName
        ? { label: t.board.gap.band[read.band ?? NIGHT_BAND.NIGHT], title: stayName }
        : open;
    case GAP_CHARACTER.DAY_DONE:
      return { label: t.board.gap.dayDone.label, title: t.board.endOfDay };
    case GAP_CHARACTER.EMPTY_DAY:
      return t.board.gap.emptyDay;
    // **`פנוי` is a claim about the DAY, and at ⁦01:12⁩ there is no day yet to be free in.**
    // This file's own header lists `זמן חופשי` at ⁦02:40⁩ and ⁦06:40⁩ among the readings it was
    // written to end, and ADR-0211 ended them only where a bed was there to name. The title
    // stays — nothing IS scheduled, which is true — and the label says which hours those are.
    // A claim about the clock, never about the person (ADR-0208), and the same two words
    // `at-the-stay` uses, from the same key.
    case GAP_CHARACTER.OPEN:
      return read.band ? { label: t.board.gap.band[read.band], title: open.title } : open;
  }
}

/**
 * **Whether this character speaks in the location register** — i.e. wears teal.
 *
 * Only `on-the-way` does, and it is the shipped precedent rather than a new spend: the board
 * already paints `כרגע · בדרך` teal for a bracketed transport in motion
 * (`.wp-board-now-label.loc`, `midSpan.transitLabel`). A journey somebody asserted is the same
 * fact as a journey the plan brackets, so it takes the same costume — root rule 4's teal is
 * "where you are", and being on the way is exactly that.
 *
 * **`at-the-stay` deliberately does NOT.** Its label is `לילה` / `בוקר`, which are claims about
 * the CLOCK (ADR-0208), and the clock is amber's. The stay's name in the title is the place, and
 * a title is not where this app spends a hue.
 */
export function gapIsLocative(kind: GapCharacter): boolean {
  return kind === GAP_CHARACTER.ON_THE_WAY;
}
