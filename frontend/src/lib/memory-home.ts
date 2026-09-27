// **What the memory Home says about a finished trip** (ADR-0240 §4), as values ready to print.
//
// The numbers are `tripRecap`'s (ADR-0239 §9) and nothing here recounts them. What this decides
// is only which figures earn a tile and how each one reads: an estimate carries `~`, a figure
// the trip has no source for is not a tile at all, and one that rows still unmarked could move
// says how many on its second line.
import {
  BOOKING_TYPE,
  EVENT_CATEGORY,
  eventDisplayZones,
  eventStopPlaceId,
  iconForCategory,
  isTransportEvent,
  ltrIsolate,
  recapHappened,
  tripDates,
  type Booking,
  type MaybeItem,
  type Note,
  type RecapFigure,
  type TripEvent,
  type TripRecap,
  type ZoneEvidence,
} from '@waypoint/shared';
import { DISTANCE_STEP, DOT_SEPARATOR, MEMORY_DAY_GLYPHS, MEMORY_FIGURES_MAX } from '../constants';
import { t } from '../i18n/he';
import { dayListEvents } from './day-entries';
import { dayShot } from './day-photo';
import { dayHeadTitle, type DayFactsInput } from './day-title';
import { formatDuration } from './duration';
import { noteHost, type NoteHostRef } from './notes';
import { liveToday } from './places';
import { dayOfMonth, formatDayMonth, formatTime, weekdayLetter } from './time';

export interface MemoryFigure {
  key: 'places' | 'air' | 'shift' | 'ground' | 'foot';
  value: string;
  label: string;
  /** Unmarked rows that could still move this figure; absent at zero. */
  unresolved?: number;
}

const ESTIMATE_MARK = '~';
const MINUTES_PER_HOUR = 60;

/** Kilometres as a tile prints them: one decimal below the whole-km threshold, grouped whole
 *  kilometres above it — the same steps `formatDistance` uses, without its unit, which the
 *  tile's label carries. */
export function recapKm(meters: number): string {
  const km = meters / DISTANCE_STEP.KM_FROM_M;
  return km < DISTANCE_STEP.WHOLE_KM_FROM
    ? String(Math.round(km * 10) / 10)
    : Math.round(km).toLocaleString('en-US');
}

/** `+6`, `-7`, `+5.5`: signed, because which way the clock moved is the fact. */
export function recapHours(minutes: number): string {
  const hours = Math.round((Math.abs(minutes) / MINUTES_PER_HOUR) * 2) / 2;
  return `${minutes < 0 ? '-' : '+'}${hours}`;
}

function tile(
  key: MemoryFigure['key'],
  figure: RecapFigure,
  label: string,
  format: (value: number) => string,
  { admitsOpen = false } = {},
): MemoryFigure | undefined {
  if (figure.state === 'absent') return undefined;
  return {
    key,
    value: `${figure.estimate ? ESTIMATE_MARK : ''}${format(figure.value)}`,
    label,
    ...(admitsOpen && figure.unresolved ? { unresolved: figure.unresolved } : {}),
  };
}

/**
 * **The tiles, in the order they are worth reading**, at most `MEMORY_FIGURES_MAX`.
 *
 * Places first, because a trip is where you went. Then the air, the clock, and the ground.
 * A zero is left out rather than printed: `0 שעות הפרש` is true of a trip that never left its
 * zone, and it is not a memory of anything.
 */
export function memoryFigures(recap: TripRecap): MemoryFigure[] {
  const { figures } = recap;
  const nonZero = (figure: RecapFigure): RecapFigure =>
    figure.state === 'present' && figure.value === 0 ? { state: 'absent' } : figure;
  const fig = t.planHome.past.fig;
  return [
    // **Only the places tile repeats the unmarked count**, as drawn: rendered on every figure it
    // read `2 לא סומנו` three times over a footer already saying it, and a distance already
    // admits it is soft with its `~`.
    tile('places', figures.places, fig.places, String, { admitsOpen: true }),
    tile('air', nonZero(figures.airMeters), fig.air, recapKm),
    tile('shift', nonZero(figures.zoneShiftMinutes), fig.shift, recapHours),
    tile('ground', nonZero(figures.groundMeters), fig.ground, recapKm),
    tile('foot', nonZero(figures.footMeters), fig.foot, recapKm),
  ]
    .filter((figure): figure is MemoryFigure => figure !== undefined)
    .slice(0, MEMORY_FIGURES_MAX);
}

