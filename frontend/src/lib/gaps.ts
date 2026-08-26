// **Positions in a day** for the Plan-mode builder: the free time between two
// consecutive events, and (session-123) at the day's two edges, before the first event
// and after the last.
//
// Each one comes in two densities and the derivation is ONE (ADR-0161 §2). Past
// `earnsChip` it is the `שבץ` chip it always was; below that — including zero minutes,
// two rows that touch — the same slot is a drag-only seam. The `free*` functions answer
// without a threshold and the `gap*` wrappers apply it, so a gap and a seam cannot
// disagree about what free time IS or about what a drop into it lands on.
import { typicalMinutesFor, type EventCategory, type TripEvent } from '@waypoint/shared';
import { DAY_WINDOW } from '../constants';
import { isoToTimeInput, toHHMM, toMin, zonedIso } from './time';

const LAST_MINUTE_OF_DAY = 23 * 60 + 59; // 23:59 — the prefill slot stays same-day

/** Minutes since the day's own local midnight. An overnight end (02:00 the next
 *  morning, ADR-0037) reads as ≥ 1440 rather than as an early-morning slot. */
const minutesInto = (iso: string, dayStartMs: number) =>
  Math.round((Date.parse(iso) - dayStartMs) / 60000);
const localMidnight = (date: string, tz: string) => Date.parse(zonedIso(date, '00:00', tz));
const startsOf = (dayEvents: TripEvent[]) =>
  dayEvents.map((e) => e.startsAt).filter((v): v is string => Boolean(v));
const endsOf = (dayEvents: TripEvent[]) =>
  dayEvents.map((e) => e.endsAt ?? e.startsAt).filter((v): v is string => Boolean(v));

/** Below this, the free time is just breathing room — no chip. It is **not** the floor
 *  on whether a drop can land there: a seam is this same derivation below the threshold,
 *  drawn only while a drag is live (ADR-0161 §2). The threshold lives in exactly one
 *  place, `earnsChip` below, which the renderer reads too. */
export const GAP_MIN_MINUTES = 60;

/** Default length of an event dropped into a gap. A big (e.g. 9h) gap shouldn't
 *  prefill a 9h event — start a normal block at the gap's start; the user can
 *  extend it. Capped at the gap itself so a small gap fills exactly. */
export const GAP_FILL_MINUTES = 60;

/** Prefill for a new/scheduled event dropped into the gap: the gap's own slot. */
export type GapDefaults = { date: string; start: string; end: string };

/** Free time, and the slot a drop into it lands on. `minutes` can be **zero**: back-to-back
 *  rows still have a position between them, which is what a seam is (ADR-0161 §2). */
export type Gap = { minutes: number; fill: GapDefaults };

/** **The one place the chip threshold is applied.** Above it the free time is worth a
 *  `שבץ` chip; below it — including zero — the same slot is a drag-only seam.
 *
 *  Exported because the RENDERER needs the same answer, and asking it twice is how the
 *  two densities would drift: `PlanDay` reads this rather than comparing against
 *  `GAP_MIN_MINUTES` itself, so "is this a chip or a seam" has exactly one definition. */
export const earnsChip = (free: Gap): boolean => earnsChipAt(free.minutes);

/** **The same threshold, asked of a MINUTE COUNT** — because since ADR-0206 §V1.1 the number that
 *  decides is not always the hole's own. A hole with a journey in it earns its chip on what is
 *  FREE, not on how long the hole is: `where-a-route-shows-up-v1.html` §2 drew `if (left >= 60)`
 *  and said in as many words that below it "there is simply no chip — exactly as today". A
 *  45-minute chip over a hole a 40-minute walk eats is an offer nobody can take.
 *
 *  Both forms read one constant, so the two callers cannot drift. */
export const earnsChipAt = (minutes: number): boolean => minutes >= GAP_MIN_MINUTES;

/** **Below this, free time is not free time — it is the transition** (owner, 2026-08-26:
 *  _"a gap below say 15 minutes is not really free time"_).
 *
 *  A SECOND threshold and not a re-tune of the one above, because they answer different
 *  questions: `GAP_MIN_MINUTES` asks whether a hole is worth **offering** as a slot (can you put
 *  something in it), and this asks whether it is worth **stating** as free (can you spend it).
 *  Sixty for the offer and fifteen for the statement is not a contradiction — it is the range
 *  where the day says "you have a bit of time" without pretending you could schedule anything.
 *
 *  **It exists because M6a regressed the silence.** A 45-minute hole earns no `gap` join at all,
 *  so before the journey block Trip mode said nothing about it; the block ignores that floor on
 *  purpose (§Z5 §M2 — a 40-minute walk in a 45-minute hole is the one thing the day must not be
 *  quiet about) and carried the free-time run in with it, so the same hole started reporting
 *  `5 דק׳ פנויות`. The walk is still stated. The five minutes are not. */
export const FREE_TIME_MIN_MINUTES = 15;

