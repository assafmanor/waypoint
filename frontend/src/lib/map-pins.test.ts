import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { buildPlaceUsageIndex, type PlaceUsage } from './place-usage';
import {
  buildPinOrderIndex,
  hasScheduleSlot,
  isFramedByCamera,
  PIN_TIER,
  placePinTier,
  placePoint,
  pinZIndex,
} from './map-pins';

const DAY = '2026-07-20';
const NEXT_DAY = '2026-07-21';
// The fixtures carry fixed dates, so the clock is pinned rather than read (frontend
// CLAUDE.md): noon on the active day.
const NOON = Date.parse(`${DAY}T12:00:00Z`);
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00Z`);

const place = (id: string, extra?: Partial<Place>): Place => ({
  id,
  tripId: 't',
  name: id,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  lat: 1,
  lng: 2,
  ...extra,
});

const event = (partial: Partial<TripEvent> & Pick<TripEvent, 'id'>): TripEvent => ({
  tripId: 't',
  date: DAY,
  title: `${partial.id} plan`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const maybe = (partial: Partial<MaybeItem> & Pick<MaybeItem, 'id'>): MaybeItem =>
  ({ tripId: 't', title: partial.id, consumed: false, ...partial }) as MaybeItem;

const booking = (partial: Partial<Booking> & Pick<Booking, 'id' | 'type'>): Booking => ({
  tripId: 't',
  title: partial.id,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

/** Build the index the screen builds, then look one place up by id. */
function usages(input: {
  events?: TripEvent[];
  bookings?: Booking[];
  maybeItems?: MaybeItem[];
  places?: Place[];
}): Map<string, PlaceUsage> {
  return buildPlaceUsageIndex(
    input.events ?? [],
    input.bookings ?? [],
    input.maybeItems ?? [],
    input.places ?? [],
  );
}

const nameOf = (u: PlaceUsage) => u.placeId;

describe('placePinTier — four populations plus the ghost (ADR-0121 §6)', () => {
  it('a scheduled stop still ahead of you is a solid upcoming pin', () => {
    const index = usages({
      places: [place('museum')],
      events: [event({ id: 'e', placeId: 'museum', startsAt: `${DAY}T20:00:00Z` })],
    });
    expect(placePinTier(index.get('museum')!, { onDate: DAY, nowMs: NOON })).toBe(
      PIN_TIER.upcoming,
    );
  });

  it('a stop whose day has ended is behind you, and a settled one is too before its time', () => {
    const index = usages({
      places: [place('morning'), place('later')],
      events: [
        event({ id: 'e1', placeId: 'morning', startsAt: `${DAY}T09:00:00Z` }),
        // A human who settled the day outranks the clock (ADR-0117 §2).
        event({
          id: 'e2',
          placeId: 'later',
          startsAt: `${DAY}T20:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
      ],
    });
    const ctx = { onDate: DAY, nowMs: NOON };
    expect(placePinTier(index.get('morning')!, ctx)).toBe(PIN_TIER.behind);
    expect(placePinTier(index.get('later')!, ctx)).toBe(PIN_TIER.behind);
  });

  it('a strictly-middle stay night is ambient backdrop, not a stop', () => {
    const index = usages({
      places: [place('hotel')],
      events: [
        event({
          id: 'h',
          placeId: 'hotel',
          category: 'lodging',
          date: '2026-07-19',
          endDate: '2026-07-22',
          startsAt: '2026-07-19T06:00:00Z',
          endsAt: '2026-07-22T02:00:00Z',
        }),
      ],
    });
    expect(placePinTier(index.get('hotel')!, { onDate: DAY, nowMs: NOON })).toBe(PIN_TIER.ambient);
  });

  it('an idea pencilled in for the day is an idea: nothing scheduled it', () => {
    const index = usages({
      places: [place('cafe')],
      maybeItems: [maybe({ id: 'm', placeId: 'cafe', targetDate: DAY })],
    });
    expect(placePinTier(index.get('cafe')!, { onDate: DAY, nowMs: NOON })).toBe(PIN_TIER.idea);
  });

  // The population the list never had to render: hiding the café you are standing
  // next to because it is pencilled for Thursday is the inverse of this tab's job.
  it('a place on another day is a ghost — and ghosts exist ONLY in day scope', () => {
    const index = usages({
      places: [place('tomorrow')],
      events: [event({ id: 'e', placeId: 'tomorrow', date: NEXT_DAY })],
    });
    const usage = index.get('tomorrow')!;
    expect(placePinTier(usage, { onDate: DAY, nowMs: NOON })).toBe(PIN_TIER.ghost);
    // All-days scope excludes nothing, so there is nothing for a ghost to be.
    expect(placePinTier(usage, { nowMs: NOON })).not.toBe(PIN_TIER.ghost);
  });

  it('a place with NO day at all is a ghost in day scope too (the ללא יום block)', () => {
    const index = usages({
      places: [place('someday')],
      maybeItems: [maybe({ id: 'm', placeId: 'someday' })],
    });
    expect(placePinTier(index.get('someday')!, { onDate: DAY, nowMs: NOON })).toBe(PIN_TIER.ghost);
  });

  it('in all-days scope a dayless idea is an idea, and a dayless booking is not', () => {
    const index = usages({
      places: [place('someday'), place('unscheduled')],
      maybeItems: [maybe({ id: 'm', placeId: 'someday' })],
      bookings: [booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'unscheduled' })],
    });
    expect(placePinTier(index.get('someday')!, { nowMs: NOON })).toBe(PIN_TIER.idea);
    // A real commitment with no time is not an idea — it just has no position.
    expect(placePinTier(index.get('unscheduled')!, { nowMs: NOON })).toBe(PIN_TIER.upcoming);
  });
});