/** `ו׳ 25.09`: how every row on the memory Home names its day. */
const dayWhen = (date: string) => `${weekdayLetter(date)} ${formatDayMonth(date)}`;

/** A row's start as its own zone's clock, isolated for the RTL line it sits in. */
const clockOf = (event: TripEvent, evidence: ZoneEvidence) =>
  event.startsAt
    ? ltrIsolate(formatTime(event.startsAt, eventDisplayZones(event, evidence).start))
    : undefined;

/** One frame on the contact sheet, composed. */
export interface ContactSheetDay {
  date: string;
  /** Weekday and date, `ו׳ 25.09`. */
  when: string;
  /** The day's numeral, stamped where a picture would be. */
  numeral: string;
  name: string;
  glyphs: readonly string[];
  shot?: { url: string; of: string; credit: string };
}

/**
 * **The days worth a frame** (ADR-0240 §4): only days where something happened, each named,
 * pictured and marked from what happened on it — never from the plan — so a day whose every
 * row was skipped is not a memory, and a picture is never of a place nobody went.
 *
 * The rest are counted, not drawn: `quiet` is what the sheet's foot says, and the Days tab
 * still opens every day.
 */
export function memoryDays(
  input: Omit<DayFactsInput, 'date' | 'dayEvents'> & {
    trip: DayFactsInput['trip'] & { endDate: string };
  },
): { days: ContactSheetDay[]; quiet: number } {
  const { trip, bookings, places, placeLabels, enrichments } = input;
  const all = tripDates(trip.startDate, trip.endDate);
  const days: ContactSheetDay[] = [];
  for (const date of all) {
    const happened = dayListEvents(input.events, date, trip).filter(recapHappened);
    if (happened.length === 0) continue;
    const glyphs = [
      ...new Set(
        happened.map(
          (event) => event.icon ?? iconForCategory(event.category ?? EVENT_CATEGORY.OTHER),
        ),
      ),
    ].slice(0, MEMORY_DAY_GLYPHS);
    const shot = dayShot(happened, bookings, places, placeLabels, enrichments);
    days.push({
      date,
      when: dayWhen(date),
      numeral: dayOfMonth(date),
      name: dayHeadTitle({ ...input, date, dayEvents: happened }),
      glyphs,
      ...(shot ? { shot: { url: shot.url, of: shot.of, credit: shot.credit } } : {}),
    });
  }
  return { days, quiet: all.length - days.length };
}

/** One row of `ראשונים וטובים`, composed. */
export interface MemoryBest {
  key: 'first' | 'longestStop' | 'busiestDay' | 'walkDay' | 'last';
  icon: string;
  title: string;
  /** What makes this row a best (`הדבר הראשון`), then the facts behind it. */
  label: string;
  when?: string;
  /** A clock, bidi-isolated. Amber on the page: it still marks a time (ADR-0240 §4). */
  clock?: string;
  detail?: string;
  /** The day the row opens. */
  date: string;
  /** Present on a row about a PLACE, which is what earns the badge its teal pin; a row about a
   *  day has none (ADR-0240 §4). */
  placeId?: string;
}

/** The glyph a day row carries in place of a place's. */
const DAY_GLYPH = '📅';
const WALK_GLYPH = '🚶';

/**
 * **Firsts and bests** (ADR-0240 §4, epic 4.3): the first and last thing the trip did, the
 * longest stop, the fullest day and the day walked furthest. Every one is ADR-0239 §9's —
 * counted from what happened — and the three superlatives are `tripRecap`'s own, so the
 * narrative and the book will name the same ones. A row that would repeat another's subject
 * is dropped rather than printed twice.
 */