/** **Is this worth calling free time at all.** Asked rather than compared, for `earnsChipAt`'s own
 *  reason: the moment two surfaces compare against the constant themselves is the moment one of
 *  them uses `>` and the other `>=`. */
export const statesFreeTime = (minutes: number): boolean => minutes >= FREE_TIME_MIN_MINUTES;

const floored = (free: Gap | null): Gap | null => (free && earnsChip(free) ? free : null);

/**
 * The free time between event `a` and the next event `b`, and the slot a drop into it
 * lands on — **with no threshold**. Null only when there is no position to describe at
 * all, i.e. one of the two has no clock time.
 *
 * Measures from `a`'s end to `b`'s start — but most builder events are created
 * start-only (the form's end time is optional), so an event with no `endsAt`
 * is treated as its start instant rather than disqualifying the position. Otherwise
 * a day of start-only events would never surface a single gap (the bug the
 * screenshot caught).
 *
 * `minutes: 0` is a real answer and the reason this function exists separately from
 * `gapBetween`: two rows that touch still have somewhere between them to drop a row,
 * and before ADR-0161 that position was inexpressible unless 60 minutes happened to
 * be free there.
 */
export function freeBetween(a: TripEvent, b: TripEvent, tz: string): Gap | null {
  const aEnd = a.endsAt ?? a.startsAt;
  if (!aEnd || !b.startsAt) return null;
  const startMs = Date.parse(aEnd);
  const nextMs = Date.parse(b.startsAt);
  const minutes = Math.round((nextMs - startMs) / 60000);
  // Prefill a default-length block at the position's start, never the whole gap — but the
  // cap only applies when there is free time to cap AGAINST. A seam has none, and capping
  // there gave it a zero-length slot, i.e. no droppable position at all (caught by its own
  // test). So a seam offers the plain default block and a drop into it overlaps, which is
  // ADR-0161 §3's accepted outcome rather than something to prevent by arithmetic.
  const blockMs = GAP_FILL_MINUTES * 60000;
  const room = Math.max(0, nextMs - startMs);
  const fillEndMs = startMs + (room > 0 ? Math.min(blockMs, room) : blockMs);
  return {
    minutes,
    fill: {
      date: a.date,
      start: isoToTimeInput(aEnd, tz),
      end: isoToTimeInput(new Date(fillEndMs).toISOString(), tz),
    },
  };
}

/** `freeBetween` past the chip threshold — the gap that gets a `שבץ` chip. */
export function gapBetween(a: TripEvent, b: TripEvent, tz: string): Gap | null {
  return floored(freeBetween(a, b, tz));
}

/**
 * The day's two EDGE positions — the free time `freeBetween` structurally cannot see,
 * because each has an event on one side only (session-123).
 *
 * Both hug the event they are named for: "before the first" prefills the block
 * ENDING at the first event's start, "after the last" the block STARTING at the
 * last one's end. The day's window is a floor/ceiling on how far out they reach,
 * never the thing they aim at — dropping something "before the 10:00 tour" and
 * getting a 07:00 slot would answer a question nobody asked.
 *
 * Unfloored, like `freeBetween`: null only when there is no timed event to hang off
 * (an untimed-only day). `gapBeforeFirst`/`gapAfterLast` below apply the threshold.
 */
export function freeBeforeFirst(dayEvents: TripEvent[], date: string, tz: string): Gap | null {
  const starts = startsOf(dayEvents);
  if (starts.length === 0) return null;
  const dayStartMs = localMidnight(date, tz);
  const firstMin = Math.min(...starts.map((v) => minutesInto(v, dayStartMs)));
  // An event before the day's window — a 05:30 flight — still has the small hours
  // in front of it, and that is exactly when "add something before it" is asked.
  const floorMin = firstMin >= DAY_WINDOW.START_HOUR * 60 ? DAY_WINDOW.START_HOUR * 60 : 0;
  const minutes = Math.max(0, firstMin - floorMin);
  // With room, the block ENDS at the first event: that is what "before the first" means.
  // With none — a first event sitting on the window's own opening, which is the seam case
  // the chip never reached — the same rule as `freeBetween`: offer a real default block at
  // the position and let the drop overlap (ADR-0161 §3). Otherwise the head seam hands out
  // a zero-length slot, which is no droppable position at all.
  const block = { start: toHHMM(firstMin), end: toHHMM(firstMin + GAP_FILL_MINUTES) };
  return {
    minutes,
    fill: {
      date,
      ...(minutes > 0
        ? { start: toHHMM(Math.max(floorMin, firstMin - GAP_FILL_MINUTES)), end: toHHMM(firstMin) }
        : block),
    },
  };
}