describe('the pin number is the day sequence, and nothing renumbers it (§6)', () => {
  const at2 = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  const seed = () =>
    usages({
      places: [place('zoo'), place('market'), place('bar')],
      events: [
        event({ id: 'e1', placeId: 'bar', startsAt: at2('20:00'), category: 'food' }),
        event({ id: 'e2', placeId: 'market', startsAt: at2('13:00'), category: 'shopping' }),
        event({ id: 'e3', placeId: 'zoo', startsAt: at2('09:00'), category: 'sightseeing' }),
      ],
    });

  it('numbers by the clock, not the alphabet — the same order DayView renders', () => {
    const index = buildPinOrderIndex([...seed().values()], { nameOf, onDate: DAY });
    expect(index.get('zoo')).toBe(1);
    expect(index.get('market')).toBe(2);
    expect(index.get('bar')).toBe(3);
  });

  // A visited stop keeps its `1` though the ahead/behind partition sinks it: the
  // partition changes prominence, never the position. That is why no clock reaches
  // the number — the tiers below move with time, the numbers do not.
  it('the clock changes the TIERS and leaves the numbers alone', () => {
    const all = [...seed().values()];
    const numbers = buildPinOrderIndex(all, { nameOf, onDate: DAY });
    const tiersAt = (nowMs: number) =>
      all.map((u) => placePinTier(u, { onDate: DAY, nowMs, today: DAY }));

    expect(tiersAt(at(DAY, '00:00'))).toEqual([
      PIN_TIER.upcoming,
      PIN_TIER.upcoming,
      PIN_TIER.upcoming,
    ]);
    expect(tiersAt(at(DAY, '23:59'))).toEqual([PIN_TIER.behind, PIN_TIER.behind, PIN_TIER.behind]);
    // Same index, both ends of the day.
    expect([...buildPinOrderIndex(all, { nameOf, onDate: DAY }).entries()]).toEqual([
      ...numbers.entries(),
    ]);
    expect(numbers.get('zoo')).toBe(1);
  });

  // Gaps are correct AND informative: `1, 3` says something is filtered out. The
  // index is built over the whole scoped set, so a chip can only hide a pin, never
  // renumber the rest.
  it('a filter leaves gaps rather than renumbering', () => {
    const all = [...seed().values()];
    const index = buildPinOrderIndex(all, { nameOf, onDate: DAY });
    const food = all.filter((u) => u.categories.includes('food'));
    expect(food.map((u) => index.get(u.placeId))).toEqual([3]);
  });

  it('an idea and an ambient night get no number — they have no position in the day', () => {
    const index = buildPinOrderIndex(
      [
        ...usages({
          places: [place('stop'), place('cafe'), place('hotel')],
          events: [
            event({ id: 'e', placeId: 'stop', startsAt: at2('09:00') }),
            event({
              id: 'h',
              placeId: 'hotel',
              category: 'lodging',
              date: '2026-07-19',
              endDate: '2026-07-22',
              startsAt: '2026-07-19T06:00:00Z',
              endsAt: '2026-07-22T02:00:00Z',
            }),
          ],
          maybeItems: [maybe({ id: 'm', placeId: 'cafe', targetDate: DAY })],
        }).values(),
      ],
      { nameOf, onDate: DAY },
    );
    expect(index.get('stop')).toBe(1);
    expect(index.has('cafe')).toBe(false);
    expect(index.has('hotel')).toBe(false);
  });

  // Asserted in BOTH day scopes, since they are genuinely different derivations
  // (frontend CLAUDE.md) — all-days numbers the whole trip's sequence.
  it('all-days scope numbers the trip sequence, earliest day first', () => {
    const index = buildPinOrderIndex(
      [
        ...usages({
          places: [place('today-stop'), place('tomorrow-stop')],
          events: [
            event({ id: 'e1', placeId: 'today-stop', startsAt: at2('18:00') }),
            event({
              id: 'e2',
              placeId: 'tomorrow-stop',
              date: NEXT_DAY,
              startsAt: `${NEXT_DAY}T09:00:00Z`,
            }),
          ],
        }).values(),
      ],
      { nameOf },
    );
    expect(index.get('today-stop')).toBe(1);
    expect(index.get('tomorrow-stop')).toBe(2);
  });
});