export function memoryBests(input: {
  recap: TripRecap;
  events: readonly TripEvent[];
  bookings: readonly Booking[];
  days: readonly ContactSheetDay[];
  evidence: ZoneEvidence;
}): MemoryBest[] {
  const { recap, events, bookings, days, evidence } = input;
  const copy = t.planHome.past.bests;
  const bookingOf = (event: TripEvent) =>
    event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const dayOf = (date: string) => days.find((day) => day.date === date);
  const iconOf = (event: TripEvent) =>
    event.icon ?? iconForCategory(event.category ?? EVENT_CATEGORY.OTHER);

  // A stop is a place the trip was AT: not a leg (its ends are airports) and not a bed.
  const stops = events
    .filter((event) => recapHappened(event) && event.startsAt)
    .filter((event) => {
      const booking = bookingOf(event);
      if (isTransportEvent(event, booking)) return false;
      return booking
        ? booking.type !== BOOKING_TYPE.HOTEL
        : event.category !== EVENT_CATEGORY.LODGING;
    })
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));

  const placeRow = (key: MemoryBest['key'], label: string, event: TripEvent, detail?: string) => {
    const row: MemoryBest = {
      key,
      icon: iconOf(event),
      title: event.title,
      label,
      when: dayOf(event.date)?.when,
      clock: clockOf(event, evidence),
      detail,
      date: event.date,
    };
    const placeId = eventStopPlaceId(event, bookingOf(event));
    return placeId ? { ...row, placeId } : row;
  };

  const rows: MemoryBest[] = [];
  const seen = new Set<string>();
  const first = stops[0];
  const last = stops.at(-1);
  if (first) {
    rows.push(placeRow('first', copy.first, first));
    seen.add(first.id);
  }
  const { longestStop, busiestDay, longestWalkDay } = recap.superlatives;
  if (longestStop.state === 'present' && !seen.has(longestStop.value.eventId)) {
    const event = events.find((e) => e.id === longestStop.value.eventId);
    if (event) {
      rows.push(
        placeRow(
          'longestStop',
          copy.longestStop,
          event,
          formatDuration(longestStop.value.minutes) ?? undefined,
        ),
      );
      seen.add(event.id);
    }
  }
  const dayTitle = (date: string) => {
    const day = dayOf(date);
    return day ? `${day.when} ${DOT_SEPARATOR} ${day.name}` : date;
  };
  const walked =
    longestWalkDay.state === 'present'
      ? t.map.near.km(
          `${longestWalkDay.estimate ? ESTIMATE_MARK : ''}${recapKm(longestWalkDay.value.meters)}`,
        )
      : undefined;
  // One day that is both the fullest and the one walked furthest is one row, not the same
  // title twice: the walk joins the day's facts.
  const sameDay =
    busiestDay.state === 'present' &&
    longestWalkDay.state === 'present' &&
    busiestDay.value.date === longestWalkDay.value.date;
  if (busiestDay.state === 'present') {
    rows.push({
      key: 'busiestDay',
      icon: DAY_GLYPH,
      title: dayTitle(busiestDay.value.date),
      label: copy.busiestDay,
      detail: [copy.places(busiestDay.value.places), sameDay && walked && copy.walked(walked)]
        .filter(Boolean)
        .join(` ${DOT_SEPARATOR} `),
      date: busiestDay.value.date,
    });
  }
  if (longestWalkDay.state === 'present' && !sameDay) {
    rows.push({
      key: 'walkDay',
      icon: WALK_GLYPH,
      title: dayTitle(longestWalkDay.value.date),
      label: copy.walkDay,
      detail: walked,
      date: longestWalkDay.value.date,
    });
  }
  if (last && !seen.has(last.id)) rows.push(placeRow('last', copy.last, last));
  return rows;
}

/** One row the trip never marked, as the stragglers sheet asks about it. */
export interface Straggler {
  event: TripEvent;
  /** Its day and clock, `ו׳ 25.09 · 21:30`. */
  subject: string;
}

/**
 * **The stragglers, in the order they happened** (ADR-0240 §4, epic 4.4): `tripRecap`'s own
 * list, so the sheet asks about exactly the rows every figure admits to.
 */
export function memoryStragglers(input: {
  recap: TripRecap;
  events: readonly TripEvent[];
  evidence: ZoneEvidence;
}): Straggler[] {
  const byId = new Map(input.events.map((event) => [event.id, event]));
  return input.recap.stragglers.flatMap((id) => {
    const event = byId.get(id);
    if (!event) return [];
    const subject = [dayWhen(event.date), clockOf(event, input.evidence)]
      .filter(Boolean)
      .join(` ${DOT_SEPARATOR} `);
    return [{ event, subject }];
  });
}

