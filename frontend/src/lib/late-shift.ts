// **The day takes a delay** (ADR-0231 §5) — the pure half of `מאחרים`.
//
// ADR-0161 §7/§10 named this and deferred it: the ripple already performs "push the rest of
// the day", what was missing was a way to ask for it WITHOUT moving one event first. This
// is that ask, as a patch set: which of today's rows move, by how much, and which one stops
// the shift. The write is `applyEventPatches` ("these events, these starts, one undo"), the
// same path a position swap takes.
//
// **What moves is exactly what the server's ripple would move** (`rippleForward`,
// `events.service.ts`): planned soft events ahead of now, in start order, up to the FIRST
// hard anchor. The anchor is where the ripple stops because ADR-0011 never auto-moves a
// commitment — and it is where a delay stops for a reason the ripple never had to state:
// a booked table re-synchronises you. Being late for the afternoon does not make you late
// for the table, nor for anything after it.
//
// Pure: no clock of its own, no React, no copy. The screen says what `now` is.
import { EVENT_KIND, EVENT_STATUS, type TripEvent, type UpdateEventInput } from '@waypoint/shared';
import { shiftIso } from './time';

export interface LateShift {
  /** One patch per moved event — start and end shifted together, so the length is kept. */
  patches: { id: string; patch: UpdateEventInput }[];
  /** The rows that move, in start order — what the sheet says before the tap. */
  moved: TripEvent[];
  /** The first commitment ahead of now, which does not move and stops the shift behind it.
   *  `null` when nothing hard is ahead. */
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
