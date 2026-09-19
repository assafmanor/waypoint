// **The day takes a delay** (ADR-0231 §5) — the pure half of `מאחרים`.
//
// ADR-0161 §7/§10 named this and deferred it: the ripple already performs "push the rest of
// the day", what was missing was a way to ask for it WITHOUT moving one event first. This
// is that ask, as a patch set: which of today's rows move, by how much, and which one stops
// the shift. The write is `applyEventPatches` ("these events, these starts, one undo"), the
// same path a position swap takes.
//
// **What moves is exactly what the server's ripple would move** (`rippleForward`,
// `events.service.ts`): planned soft events ahead of now, in start order, up to the hard
// anchor. The anchor is where the ripple stops because ADR-0011 never auto-moves a
// commitment — and it is where a delay stops for a reason the ripple never had to state:
// a booked table re-synchronises you. Being late for the afternoon does not make you late
// for the table, nor for anything after it.
//
// **A commitment re-synchronises you only if the delay reached it.** The first version stopped
// at the first hard row ahead, full stop, which left the day with nothing to offer on exactly
// the morning you are late for a booking — and handed the same afternoon back the minute that
// booking started. The walk now steps over a commitment it has collected nothing for; the set
// is unchanged wherever the control was already offered (ADR-0231 §5, 2026-09-19 amendment).
//
// Pure: no clock of its own, no React, no copy. The screen says what `now` is.
import { EVENT_KIND, EVENT_STATUS, type TripEvent, type UpdateEventInput } from '@waypoint/shared';
import { shiftIso } from './time';

export interface LateShift {
  /** One patch per moved event — start and end shifted together, so the length is kept. */
  patches: { id: string; patch: UpdateEventInput }[];
  /** The rows that move, in start order — what the sheet says before the tap. */
  moved: TripEvent[];
  /** The commitment the shift stops at — the first hard row with something being pushed into
   *  it. `null` when nothing hard is ahead, and when the only ones ahead were stepped over
   *  because the delay had not reached anything yet. A hard row never moves either way. */
  anchor: TripEvent | null;
}

const startMs = (e: TripEvent) => Date.parse(e.startsAt!);

/**
 * Today's delay, by `minutes`, from `nowMs`. Rows already started are behind you and stay;
 * done and skipped rows are records, not plans, and stay; untimed rows hold no position
 * to move (ADR-0161 §10).
 */
export function lateShift(dayEvents: TripEvent[], nowMs: number, minutes: number): LateShift {
  const ahead = dayEvents
    .filter((e) => e.status === EVENT_STATUS.PLANNED && e.startsAt && startMs(e) > nowMs)
    .sort((a, b) => startMs(a) - startMs(b) || a.sortOrder - b.sortOrder);
  const moved: TripEvent[] = [];
  let anchor: TripEvent | null = null;
  for (const e of ahead) {
    if (e.kind === EVENT_KIND.HARD) {
      // **A commitment absorbs the delay only once something is being pushed into it.** While
      // nothing has been collected, this one is simply the next thing ahead and you are late for
      // IT — so it is stepped over (never moved, ADR-0011) and the walk goes on to the rows the
      // delay actually reaches. Stopping here instead would make the control's presence a
      // function of which row happens to be next: absent at ⁦08:42⁩ with a ⁦09:00⁩ booking ahead,
      // present at ⁦09:01⁩ over the same untouched afternoon (ADR-0231 §5, 2026-09-19 amendment).
      if (moved.length === 0) continue;
      anchor = e;
      break;
    }
    moved.push(e);
  }
  return {
    moved,
    anchor,
    patches: moved.map((e) => ({
      id: e.id,
      patch: {
        startsAt: shiftIso(e.startsAt!, minutes),
        ...(e.endsAt ? { endsAt: shiftIso(e.endsAt, minutes) } : {}),
      },
    })),
  };
}
