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
  isAsidePin,
  isFramedByCamera,
  PIN_TIER,
  pinClearanceFor,
  pinHeightFor,
  pinSizeCss,
  placePinTier,
  placePoint,
  pinOutcome,
  pinZIndex,
} from './map-pins';
import { MAP_PIN } from '../constants';

const DAY = '2026-07-20';
const NEXT_DAY = '2026-07-21';
const PREV_DAY = '2026-07-19';
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

  // ADR-0130 §2, reported: "past places shouldn't be faded on plan mode". A day you are
  // arranging has no past — and the stops you can least afford to see dimmed are the ones
  // you came to rearrange. The clock is still passed (it resolves WHICH day a place is
  // read as in all-days); what `planning` withdraws is the demotion.
  it('in Plan mode nothing is behind you — the clock still resolves, it just stops demoting', () => {
    const index = usages({
      places: [place('morning'), place('settled')],
      events: [
        event({ id: 'e1', placeId: 'morning', startsAt: `${DAY}T09:00:00Z` }),
        event({
          id: 'e2',
          placeId: 'settled',
          startsAt: `${DAY}T20:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
      ],
    });
    const ctx = { onDate: DAY, nowMs: NOON, planning: true };
    expect(placePinTier(index.get('morning')!, ctx)).toBe(PIN_TIER.upcoming);
    expect(placePinTier(index.get('settled')!, ctx)).toBe(PIN_TIER.upcoming);
    // And it holds in all-days, where Plan mode's default scope actually is.
    expect(placePinTier(index.get('morning')!, { nowMs: NOON, today: DAY, planning: true })).toBe(
      PIN_TIER.upcoming,
    );
  });

  // The flag withdraws exactly one verdict and nothing else: a day that is past is still
  // read as the day it is, so an ambient night stays ambient and an idea stays an idea.
  it('Plan mode does not promote anything else — an idea on a past day is still an idea', () => {
    const index = usages({
      places: [place('cafe')],
      maybeItems: [maybe({ id: 'm', placeId: 'cafe', targetDate: DAY })],
    });
    const ctx = { onDate: DAY, nowMs: at(NEXT_DAY, '10:00'), today: NEXT_DAY, planning: true };
    expect(placePinTier(index.get('cafe')!, ctx)).toBe(PIN_TIER.idea);
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

  // ADR-0130 §3: it used to be a ghost, which said "another day's business" about a
  // place whose whole point is that no day has claimed it. A ghost is ELSEWHERE; this is
  // NOWHERE, which is exactly what leaves it available today.
  it('a dayless shelf maybe is a shelf pin in day scope, not another day’s ghost', () => {
    const index = usages({
      places: [place('someday')],
      maybeItems: [maybe({ id: 'm', placeId: 'someday' })],
    });
    expect(placePinTier(index.get('someday')!, { onDate: DAY, nowMs: NOON })).toBe(PIN_TIER.shelf);
  });

  // The other half of the split, and the reason it is keyed on `days` rather than on
  // "did `placeDay` fail": a maybe pencilled for Thursday IS somewhere else.
  it('a maybe pencilled for another day stays a ghost', () => {
    const index = usages({
      places: [place('thursday')],
      maybeItems: [maybe({ id: 'm', placeId: 'thursday', targetDate: NEXT_DAY })],
    });
    expect(placePinTier(index.get('thursday')!, { onDate: DAY, nowMs: NOON })).toBe(PIN_TIER.ghost);
  });

  // A dayless place that is NOT on the shelf makes no claim to be available — an
  // unlinked booking is a commitment with no position, and "maybe" would be a lie.
  it('a dayless place that is not on the shelf is still a ghost in day scope', () => {
    const index = usages({
      places: [place('unscheduled')],
      bookings: [booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'unscheduled' })],
    });
    expect(placePinTier(index.get('unscheduled')!, { onDate: DAY, nowMs: NOON })).toBe(
      PIN_TIER.ghost,
    );
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

  // All-days scope resolved a place against `days[0]`, so one past day desaturated a
  // pin the trip is not done with — the canvas half of the same defect the list's
  // `מה שמאחורינו` block showed.
  describe('all-days scope tiers a place by the day it is LIVE on', () => {
    it('a place visited earlier and booked again later is a solid upcoming pin', () => {
      const index = usages({
        places: [place('cafe')],
        events: [
          event({
            id: 'e1',
            placeId: 'cafe',
            date: '2026-07-18',
            startsAt: '2026-07-18T10:00:00Z',
            status: EVENT_STATUS.DONE,
          }),
          event({ id: 'e2', placeId: 'cafe', date: NEXT_DAY, startsAt: `${NEXT_DAY}T10:00:00Z` }),
        ],
      });
      expect(placePinTier(index.get('cafe')!, { nowMs: NOON, today: DAY })).toBe(PIN_TIER.upcoming);
    });

    it('the stay you sleep in tonight keeps its ambient backdrop, not a behind pin', () => {
      const index = usages({
        places: [place('hotel')],
        events: [
          event({
            id: 'h',
            placeId: 'hotel',
            category: 'lodging',
            date: '2026-07-18',
            endDate: '2026-07-22',
            startsAt: '2026-07-18T15:00:00Z',
            endsAt: '2026-07-22T10:00:00Z',
          }),
        ],
      });
      expect(placePinTier(index.get('hotel')!, { nowMs: NOON, today: DAY })).toBe(PIN_TIER.ambient);
    });

    it('a place whose EVERY day has passed is still behind you', () => {
      const index = usages({
        places: [place('twice')],
        events: [
          event({ id: 'e1', placeId: 'twice', date: '2026-07-17' }),
          event({ id: 'e2', placeId: 'twice', date: '2026-07-18' }),
        ],
      });
      expect(placePinTier(index.get('twice')!, { nowMs: NOON, today: DAY })).toBe(PIN_TIER.behind);
    });
  });
});

describe('pinOutcome — what happened there, on the two tiers that can say (ADR-0137)', () => {
  const ctx = { onDate: DAY, nowMs: NOON };
  const settled = (id: string, status: TripEvent['status'], extra?: Partial<TripEvent>) =>
    event({ id: `e-${id}`, placeId: id, startsAt: `${DAY}T09:00:00Z`, status, ...extra });

  it('a passed stop reports the outcome a human wrote, and nothing when nobody did', () => {
    const index = usages({
      places: [place('been'), place('bailed'), place('nobodysaid')],
      events: [
        settled('been', EVENT_STATUS.DONE),
        settled('bailed', EVENT_STATUS.SKIPPED),
        settled('nobodysaid', EVENT_STATUS.PLANNED),
      ],
    });
    expect(pinOutcome(index.get('been')!, ctx)).toBe('done');
    expect(pinOutcome(index.get('bailed')!, ctx)).toBe('skipped');
    // ADR-0117 §1's third state, and the commonest: the grey is the whole claim, exactly
    // as the row shows no tag for it.
    expect(pinOutcome(index.get('nobodysaid')!, ctx)).toBeUndefined();
    // The tier is unchanged by any of it — the mark is a second axis, not a fourth tier.
    for (const id of ['been', 'bailed', 'nobodysaid']) {
      expect(placePinTier(index.get(id)!, ctx)).toBe(PIN_TIER.behind);
    }
  });

  // THE REPORT'S OWN POPULATION (owner, session 185): "a ghost could be unmarked, skipped,
  // or consumed". A ghost has no day in the scope, so it reports the day it is LIVE on.
  it('a ghost reports what happened on its OWN day, not on the one you are looking at', () => {
    const index = usages({
      places: [place('yesterday'), place('bailedyesterday')],
      events: [
        event({
          id: 'y',
          placeId: 'yesterday',
          date: PREV_DAY,
          startsAt: `${PREV_DAY}T13:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
        event({
          id: 'by',
          placeId: 'bailedyesterday',
          date: PREV_DAY,
          startsAt: `${PREV_DAY}T15:00:00Z`,
          status: EVENT_STATUS.SKIPPED,
        }),
      ],
    });
    const dayCtx = { onDate: DAY, nowMs: NOON, today: DAY };
    expect(placePinTier(index.get('yesterday')!, dayCtx)).toBe(PIN_TIER.ghost);
    expect(pinOutcome(index.get('yesterday')!, dayCtx)).toBe('done');
    expect(pinOutcome(index.get('bailedyesterday')!, dayCtx)).toBe('skipped');
  });

  // …and a ghost aimed AHEAD says nothing, which is not a special case: nothing has
  // happened there yet, so there is no outcome to report.
  it('a ghost on a day still ahead of you carries no mark', () => {
    const index = usages({
      places: [place('friday')],
      events: [
        event({ id: 'f', placeId: 'friday', date: NEXT_DAY, startsAt: `${NEXT_DAY}T19:00:00Z` }),
      ],
    });
    const dayCtx = { onDate: DAY, nowMs: NOON, today: DAY };
    expect(placePinTier(index.get('friday')!, dayCtx)).toBe(PIN_TIER.ghost);
    expect(pinOutcome(index.get('friday')!, dayCtx)).toBeUndefined();
  });

  it('no other tier carries one — an idea and a maybe have no event to have settled', () => {
    const index = usages({
      places: [place('ahead'), place('idea'), place('shelved')],
      events: [event({ id: 'a', placeId: 'ahead', startsAt: `${DAY}T20:00:00Z` })],
      maybeItems: [
        maybe({ id: 'm1', placeId: 'idea', targetDate: DAY }),
        maybe({ id: 'm2', placeId: 'shelved' }),
      ],
    });
    expect(placePinTier(index.get('ahead')!, ctx)).toBe(PIN_TIER.upcoming);
    expect(pinOutcome(index.get('ahead')!, ctx)).toBeUndefined();
    expect(pinOutcome(index.get('idea')!, ctx)).toBeUndefined();
    expect(pinOutcome(index.get('shelved')!, ctx)).toBeUndefined();
  });

  // `spanDays` gives EVERY day of a span the event's status, so without this a hotel
  // marked done would stamp a ✓ on each of its nights — a claim nobody made about any one
  // of them. Same suppression the row runs (`Map.tsx`'s `dayMeta`).
  it('a strictly-middle stay night reports nothing, though its stay is settled', () => {
    const index = usages({
      places: [place('hotel')],
      events: [
        event({
          id: 'stay',
          placeId: 'hotel',
          category: 'lodging',
          date: PREV_DAY,
          endDate: NEXT_DAY,
          startsAt: `${PREV_DAY}T15:00:00Z`,
          endsAt: `${NEXT_DAY}T10:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
      ],
    });
    // DAY is the strictly-middle night of PREV_DAY → NEXT_DAY, and the tier here is
    // `behind` rather than `ambient`: settling the stay settles every day of it
    // (ADR-0117 §2 outranks the clock), and `behind` is resolved first. Which is exactly
    // why the ambient guard cannot live on the tier — it has to read the DAY.
    const midStay = { onDate: DAY, nowMs: NOON };
    expect(placePinTier(index.get('hotel')!, midStay)).toBe(PIN_TIER.behind);
    expect(pinOutcome(index.get('hotel')!, midStay)).toBeUndefined();
    // The stay's own EDGES do report it — that is where a human settled something.
    expect(pinOutcome(index.get('hotel')!, { onDate: PREV_DAY, nowMs: NOON })).toBe('done');
    expect(pinOutcome(index.get('hotel')!, { onDate: NEXT_DAY, nowMs: NOON })).toBe('done');
  });

  // Plan mode withdraws `behind` entirely (ADR-0130 §2), so a filled pin has no past to
  // report on — the mark goes with the tier rather than needing a rule of its own. A GHOST
  // keeps speaking, because it is about another day whichever mode you are in.
  it('Plan mode marks no filled pin, and still marks a ghost', () => {
    const index = usages({
      places: [place('been'), place('yesterday')],
      events: [
        settled('been', EVENT_STATUS.DONE),
        event({
          id: 'y',
          placeId: 'yesterday',
          date: PREV_DAY,
          startsAt: `${PREV_DAY}T13:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
      ],
    });
    const planning = { onDate: DAY, nowMs: NOON, today: DAY, planning: true };
    expect(pinOutcome(index.get('been')!, planning)).toBeUndefined();
    expect(pinOutcome(index.get('yesterday')!, planning)).toBe('done');
  });

  // ADR-0117 §1: `done` beats `skipped` across a day's references — you were there.
  it('a visit outranks a skip when one day carries both', () => {
    const index = usages({
      places: [place('cafe')],
      events: [
        event({
          id: 'skip',
          placeId: 'cafe',
          startsAt: `${DAY}T09:00:00Z`,
          status: EVENT_STATUS.SKIPPED,
        }),
        event({
          id: 'went',
          placeId: 'cafe',
          startsAt: `${DAY}T10:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
      ],
    });
    expect(pinOutcome(index.get('cafe')!, ctx)).toBe('done');
  });

  // The all-days scope is its own render (frontend CLAUDE.md's "assert across both day
  // scopes"), and there is no ghost tier in it at all — so what has to hold is that a
  // behind pin still reports, resolved against the day it is LIVE on.
  it('all-days scope still marks what is behind you', () => {
    const index = usages({
      places: [place('been')],
      events: [
        event({
          id: 'b',
          placeId: 'been',
          date: PREV_DAY,
          startsAt: `${PREV_DAY}T13:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
      ],
    });
    const allDays = { nowMs: NOON, today: DAY };
    expect(placePinTier(index.get('been')!, allDays)).toBe(PIN_TIER.behind);
    expect(pinOutcome(index.get('been')!, allDays)).toBe('done');
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
  // (frontend CLAUDE.md) — and this is the one the number does not survive. §6 defined
  // it as the index in THE DAY's sequence, so with no day it sequenced the whole trip
  // and a pin read `27`. Renumbering per day is the worse answer: two pins both
  // reading `1` on one canvas, neither saying which day it is. The row states its day
  // in words instead, which is where the number was ambiguous.
  const trip = () =>
    usages({
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
    });

  it('all-days scope numbers nothing — there is no day to be an index in', () => {
    const all = [...trip().values()];
    expect(buildPinOrderIndex(all, { nameOf })).toEqual(new Map());
    // Day-scoped, the same fixture still numbers: the number is not gone, its scope is.
    expect(buildPinOrderIndex(all, { nameOf, onDate: DAY }).get('today-stop')).toBe(1);
  });

  // The consequence worth pinning rather than rediscovering: with no numbers the
  // `ORDER_SPREAD` nudge goes inert, so two upcoming pins tie and the tier z-order
  // carries the whole ranking — which is all it was ever bounded to do.
  it('all-days: the z-order nudge goes inert, and the tiers still rank', () => {
    const index = buildPinOrderIndex([...trip().values()], { nameOf });
    const z = (placeId: string) =>
      pinZIndex({ tier: PIN_TIER.upcoming, order: index.get(placeId) });
    expect(z('today-stop')).toBe(z('tomorrow-stop'));
    expect(z('today-stop')).toBeGreaterThan(pinZIndex({ tier: PIN_TIER.behind }));
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

  it('ranks ahead > ideas > ambient > shelf maybes > behind > ghosts', () => {
    const z = (tier: (typeof PIN_TIER)[keyof typeof PIN_TIER]) => pinZIndex({ tier });
    expect(z(PIN_TIER.upcoming)).toBeGreaterThan(z(PIN_TIER.idea));
    // A maybe you pencilled onto THIS day outranks one you pencilled nowhere — the whole
    // point of the split (ADR-0130 §3): tens of shelf maybes, a handful of today's.
    expect(z(PIN_TIER.idea)).toBeGreaterThan(z(PIN_TIER.shelf));
    // Below ambient, because a night you are sleeping somewhere is a commitment and an
    // idea is not; above behind, because considering outranks having passed.
    expect(z(PIN_TIER.ambient)).toBeGreaterThan(z(PIN_TIER.shelf));
    expect(z(PIN_TIER.shelf)).toBeGreaterThan(z(PIN_TIER.behind));
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

  // An aside pin is what the filter left out: present because it is physically there,
  // subordinate by construction. Letting it pull the frame sends the camera to a
  // place this day does not contain — which is the whole reported bug. Both tiers on that
  // rung, so splitting `ghost` in two (ADR-0130 §3) cannot quietly re-open it: a shelf
  // idea on the far side of the city would reframe a day it was never part of.
  it('never frames an aside pin, whether it is another day’s or on no day', () => {
    expect(isFramedByCamera({ tier: PIN_TIER.ghost })).toBe(false);
    expect(isFramedByCamera({ tier: PIN_TIER.shelf })).toBe(false);
    expect(isAsidePin(PIN_TIER.ghost)).toBe(true);
    expect(isAsidePin(PIN_TIER.shelf)).toBe(true);
    expect(isAsidePin(PIN_TIER.behind)).toBe(false);
  });

  // ADR-0131 §4: a live query withdraws the RATIO, and the camera reads the ratio rather
  // than the tier — which is what makes the `frame` control frame the matches with no
  // change to the control. The two are equal in every other state, so reading the tier
  // here instead would have been the silent version of this bug.
  it('frames an aside pin whose ratio a query withdrew, and the tier is untouched', () => {
    expect(isFramedByCamera({ tier: PIN_TIER.ghost, aside: false })).toBe(true);
    expect(isFramedByCamera({ tier: PIN_TIER.shelf, aside: false })).toBe(true);
    // The TIER still says what it said — the paint is not what moved.
    expect(isAsidePin(PIN_TIER.ghost)).toBe(true);
    expect(isAsidePin(PIN_TIER.shelf)).toBe(true);
  });

  it('an explicit flag wins over the tier in both directions', () => {
    // Absent means "derive from the tier", which is the shipped behaviour and what keeps
    // the flag a withdrawal rather than a field every caller must remember.
    expect(isFramedByCamera({ tier: PIN_TIER.ghost })).toBe(false);
    expect(isFramedByCamera({ tier: PIN_TIER.upcoming, aside: true })).toBe(false);
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

// The reported defect: on a full-height pane the pins were "much smaller than they
// could've been given the size of the pane" — a 34px teardrop is ~6% of a 545px canvas.
// The rule is one clamp on one parameter (ADR-0123), and these are the two regimes plus
// the coupling that keeps the CSS and the camera reading the same numbers.
//
// Two baselines, and keeping BOTH is the point (session 143): `AT_MAP_STOP` is the
// 390×844 figure from ADR-0122's budget, and `ON_DEVICE` is the owner's real phone,
// measured off the reported screenshots. Calibrating against the first one alone is
// exactly how the first pass undershot — it promised +28% and delivered +18%, because no
// device actually has a 545px canvas at that stop.
const AT_MAP_STOP = 545;
const ON_DEVICE = 501;
const AT_HALF = 260;
/** The band where the share, rather than the floor or the cap, sets the size. */
const GROWTH_FROM = MAP_PIN.MIN_H / MAP_PIN.CANVAS_SHARE;
const GROWTH_TO = MAP_PIN.MAX_H / MAP_PIN.CANVAS_SHARE;

describe('pinHeightFor — the canvas sizes the pin (ADR-0123)', () => {
  it('grows the pin on a canvas that has room for it', () => {
    const inBand = (GROWTH_FROM + GROWTH_TO) / 2;
    expect(pinHeightFor(inBand)).toBeGreaterThan(MAP_PIN.MIN_H);
    expect(pinHeightFor(inBand)).toBeLessThan(MAP_PIN.MAX_H);
    expect(pinHeightFor(inBand)).toBeCloseTo(inBand * MAP_PIN.CANVAS_SHARE, 5);
  });

  // The recalibration, pinned to the device it was made on: the owner's canvas has to
  // land somewhere the pin is comfortably bigger than the floor. Asserted as a ratio
  // rather than a literal, so re-tuning the constants cannot quietly undo the finding
  // that made them move.
  it('is well clear of the floor on the device it was calibrated on', () => {
    expect(pinHeightFor(ON_DEVICE) / MAP_PIN.MIN_H).toBeGreaterThan(1.5);
  });

  // With the session-143 numbers the band ends at 509px, so a phone at the map extreme is
  // at the cap and `MAX_H` is what sets the size there — the consequence `constants.ts`
  // states, asserted so it is a decision rather than a surprise.
  it('has a phone’s map extreme at or near the cap, share only protecting half', () => {
    expect(pinHeightFor(AT_MAP_STOP)).toBe(MAP_PIN.MAX_H);
    expect(GROWTH_FROM).toBeGreaterThan(AT_HALF);
  });

  // The other half of the report — "when the map is sharing the screen with the list
  // perhaps it's a different story". It is: the shipped size is the floor, so the half
  // stop is byte-for-byte what was reviewed and nothing about it changes.
  it('leaves the shared-screen canvas at the shipped size', () => {
    expect(pinHeightFor(AT_HALF)).toBe(MAP_PIN.MIN_H);
  });

  it('caps, so a very tall canvas gets a marker and not a billboard', () => {
    expect(pinHeightFor(4000)).toBe(MAP_PIN.MAX_H);
  });

  // A pane measured before layout settles is 0×0 (the case that opened the map on the
  // whole world, ADR-0121's session-134 log). It must resolve to the floor, never to 0.
  it('floors a degenerate or unsized canvas rather than vanishing', () => {
    expect(pinHeightFor(0)).toBe(MAP_PIN.MIN_H);
    expect(pinHeightFor(-100)).toBe(MAP_PIN.MIN_H);
  });

  it('never leaves the two bounds, at any canvas size', () => {
    for (const height of [0, 120, 260, 425, 545, 900, 2000]) {
      expect(pinHeightFor(height)).toBeGreaterThanOrEqual(MAP_PIN.MIN_H);
      expect(pinHeightFor(height)).toBeLessThanOrEqual(MAP_PIN.MAX_H);
    }
  });

  it('is monotonic — a bigger canvas never gets a smaller pin', () => {
    const heights = [0, 120, 260, 425, 545, 900].map(pinHeightFor);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
  });
});

// The CSS and the TS are two evaluations of ONE rule, and this is what makes "they
// cannot drift apart" true rather than aspirational — the same thing `map-camera.test`
// asserts for `--map-controls-h`. A rendered canvas is not testable (ADR-0121 §13); the
// arithmetic behind it is, and the string is where the two meet.
describe('pinSizeCss — the same rule, for the browser to resolve', () => {
  it('clamps between the same two bounds the TS side uses', () => {
    expect(pinSizeCss()).toBe(
      `clamp(${MAP_PIN.MIN_H}px, ${MAP_PIN.CANVAS_SHARE} * 100cqh, ${MAP_PIN.MAX_H}px)`,
    );
  });

  // `cqh` is the whole point: it resolves against the PANE, which is the canvas the
  // snapped stop leaves — not the viewport, and not a number React had to measure.
  it('reads the container’s height, not the viewport’s', () => {
    expect(pinSizeCss()).toContain('cqh');
    expect(pinSizeCss()).not.toContain('vh');
  });

  // A share written as a fraction times 100cqh, rather than a pre-multiplied percentage,
  // because `0.08 * 100` is `8.000000000000002` in binary floating point — the same trap
  // `stopHeightCss` rounds around.
  it('carries the share without floating-point noise', () => {
    expect(pinSizeCss()).not.toMatch(/\d\.\d{6}/);
  });
});

describe('pinClearanceFor — what the camera has to keep clear', () => {
  it('is the pin plus the tag that rises above it, rounded up to whole pixels', () => {
    const expected = Math.ceil(pinHeightFor(AT_MAP_STOP) * (1 + MAP_PIN.TAG_RISE));
    expect(pinClearanceFor(AT_MAP_STOP)).toBe(expected);
    expect(Number.isInteger(pinClearanceFor(AT_MAP_STOP))).toBe(true);
  });

  // The tip is the anchor, so everything the pin draws is above the coordinate: a
  // clearance that only covered the pin's body would cut the amber tag off at the top of
  // a fitted view, which is the failure ADR-0121 §7's inset exists to prevent.
  it('always exceeds the pin’s own height', () => {
    for (const canvas of [0, 260, 545, 2000]) {
      expect(pinClearanceFor(canvas)).toBeGreaterThan(pinHeightFor(canvas));
    }
  });

  it('tracks the pin, so it is smaller where the pin is at its floor', () => {
    expect(pinClearanceFor(AT_HALF)).toBeLessThan(pinClearanceFor(AT_MAP_STOP));
  });
});