export function freeAfterLast(dayEvents: TripEvent[], date: string, tz: string): Gap | null {
  const ends = endsOf(dayEvents);
  if (ends.length === 0) return null;
  const dayStartMs = localMidnight(date, tz);
  const lastMin = Math.max(...ends.map((v) => minutesInto(v, dayStartMs)));
  // The slot itself is the day's next opening — the same one the foot-of-the-day
  // add button offers, so the chip and the button cannot drift apart.
  return {
    minutes: Math.max(0, LAST_MINUTE_OF_DAY - lastMin),
    fill: nextSlot(dayEvents, date, tz),
  };
}

/** The day's two EDGE positions past the chip threshold. A last event that already runs
 *  past midnight (ADR-0037) leaves no same-day tail, which `freeAfterLast` reports as
 *  zero and this drops (ADR-0036). */
export function gapBeforeFirst(dayEvents: TripEvent[], date: string, tz: string): Gap | null {
  return floored(freeBeforeFirst(dayEvents, date, tz));
}

export function gapAfterLast(dayEvents: TripEvent[], date: string, tz: string): Gap | null {
  return floored(freeAfterLast(dayEvents, date, tz));
}

/**
 * **The block a CREATE gets at a position** (ADR-0161 §5): the position's own start, and the
 * length asked for — capped by the room actually there, so nothing is ever created longer
 * than the hole it went into.
 *
 * This is where `typicalMinutesFor` lands: a shelf idea or a new event has no length of its
 * own, so it takes its category's typical one instead of the flat `GAP_FILL_MINUTES` every
 * create used to get. Anything that already EXISTS never comes through here — §1 makes every
 * move keep the length it has.
 *
 * A position with no room (a seam) has nothing to cap against, so the block is offered whole
 * and the create overlaps, which is §3's accepted outcome — the same rule `freeBetween`
 * applies to its own default block.
 */
export function blockFor(free: Gap, minutes: number): GapDefaults {
  const startMin = toMin(free.fill.start);
  const wanted = free.minutes > 0 ? Math.min(minutes, free.minutes) : minutes;
  const endMin = Math.min(startMin + wanted, LAST_MINUTE_OF_DAY);
  return { ...free.fill, end: endMin > startMin ? toHHMM(endMin) : '' };
}

/**
 * **The block a shelf idea gets at a position** — `blockFor` with the length the idea's own
 * category usually takes (ADR-0161 §5).
 *
 * One line, and it is here rather than at the call sites because there are three of them now
 * (Plan's gap chip, Plan's `שיבוץ ליום`, and Trip's tappable gap since §9) and they must agree:
 * the same idea dropped in the same hole has to get the same block whichever mode asked.
 */
export function ideaBlock(category: EventCategory | undefined, free: Gap): GapDefaults {
  return blockFor(free, typicalMinutesFor(category));
}

/**
 * **The whole day as one position**, for the days that can hang a position off nothing
 * else (ADR-0161 §2, extended):
 *
 * - an **empty** day, where the only target used to be "move it here, keeping the clock
 *   time it already had" — which is not what `שבץ` means;
 * - a day of **untimed** events only, and
 * - a day whose only entries are booking **transition** points (a hotel check-out
 *   interleaved by instant, ADR-0064 §B).
 *
 * The last two are why this exists rather than being an empty-day special case: both
 * render the ordinary list, and both make `freeBeforeFirst`/`freeAfterLast` answer null
 * because neither has a timed event to measure from — so the day showed rows and accepted
 * a drop nowhere. One rule covers all three: **with nothing timed to sit beside, the
 * position is the day.**
 *
 * Its slot is the day's own opening, which is exactly what the foot-of-the-day add button
 * offers (`nextSlot`), so the two cannot drift. Its `minutes` is the window, so it reads
 * as a chip rather than a seam: an empty day has all of its time free, and saying so is
 * more useful than a hairline.
 */
export function freeWholeDay(date: string, tz: string): Gap {
  return {
    minutes: LAST_MINUTE_OF_DAY - DAY_WINDOW.START_HOUR * 60,
    fill: nextSlot([], date, tz),
  };
}

/** A GAP_FILL_MINUTES block starting where the day's last event ends (the open
 *  tail gapBetween can't see), or at DAY_WINDOW.START_HOUR on an empty day.
 *  Max end, not last-by-start: a long block can outlast a later-starting one.
 *  Kept within the same day (ADR-0036): the end clamps to 23:59, and drops
 *  entirely when the start leaves no room, so a late last event yields a
 *  start-only prefill instead of a block spilling past midnight. */
export function nextSlot(dayEvents: TripEvent[], date: string, tz: string): GapDefaults {
  const dayStartMs = localMidnight(date, tz);
  const ends = endsOf(dayEvents).map((v) => minutesInto(v, dayStartMs));
  const startMin = Math.min(
    ends.length ? Math.max(...ends) : DAY_WINDOW.START_HOUR * 60,
    LAST_MINUTE_OF_DAY,
  );
  const endMin = Math.min(startMin + GAP_FILL_MINUTES, LAST_MINUTE_OF_DAY);
  return {
    date,
    start: toHHMM(startMin),
    end: endMin > startMin ? toHHMM(endMin) : '',
  };
}