/** One row of `בפעם הבאה`, composed: a row the trip skipped, or an idea it never used. */
export interface NextTimeRow {
  id: string;
  icon: string;
  title: string;
  /** A skipped row carries `.tag-skip`; an idea says it was never reached. */
  skipped: boolean;
  when?: string;
  /** The day the row opens: a skipped row's own, an idea's pencilled-in one. Absent → the row
   *  has nowhere to open, since an idea for "someday" has no day. */
  date?: string;
  placeId?: string;
}

/**
 * **Next time** (ADR-0240 §4, epic 4.5): what the trip meant to do and did not, read-only.
 * `tripRecap`'s own list and order (skipped rows, then ideas never used), so the section and the
 * shares agree on it. Taking them to another trip is Phase 7's.
 */
export function memoryNextTime(input: {
  recap: TripRecap;
  events: readonly TripEvent[];
  bookings: readonly Booking[];
  maybes: readonly MaybeItem[];
}): NextTimeRow[] {
  const { recap, events, bookings, maybes } = input;
  const eventById = new Map(events.map((event) => [event.id, event]));
  const maybeById = new Map(maybes.map((maybe) => [maybe.id, maybe]));
  const glyph = (item: Pick<TripEvent, 'icon' | 'category'>) =>
    item.icon ?? iconForCategory(item.category ?? EVENT_CATEGORY.OTHER);

  const skipped = recap.nextTime.skipped.flatMap((id): NextTimeRow[] => {
    const event = eventById.get(id);
    if (!event) return [];
    const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
    const placeId = eventStopPlaceId(event, booking);
    return [
      {
        id,
        icon: glyph(event),
        title: event.title,
        skipped: true,
        when: dayWhen(event.date),
        date: event.date,
        ...(placeId ? { placeId } : {}),
      },
    ];
  });
  const ideas = recap.nextTime.ideas.flatMap((id): NextTimeRow[] => {
    const maybe = maybeById.get(id);
    if (!maybe) return [];
    const date = maybe.targetDate ?? undefined;
    return [
      {
        id,
        icon: glyph(maybe),
        title: maybe.title,
        skipped: false,
        ...(date ? { when: dayWhen(date), date } : {}),
        ...(maybe.placeId ? { placeId: maybe.placeId } : {}),
      },
    ];
  });
  return [...skipped, ...ideas];
}

/** One day of the journal: its heading and the notes written about it, in the order written. */
export interface JournalDay {
  date: string;
  /** `ו׳ 25.09 · אסקוסה` where the contact sheet named the day, else the date alone. */
  heading: string;
  notes: Note[];
}

/**
 * **The notes as a journal** (ADR-0240 §4, epic 4.6): every note in day order, under the day it
 * is about. A note ON something dated (a stop, an idea pencilled in for a day) belongs to that
 * day, since it is the day the note describes; any other note belongs to the day it was written,
 * in the zone the trip was in when it was written (`liveToday`, never the trip's home zone).
 *
 * A note whose day falls outside the trip (the packing list written a month before) is planning,
 * not a diary: it is counted, not drawn, and the Index still holds it.
 */
export function memoryJournal(input: {
  trip: { startDate: string; endDate: string };
  notes: readonly Note[];
  hosts: Map<string, NoteHostRef>;
  evidence: ZoneEvidence;
  days: readonly ContactSheetDay[];
}): { days: JournalDay[]; outside: number } {
  const { trip, notes, hosts, evidence, days } = input;
  const byDate = new Map<string, Note[]>();
  let outside = 0;
  const written = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const note of written) {
    const date = noteHost(note, hosts)?.date ?? liveToday(Date.parse(note.createdAt), evidence);
    if (date < trip.startDate || date > trip.endDate) {
      outside += 1;
      continue;
    }
    byDate.set(date, [...(byDate.get(date) ?? []), note]);
  }
  const nameOf = new Map(days.map((day) => [day.date, day.name]));
  return {
    days: [...byDate.keys()].sort().map((date) => ({
      date,
      heading: [dayWhen(date), nameOf.get(date)].filter(Boolean).join(` ${DOT_SEPARATOR} `),
      notes: byDate.get(date)!,
    })),
    outside,
  };
}