describe('hasScheduleSlot', () => {
  it('needs a real event edge — a pencil mark and a mid-span night are neither', () => {
    expect(hasScheduleSlot({ date: DAY, prominence: 'edge', eventId: 'e' })).toBe(true);
    expect(hasScheduleSlot({ date: DAY, prominence: 'edge' })).toBe(false);
    expect(hasScheduleSlot({ date: DAY, prominence: 'ambient', eventId: 'e' })).toBe(false);
    expect(hasScheduleSlot(undefined)).toBe(false);
  });
});

describe('pinZIndex — coincident pins have a stated order (§6)', () => {
  it('the next stop outranks everything', () => {
    expect(pinZIndex({ tier: PIN_TIER.upcoming, nextStop: true })).toBeGreaterThan(
      pinZIndex({ tier: PIN_TIER.upcoming, order: 1 }),
    );
    // …even when the thing under it is an idea sitting on the same spot.
    expect(pinZIndex({ tier: PIN_TIER.ghost, nextStop: true })).toBeGreaterThan(
      pinZIndex({ tier: PIN_TIER.upcoming, order: 1 }),
    );
  });

  it('ranks ahead > ideas > ambient > behind > ghosts', () => {
    const z = (tier: (typeof PIN_TIER)[keyof typeof PIN_TIER]) => pinZIndex({ tier });
    expect(z(PIN_TIER.upcoming)).toBeGreaterThan(z(PIN_TIER.idea));
    expect(z(PIN_TIER.idea)).toBeGreaterThan(z(PIN_TIER.ambient));
    expect(z(PIN_TIER.ambient)).toBeGreaterThan(z(PIN_TIER.behind));
    expect(z(PIN_TIER.behind)).toBeGreaterThan(z(PIN_TIER.ghost));
  });

  it('within what is ahead, an earlier stop sits on top — never past its own tier', () => {
    expect(pinZIndex({ tier: PIN_TIER.upcoming, order: 1 })).toBeGreaterThan(
      pinZIndex({ tier: PIN_TIER.upcoming, order: 4 }),
    );
    // A big number must not fall through to a lower tier.
    expect(pinZIndex({ tier: PIN_TIER.upcoming, order: 500 })).toBeGreaterThan(
      pinZIndex({ tier: PIN_TIER.idea }),
    );
  });
});

describe('placePoint — only coord-bearing places pin', () => {
  it('reads the coordinates, and is undefined for a coordless Place-lite', () => {
    expect(placePoint(place('x'))).toEqual({ lat: 1, lng: 2 });
    expect(placePoint({ lat: null, lng: null })).toBeUndefined();
    expect(placePoint({})).toBeUndefined();
    // 0,0 is a real place (the Gulf of Guinea), not "absent".
    expect(placePoint({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 });
  });
});

// Session 134, second report: with the day scope on, a two-stop day framed three
// continents. The fit was working — it was fitting the GHOST tier too, and the
// trip's other days were scattered across Europe and Asia.
describe('isFramedByCamera — the camera answers the day, not its context (§6/§7)', () => {
  it('frames every tier the day actually contains', () => {
    for (const tier of [PIN_TIER.upcoming, PIN_TIER.idea, PIN_TIER.ambient, PIN_TIER.behind]) {
      expect(isFramedByCamera({ tier })).toBe(true);
    }
  });

  // A ghost is what the filter left out: present because it is physically there,
  // subordinate by construction. Letting it pull the frame sends the camera to a
  // place this day does not contain — which is the whole reported bug.
  it('never frames a ghost', () => {
    expect(isFramedByCamera({ tier: PIN_TIER.ghost })).toBe(false);
  });

  it('is the same subordination near-me already applies to its sort and chips', () => {
    // Stated as a test so the two cannot drift: one rule, three consumers.
    const canvas = [
      { tier: PIN_TIER.upcoming },
      { tier: PIN_TIER.ghost },
      { tier: PIN_TIER.behind },
      { tier: PIN_TIER.ghost },
    ];
    expect(canvas.filter(isFramedByCamera)).toHaveLength(2);
  });
});
