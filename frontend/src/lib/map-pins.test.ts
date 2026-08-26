import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_CATEGORY,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  iconForCategory,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { buildPlaceUsageIndex, type PlaceUsage } from './place-usage';
import {
  buildDayStopSequence,
  buildPinOrderIndex,
  hasScheduleSlot,
  isAsidePin,
  isFramedByCamera,
  MAP_RESULT_SELECTED_Z,
  MAP_RESULT_Z,
  PIN_TIER,
  placeGlyph,
  pinClearanceFor,
  pinHeightFor,
  pinSizeCss,
  placePinTier,
  placePoint,
  pinOutcome,
  pinTransition,
  pinZIndex,
  type DayStop,
} from './map-pins';
import { DEFAULT_EVENT_ICON, DEFAULT_MAYBE_ICON, DEFAULT_PLACE_ICON, MAP_PIN } from '../constants';
import { t } from '../i18n/he';

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

describe('pinTransition — which transition is next there (ADR-0141)', () => {
  const ctx = { onDate: DAY, nowMs: NOON };
  // The events the words come from, built as the app builds them: the word is resolved off
  // `category` + `icon` (ADR-0063's profile + its per-glyph override), never off a booking
  // type, so a manual `lodging` event with no Booking has ends exactly as a hotel does.
  const stay = event({
    id: 'stay',
    placeId: 'hotel',
    category: 'lodging',
    icon: '🏨',
    date: PREV_DAY,
    endDate: NEXT_DAY,
    startsAt: `${PREV_DAY}T15:00:00Z`,
    endsAt: `${NEXT_DAY}T10:00:00Z`,
  });
  const lookup = (events: TripEvent[]) => (id: string) => events.find((e) => e.id === id);

  it('names the END the day sits at, which is what carries pre-vs-during', () => {
    const index = usages({ places: [place('hotel')], events: [stay] });
    const of = lookup([stay]);
    // The same place, two days, two different words — and no prefix anywhere: `צ׳ק-אין` IS
    // "you have not checked in", `צ׳ק-אאוט` IS "you are in and the exit is what's ahead".
    expect(pinTransition(index.get('hotel')!, { onDate: PREV_DAY, nowMs: NOON }, of)).toBe(
      'צ׳ק-אין',
    );
    expect(pinTransition(index.get('hotel')!, { onDate: NEXT_DAY, nowMs: NOON }, of)).toBe(
      'צ׳ק-אאוט',
    );
  });

  it('takes the per-MODE wording, so a flight and a train read differently', () => {
    const flight = event({
      id: 'fly',
      placeId: 'airport',
      category: 'transport',
      icon: '✈️',
      startsAt: `${DAY}T20:00:00Z`,
    });
    const train = event({
      id: 'rail',
      placeId: 'station',
      category: 'transport',
      icon: '🚄',
      startsAt: `${DAY}T21:00:00Z`,
    });
    const index = usages({ places: [place('airport'), place('station')], events: [flight, train] });
    const of = lookup([flight, train]);
    expect(pinTransition(index.get('airport')!, ctx, of)).toBe('המראה');
    expect(pinTransition(index.get('station')!, ctx, of)).toBe('יציאה');
  });

  // **A connection stop is what the place IS that day** (ADR-0159). The edge word is
  // still true — you do land at the stop — and it is the wrong thing to spend the pin's
  // one word on when you leave again two hours later.
  it('lets a connection stop override the edge word, per place AND day', () => {
    const landing = event({
      id: 'leg1',
      placeId: 'airport',
      category: 'transport',
      icon: '✈️',
      startsAt: `${DAY}T18:00:00Z`,
      endsAt: `${DAY}T20:00:00Z`,
    });
    const index = usages({ places: [place('airport')], events: [landing] });
    const of = lookup([landing]);
    expect(pinTransition(index.get('airport')!, ctx, of)).toBe('המראה');
    const stopAt = (placeId: string, date: string) =>
      placeId === 'airport' && date === DAY ? 'עצירת ביניים' : undefined;
    expect(pinTransition(index.get('airport')!, ctx, of, stopAt)).toBe('עצירת ביניים');
    // A resolver that does not know this place/day changes nothing, which is what keeps
    // every surface that resolves no journeys behaving exactly as before.
    const elsewhere = () => undefined;
    expect(pinTransition(index.get('airport')!, ctx, of, elsewhere)).toBe('המראה');
  });

  it('says nothing for a category with no two ends — a reservation is one moment', () => {
    // ADR-0063 makes `bracketed` 2 of 9 categories, which is also what rations the tag:
    // a restaurant's phase is "coming up", and the amber `היעד הבא` already says that.
    const dinner = event({
      id: 'dinner',
      placeId: 'ramen',
      category: 'food',
      icon: '🍜',
      kind: EVENT_KIND.HARD,
      startsAt: `${DAY}T20:00:00Z`,
    });
    const index = usages({ places: [place('ramen')], events: [dinner] });
    expect(pinTransition(index.get('ramen')!, ctx, lookup([dinner]))).toBeUndefined();
  });

  it('a strictly-middle stay night says לינת לילה day-scoped, and its next EDGE all-days', () => {
    const index = usages({ places: [place('hotel')], events: [stay] });
    const of = lookup([stay]);
    // AMENDED (ADR-0054, 2026-08-26): day-scoped, DAY is the middle night, so `DayUsage.edge`
    // is undefined and there is no transition to name — which used to mean silence, "exactly
    // as the row is". The row can afford it; the CANVAS cannot, because this is the one pin
    // sitting at BOTH ends of the day's route and nothing else on it says so. It names what
    // it is rather than an end it does not have.
    expect(pinTransition(index.get('hotel')!, ctx, of)).toBe(t.map.stayNight);
    // All-days it reads `placeMetaDay`, which walks a mid-span night to the stay's next
    // edge — the one case that function differs from `placeDay`, and the reason this reads
    // it rather than `pinOutcome`'s: a silent pin under a row saying `צ׳ק-אאוט` is the
    // defect ADR-0141 removes.
    expect(pinTransition(index.get('hotel')!, { nowMs: NOON, today: DAY }, of)).toBe('צ׳ק-אאוט');
  });

  it('a passed stop says nothing — the transition happened, so naming it would be a lie', () => {
    const flown = event({
      id: 'flown',
      placeId: 'airport',
      category: 'transport',
      icon: '✈️',
      startsAt: `${DAY}T09:00:00Z`,
      endsAt: `${DAY}T10:00:00Z`,
    });
    const index = usages({ places: [place('airport')], events: [flown] });
    const of = lookup([flown]);
    expect(placePinTier(index.get('airport')!, ctx)).toBe(PIN_TIER.behind);
    expect(pinTransition(index.get('airport')!, ctx, of)).toBeUndefined();
    // …and in PLAN mode the same pin speaks again, because `planning` withdraws `behind`
    // (ADR-0130 §2): a day you are arranging has no past, and which end is which is
    // exactly what you want while arranging it.
    expect(pinTransition(index.get('airport')!, { ...ctx, planning: true }, of)).toBe('המראה');
  });

  it('says nothing when no event owns the day — an idea pencilled in is not an edge', () => {
    const index = usages({
      places: [place('shrine')],
      maybeItems: [maybe({ id: 'm', placeId: 'shrine', targetDate: DAY })],
    });
    expect(pinTransition(index.get('shrine')!, ctx, () => undefined)).toBeUndefined();
  });

  // ── A STAY IS THE ONE THING THAT KEEPS ITS WORD (ADR-0054's 2026-08-26 amendment) ──
  describe('the day says which end of it the hotel was', () => {
    it('a check-out you have already done still reads צ׳ק-אאוט', () => {
      // Owner: _"you can't see from the map where you check in or out from"_. The map stated
      // the check-IN it was heading for and went silent on the check-OUT it had done, which
      // is half a route — and the half you need to read the line's start.
      const of = lookup([stay]);
      const index = usages({ places: [place('hotel')], events: [stay] });
      // Noon on the check-out day: the 10:00 ceiling is behind you, so the tier is `behind`.
      const afterwards = { onDate: NEXT_DAY, nowMs: Date.parse(`${NEXT_DAY}T12:00:00Z`) };
      expect(placePinTier(index.get('hotel')!, afterwards)).toBe(PIN_TIER.behind);
      expect(pinTransition(index.get('hotel')!, afterwards, of)).toBe('צ׳ק-אאוט');
    });

    it('a strictly middle night says לינת לילה, having no edge to name', () => {
      const of = lookup([stay]);
      const index = usages({ places: [place('hotel')], events: [stay] });
      expect(pinTransition(index.get('hotel')!, ctx, of)).toBe(t.map.stayNight);
    });

    it('leaves every OTHER behind pin silent — the exemption is the stay, not the tier', () => {
      // A departed flight naming itself as ahead is the lie ADR-0141's silence was written
      // for, and it is untouched: a stay's word is which END of the day this was, which the
      // afternoon does not falsify.
      const flight = event({
        id: 'f',
        placeId: 'kef',
        category: 'transport',
        icon: '✈️',
        startsAt: `${DAY}T07:40:00Z`,
      });
      const index = usages({ places: [place('kef')], events: [flight] });
      expect(placePinTier(index.get('kef')!, ctx)).toBe(PIN_TIER.behind);
      expect(pinTransition(index.get('kef')!, ctx, lookup([flight]))).toBeUndefined();
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

  // THE REPORT'S OWN POPULATION (owner, session 187): "a ghost could be unmarked, skipped,
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

// ── A NUMBER IS ONLY EVER THE INDEX OF A MOMENT THE APP KNOWS (ADR-0171 §10b) ────────
describe('what a pin number is allowed to claim', () => {
  const at2 = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  /** The owner's Iceland case: check out of Reykjavik by 11:00, fly, land in Tel Aviv.
   *  Numbering the check-out from its CEILING reads Keflavik → Ben Gurion → the hotel,
   *  i.e. back in Iceland after landing. */
  const iceland = () =>
    usages({
      places: [place('hotel'), place('kef'), place('tlv')],
      events: [
        event({
          id: 'stay',
          placeId: 'hotel',
          category: 'lodging',
          date: '2026-07-05',
          endDate: DAY,
          startsAt: `2026-07-05T15:00:00Z`,
          endsAt: at2('11:00'),
        }),
        event({
          id: 'dep',
          placeId: 'kef',
          category: 'transport',
          icon: '✈️',
          startsAt: at2('07:40'),
        }),
        event({
          id: 'arr',
          placeId: 'tlv',
          category: 'transport',
          icon: '✈️',
          startsAt: at2('15:20'),
        }),
      ],
    });
  const eventsById = (all: TripEvent[]) => (id: string) => all.find((e) => e.id === id);

  it('numbers a ceiling today, which is the defect', () => {
    // The check-out sorts at its 11:00 ceiling, so the day's stops read Keflavik →
    // the Reykjavik hotel → Ben Gurion: you are at the hotel AFTER taking off from
    // the airport. Same nonsense as the owner's "back in Iceland after landing in Tel
    // Aviv", one row milder, and from the same cause.
    const index = buildPinOrderIndex([...iceland().values()], { nameOf, onDate: DAY });
    expect(index.get('kef')).toBe(1);
    expect(index.get('hotel')).toBe(2);
    expect(index.get('tlv')).toBe(3);
  });

  it('gives a ceiling no number once it can ask what the time means', () => {
    const all = [...iceland().values()];
    const events = all.flatMap((u) => u.days.map((d) => d.eventId)).filter(Boolean);
    expect(events.length).toBeGreaterThan(0);
    const index = buildPinOrderIndex(all, {
      nameOf,
      onDate: DAY,
      eventById: eventsById([
        event({
          id: 'stay',
          category: 'lodging',
          date: '2026-07-05',
          endDate: DAY,
          startsAt: `2026-07-05T15:00:00Z`,
          endsAt: at2('11:00'),
        }),
        event({ id: 'dep', category: 'transport', icon: '✈️', startsAt: at2('07:40') }),
        event({ id: 'arr', category: 'transport', icon: '✈️', startsAt: at2('15:20') }),
      ]),
    });
    expect(index.has('hotel')).toBe(false);
    // …and the known stops still count 1, 2 with no hole: nothing is hidden to hint at.
    expect(index.get('kef')).toBe(1);
    expect(index.get('tlv')).toBe(2);

    const stops = buildDayStopSequence(all, {
      nameOf,
      onDate: DAY,
      eventById: eventsById([
        event({
          id: 'stay',
          category: 'lodging',
          date: '2026-07-05',
          endDate: DAY,
          startsAt: `2026-07-05T15:00:00Z`,
          endsAt: at2('11:00'),
        }),
        event({ id: 'dep', category: 'transport', icon: '✈️', startsAt: at2('07:40') }),
        event({ id: 'arr', category: 'transport', icon: '✈️', startsAt: at2('15:20') }),
      ]),
    });
    // **AND IT LEADS THE DAY** (ADR-0054's 2026-08-25 amendment, reversing ADR-0182 §3's
    // 2026-08-11 sink *for this sequence only*). Losing the number was never leaving the day,
    // and the sink was the second answer this case has had: at its 11:00 ceiling it sat
    // between the two flights, which claimed a position the app does not have, and at the
    // tail it sat after the landing in Tel Aviv, which claims one that is simply false. It is
    // a check-OUT, so the one thing certain about it is that the day began there — and this
    // sequence is now the map's route, where a position is geography rather than schedule.
    // The `order` column is untouched: a bookend holds a place and still earns no mark.
    expect(stops.map((s) => s.usage.placeId)).toEqual(['hotel', 'kef', 'tlv']);
    expect(stops.map((s) => s.order)).toEqual([undefined, 1, 2]);
  });

  it('gives an UNTIMED place no number either — the same claim, unreported', () => {
    // `place-usage.ts` gives a clockless event `prominence: 'edge'` with `at: undefined`,
    // so `hasScheduleSlot` passes and this numbered it after the timed stops.
    const all = [
      ...usages({
        places: [place('museum'), place('errand')],
        events: [
          event({ id: 'm', placeId: 'museum', startsAt: at2('10:00') }),
          event({ id: 'x', placeId: 'errand' }),
        ],
      }).values(),
    ];
    const index = buildPinOrderIndex(all, {
      nameOf,
      onDate: DAY,
      eventById: eventsById([event({ id: 'm', startsAt: at2('10:00') }), event({ id: 'x' })]),
    });
    expect(index.get('museum')).toBe(1);
    expect(index.has('errand')).toBe(false);
  });
});

// ── A DAY STARTS AND ENDS WHERE YOU SLEEP (ADR-0054's 2026-08-25 amendment) ────────────
describe('the stay bookends the day, and wears no number for it', () => {
  const at2 = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  const eventsById = (all: TripEvent[]) => (id: string) => all.find((e) => e.id === id);
  /** A stay covering `from`→`to`, plus a museum at 11:00 and dinner at 20:00. */
  const day = (from: string, to: string) => {
    const events = [
      event({
        id: 'stay',
        placeId: 'hotel',
        category: EVENT_CATEGORY.LODGING,
        date: from,
        endDate: to,
        startsAt: `${from}T15:00:00Z`,
        endsAt: `${to}T11:00:00Z`,
      }),
      event({ id: 'm', placeId: 'museum', startsAt: at2('11:00') }),
      event({ id: 'd', placeId: 'dinner', startsAt: at2('20:00') }),
    ];
    const all = [
      ...usages({ places: [place('hotel'), place('museum'), place('dinner')], events }).values(),
    ];
    return buildDayStopSequence(all, { nameOf, onDate: DAY, eventById: eventsById(events) });
  };

  it('a strictly middle night is BOTH ends of the day', () => {
    // The night that was invisible here: `prominence: 'ambient'`, no edge, no clock at all,
    // so no amount of re-sorting could have found it — it never entered the sequence.
    const stops = day('2026-07-18', '2026-07-22');
    expect(stops.map((s) => s.usage.placeId)).toEqual(['hotel', 'museum', 'dinner', 'hotel']);
    // Twice in the sequence, twice unnumbered, and the numbered stops still count 1, 2 with
    // no hole — the whole point of "sequence + route, no number".
    expect(stops.map((s) => s.order)).toEqual([undefined, 1, 2, undefined]);
  });

  it('a check-IN day ends there and does not begin there', () => {
    // "From 15:00" is a floor, so it used to sort between the museum and dinner on an hour
    // it cannot defend. You end the day at the hotel; you did not start there.
    const stops = day(DAY, '2026-07-22');
    expect(stops.map((s) => s.usage.placeId)).toEqual(['museum', 'dinner', 'hotel']);
    expect(stops.map((s) => s.order)).toEqual([1, 2, undefined]);
  });

  it('a check-OUT day begins there and does not end there', () => {
    const stops = day('2026-07-18', DAY);
    expect(stops.map((s) => s.usage.placeId)).toEqual(['hotel', 'museum', 'dinner']);
    expect(stops.map((s) => s.order)).toEqual([undefined, 1, 2]);
  });

  it('a car hire is NOT a bookend — you hold it, you do not sleep in it', () => {
    // The owner's second class: a soft-timed booking "from X / until Y". It belongs in the
    // sequence at its own instant, which is what the sort change buys it — and nowhere near
    // the day's ends, which is what `countsNights` refuses it (ADR-0163 §4).
    const events = [
      event({
        id: 'car',
        placeId: 'depot',
        category: EVENT_CATEGORY.TRANSPORT,
        icon: '🚗',
        startsAt: at2('09:00'),
        endsAt: at2('18:00'),
      }),
      event({ id: 'm', placeId: 'museum', startsAt: at2('11:00') }),
      event({ id: 'd', placeId: 'dinner', startsAt: at2('20:00') }),
    ];
    const all = [
      ...usages({ places: [place('depot'), place('museum'), place('dinner')], events }).values(),
    ];
    const stops = buildDayStopSequence(all, { nameOf, onDate: DAY, eventById: eventsById(events) });
    expect(stops.map((s) => s.usage.placeId)).toEqual(['depot', 'museum', 'dinner']);
    expect(stops.map((s) => s.order)).toEqual([undefined, 1, 2]);
  });

  // ── WHAT BROUGHT YOU IN THROUGH THE NIGHT SORTS BEFORE THE BED ─────────────────────
  // Owner, 2026-08-26: _"we only land at 23:20 and pick up the car at 00:00 so realistically
  // we only check in at like 2:00, but check in starts at like 15:00 … the route shows it
  // before the car pick up"_.
  //
  // **THE FIXTURES BELOW ARE THE POINT.** The first pass at this shipped green with
  // `startsAt: at2('02:00')` — a check-in instant on the day itself — which is not the shape
  // the report is about. The real booking carries a FLOOR on the previous afternoon, so the
  // rule (compare each stop against `startsAt`) moved nothing, and the spec that asserted
  // that outcome asserted the bug. A fixture built from the rule proves the rule.
  describe('a stay you reached during the night does not claim the whole day', () => {
    /** The day's morning, resolved by the screen in the day's own zone. */
    const dawnMs = Date.parse(at2('07:00'));
    const car = event({
      id: 'car',
      placeId: 'depot',
      category: EVENT_CATEGORY.TRANSPORT,
      icon: '🚗',
      startsAt: at2('00:00'),
      endsAt: '2026-07-24T18:00:00Z',
      endDate: '2026-07-24',
    });
    const museum = event({ id: 'm', placeId: 'museum', startsAt: at2('11:00') });
    /** The owner's booking: the night BEFORE (which is how a hotel counts a 02:00 arrival),
     *  and its `startsAt` is the room's ⁦15:00⁩ FLOOR on that previous afternoon — not an
     *  arrival, which is exactly what `knowsMoment` already refuses to call a moment. */
    const overnight = event({
      id: 'a',
      placeId: 'hotelA',
      category: EVENT_CATEGORY.LODGING,
      date: PREV_DAY,
      endDate: DAY,
      startsAt: `${PREV_DAY}T15:00:00Z`,
      endsAt: at2('10:00'),
    });
    const sequence = (events: TripEvent[], ids: string[], ctx?: { dawnMs?: number }) =>
      buildDayStopSequence([...usages({ places: ids.map((id) => place(id)), events }).values()], {
        nameOf,
        onDate: DAY,
        eventById: eventsById(events),
        dawnMs,
        ...ctx,
      }).map((s) => s.usage.placeId);

    it('puts the midnight pick-up that brought you there BEFORE the hotel', () => {
      // Pinned first unconditionally, this read `hotelA → depot → museum`: the route left
      // the airport, teleported to bed, and came back for the car.
      expect(sequence([car, overnight, museum], ['hotelA', 'museum', 'depot'])).toEqual([
        'depot',
        'hotelA',
        'museum',
      ]);
    });

    it('leaves the hotel first for an EXACT pre-dawn departure', () => {
      // The case a bare dawn cut-off gets wrong, and the reason the rule asks two questions.
      // A ⁦06:30⁩ flight is a moment the app KNOWS, so it is something you left the bed for —
      // where a car "available from ⁦00:00⁩" claims no hour at all and is the shape of a night
      // arrival. Same day, same dawn, opposite answers.
      const flight = event({
        id: 'f',
        placeId: 'kef',
        category: EVENT_CATEGORY.TRANSPORT,
        icon: '✈️',
        startsAt: at2('06:30'),
      });
      expect(sequence([flight, overnight], ['hotelA', 'kef'])).toEqual(['hotelA', 'kef']);
    });

    it('leaves an AFTER-dawn floor where it falls', () => {
      // Dawn is the other half of the gate: a car collected at ⁦09:00⁩ is a floor too, and you
      // were plainly already up for it.
      const late = { ...car, startsAt: at2('09:00') };
      expect(sequence([late, overnight, museum], ['hotelA', 'museum', 'depot'])).toEqual([
        'hotelA',
        'depot',
        'museum',
      ]);
    });

    it('still ends the day at the DIFFERENT hotel you move to', () => {
      // The change-over day, with the compressed stay at its head. Each span answers only
      // about itself, so no rule of its own is needed for this.
      const next = event({
        id: 'b',
        placeId: 'hotelB',
        category: EVENT_CATEGORY.LODGING,
        date: DAY,
        endDate: '2026-07-24',
        startsAt: at2('20:00'),
        endsAt: '2026-07-24T10:00:00Z',
      });
      expect(
        sequence([car, overnight, museum, next], ['hotelA', 'hotelB', 'museum', 'depot']),
      ).toEqual(['depot', 'hotelA', 'museum', 'hotelB']);
    });

    it('moves nothing on a surface that resolves no dawn', () => {
      // `dawnMs` needs a zone, so a surface without one behaves exactly as it did — the same
      // inertness `eventById` and `isConnectionStop` already have here.
      expect(
        sequence([car, overnight, museum], ['hotelA', 'museum', 'depot'], { dawnMs: undefined }),
      ).toEqual(['hotelA', 'depot', 'museum']);
    });
  });

  it('answers nothing on a surface that cannot resolve events', () => {
    // `eventById` absent means no stay is ever found, so a middle night stays backdrop and
    // the sequence is exactly what it was — the same inertness `knowsMoment` has there.
    const events = [
      event({
        id: 'stay',
        placeId: 'hotel',
        category: EVENT_CATEGORY.LODGING,
        date: '2026-07-18',
        endDate: '2026-07-22',
        startsAt: `2026-07-18T15:00:00Z`,
        endsAt: `2026-07-22T11:00:00Z`,
      }),
      event({ id: 'm', placeId: 'museum', startsAt: at2('11:00') }),
    ];
    const all = [...usages({ places: [place('hotel'), place('museum')], events }).values()];
    const stops = buildDayStopSequence(all, { nameOf, onDate: DAY });
    expect(stops.map((s) => s.usage.placeId)).toEqual(['museum']);
  });
});

// ── ONE CONNECTION IS ONE STOP (ADR-0171 §7) ──────────────────────────────────────────
describe('a layover collapses; a genuine revisit does not', () => {
  const at2 = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  /** Ben Gurion → Vienna → Keflavik. Vienna contributes an arrival AND a departure. */
  const layover = () =>
    usages({
      places: [place('tlv'), place('vie'), place('kef')],
      events: [
        event({
          id: 'l1',
          placeId: 'tlv',
          category: 'transport',
          icon: '✈️',
          startsAt: at2('06:00'),
        }),
        event({
          id: 'l1b',
          placeId: 'vie',
          category: 'transport',
          icon: '✈️',
          startsAt: at2('09:30'),
        }),
        event({
          id: 'l2',
          placeId: 'vie',
          category: 'transport',
          icon: '✈️',
          startsAt: at2('11:30'),
        }),
        event({
          id: 'l3',
          placeId: 'kef',
          category: 'transport',
          icon: '✈️',
          startsAt: at2('14:00'),
        }),
      ],
    });

  it('leaves the reported gap when nothing says the two moments are one wait', () => {
    const index = buildPinOrderIndex([...layover().values()], { nameOf, onDate: DAY });
    expect(index.get('tlv')).toBe(1);
    expect(index.get('vie')).toBe(2);
    expect(index.get('kef')).toBe(4); // the missing 3 is Vienna, counted twice
  });

  it('collapses the pair when the journey derivation says it is a connection', () => {
    const index = buildPinOrderIndex([...layover().values()], {
      nameOf,
      onDate: DAY,
      isConnectionStop: (placeId) => placeId === 'vie',
    });
    expect(index.get('tlv')).toBe(1);
    expect(index.get('vie')).toBe(2);
    expect(index.get('kef')).toBe(3);
  });

  it('does NOT collapse a place reached twice with something in between', () => {
    // The morning landing and the evening car return at one airport: adjacency in the
    // stop list is not evidence of one visit, and here there is none anyway.
    const revisit = usages({
      places: [place('airport'), place('town')],
      events: [
        event({ id: 'land', placeId: 'airport', startsAt: at2('02:00') }),
        event({ id: 'mid', placeId: 'town', startsAt: at2('09:00') }),
        event({ id: 'car', placeId: 'airport', startsAt: at2('18:00') }),
      ],
    });
    const index = buildPinOrderIndex([...revisit.values()], {
      nameOf,
      onDate: DAY,
      isConnectionStop: () => true, // even if it claimed so, they are not adjacent
      nowMs: Date.parse(at2('23:00')),
    });
    expect(index.get('airport')).toBe(3);
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

  // ── A PLACE YOU GO TO TWICE IS TWO STOPS (2026-08-06) ──────────────────────────────
  // This numbered PLACES by their earliest moment, which agreed with the row only while the
  // row named the earliest moment too. Once the row started naming the RELEVANT reference the
  // two came apart, and the screen contradicted itself: `1 · 18:00` sitting above `2 · 09:00`.
  // Owner: _"the numbering is weird"_.
  describe('a place visited twice shows the number of the stop it is naming', () => {
    /** The reported day: land 02:00, a stop at 09:00, back at the airport at 18:00. */
    const twice = () =>
      usages({
        places: [place('airport'), place('talbaz')],
        events: [
          event({ id: 'land', placeId: 'airport', startsAt: at2('02:00') }),
          event({ id: 'mid', placeId: 'talbaz', startsAt: at2('09:00') }),
          event({ id: 'car', placeId: 'airport', startsAt: at2('18:00') }),
        ],
      });
    const numbersAt = (nowMs?: number) =>
      buildPinOrderIndex([...twice().values()], { nameOf, onDate: DAY, nowMs });

    // THE REPORTED CASE. The airport takes its 18:00 stop's number, so the badges finally read
    // in the same order as the times beside them. `1` is the landing's, and its absence is a
    // gap of exactly the kind this function's filter gaps already are.
    it('takes the number of the stop still ahead, not the one it already did', () => {
      const n = numbersAt(at(DAY, '15:11'));
      expect(n.get('talbaz')).toBe(2);
      expect(n.get('airport')).toBe(3);
    });

    // Once everything has passed it names the last stop it made, which is what the row says.
    it('keeps the last stop once the day is done', () => {
      const n = numbersAt(at(DAY, '23:00'));
      expect(n.get('airport')).toBe(3);
      expect(n.get('talbaz')).toBe(2);
    });

    // **THE SEQUENCE IS CLOCK-FREE**, which is what keeps §6's promise for every place that is
    // visited once: `talbaz` holds `2` at every hour of the day, so no tick can move a pin
    // whose own stops have not changed.
    it('never moves a once-visited place, at any hour', () => {
      const hours = ['00:00', '08:00', '15:11', '18:30', '23:59'];
      expect(hours.map((h) => numbersAt(at(DAY, h)).get('talbaz'))).toEqual(hours.map(() => 2));
    });

    // With no clock it is the first stop — the pure answer, and what the surfaces that hold no
    // `now` still get.
    it('falls back to the first stop with no clock', () => {
      expect(numbersAt().get('airport')).toBe(1);
    });
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

describe('MapLibre marker ordering', () => {
  it('keeps resting search results above canvas paint but below every trip pin', () => {
    expect(MAP_RESULT_Z).toBeGreaterThanOrEqual(0);
    expect(MAP_RESULT_Z).toBeLessThan(pinZIndex({ tier: PIN_TIER.ghost }));
    expect(MAP_RESULT_SELECTED_Z).toBeGreaterThan(
      pinZIndex({ tier: PIN_TIER.upcoming, nextStop: true }),
    );
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

// ── THE GLYPH CHAIN'S BOTTOM TWO RUNGS (ADR-0147) ────────────────────────────────
// `placeGlyph` exists because three surfaces read it — the pin, the list row and the canvas
// card — and a `??` chain copied three times is three chances to disagree about what one place
// looks like. So what is pinned here is the RULE, exhaustively over the enum and over the
// glyph set, rather than three example values.
describe('placeGlyph — a chosen glyph, else the category’s, else the place default', () => {
  const CATEGORIES = Object.values(EVENT_CATEGORY);

  // The property, and the only one that matters at this rung: a stored PICK always wins, for
  // every category it could be competing with. A value test on one pair would pass with the
  // operands swapped.
  it('a chosen glyph beats every category’s default', () => {
    for (const glyph of ['🍜', '⛩️', '🚆', '☕', '🏨']) {
      expect(placeGlyph({ icon: glyph }, undefined)).toBe(glyph);
      for (const category of CATEGORIES) {
        expect(placeGlyph({ icon: glyph }, category)).toBe(glyph);
      }
    }
  });

  // Exhaustive on purpose: a tenth category added to the enum without a default icon would
  // return `undefined` here, and a spot-check on three of the nine would not see it.
  it('falls to the category’s own default for every category, and never to nothing', () => {
    for (const category of CATEGORIES) {
      expect(placeGlyph({}, category)).toBe(iconForCategory(category));
      expect(placeGlyph({ icon: null }, category)).toBe(iconForCategory(category));
      expect(placeGlyph({}, category)).toBeTruthy();
    }
  });

  it('falls to the place default when nothing knows anything', () => {
    expect(placeGlyph({}, undefined)).toBe(DEFAULT_PLACE_ICON);
    expect(placeGlyph({ icon: undefined }, null)).toBe(DEFAULT_PLACE_ICON);
    expect(placeGlyph({ icon: '' }, null)).toBe(DEFAULT_PLACE_ICON);
  });

  // **A DEFAULT IS NOT A PICK.** This is the refinement `chosenIcon` was extracted for — a
  // stored `📌` shadowed ✈️ once — and reading `place.icon` raw instead of through it is how
  // the same bug arrives at the place rung.
  it('a stored PLACEHOLDER glyph does not shadow a category that says something', () => {
    for (const placeholder of [DEFAULT_EVENT_ICON, DEFAULT_MAYBE_ICON]) {
      expect(placeGlyph({ icon: placeholder }, EVENT_CATEGORY.FOOD)).toBe(
        iconForCategory(EVENT_CATEGORY.FOOD),
      );
    }
  });

  // The property the three call sites exist for, stated as one: whatever a place carries, the
  // row's badge and its pin resolve to the same string, because there is only one resolver.
  it('answers identically for the same place however many surfaces ask', () => {
    for (const icon of [undefined, '🍜', DEFAULT_MAYBE_ICON]) {
      for (const category of [...CATEGORIES, undefined, null]) {
        const first = placeGlyph({ icon }, category);
        expect(placeGlyph({ icon }, category)).toBe(first);
      }
    }
  });
});

describe('buildDayStopSequence — the day in order, which is what you step through (ADR-0182 §1)', () => {
  const at2 = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  const ids = (stops: DayStop[]) => stops.map((s) => s.usage.placeId);
  const orders = (stops: DayStop[]) => stops.map((s) => s.order);

  it('is the day in clock order, numbered 1..n over the moments it knows', () => {
    const all = [
      ...usages({
        places: [place('kef'), place('hotel'), place('market')],
        events: [
          event({ id: 'a', placeId: 'kef', startsAt: at2('06:20') }),
          event({ id: 'b', placeId: 'hotel', startsAt: at2('11:30') }),
          event({ id: 'c', placeId: 'market', startsAt: at2('12:40') }),
        ],
      }).values(),
    ];
    const stops = buildDayStopSequence(all, { nameOf, onDate: DAY });
    expect(ids(stops)).toEqual(['kef', 'hotel', 'market']);
    expect(orders(stops)).toEqual([1, 2, 3]);
  });

  it('ONE CONNECTION IS ONE STOP, and a later return to the same place is not', () => {
    // The landing that brings you in and the departure that takes you out are one wait,
    // not two visits (ADR-0171 §7) — but the airport you come back to at 18:00 to return a
    // car is a genuine revisit, and the stops in between are what prove it.
    const all = [
      ...usages({
        places: [place('tlv'), place('market')],
        events: [
          event({ id: 'land', placeId: 'tlv', startsAt: at2('06:20') }),
          event({ id: 'dep', placeId: 'tlv', startsAt: at2('08:05') }),
          event({ id: 'mkt', placeId: 'market', startsAt: at2('12:40') }),
          event({ id: 'car', placeId: 'tlv', startsAt: at2('18:00') }),
        ],
      }).values(),
    ];
    const stops = buildDayStopSequence(all, {
      nameOf,
      onDate: DAY,
      isConnectionStop: (placeId) => placeId === 'tlv',
    });
    // Three stops, not four: the two adjacent airport moments collapsed, the later one did not.
    expect(ids(stops)).toEqual(['tlv', 'market', 'tlv']);
    expect(orders(stops)).toEqual([1, 2, 3]);
  });

  it('adjacency alone does not collapse — without the connection gate both moments stand', () => {
    const all = [
      ...usages({
        places: [place('tlv')],
        events: [
          event({ id: 'land', placeId: 'tlv', startsAt: at2('06:20') }),
          event({ id: 'car', placeId: 'tlv', startsAt: at2('18:00') }),
        ],
      }).values(),
    ];
    expect(ids(buildDayStopSequence(all, { nameOf, onDate: DAY }))).toEqual(['tlv', 'tlv']);
  });

  it('a CHECK-IN carries a clock and still sinks: unnumbered is what decides, not untimed', () => {
    // The owner's own case (2026-08-11): _"a hotel check in/out … should be at the end"_.
    // It has a time, so the weaker "is it clocked" question sorted it at 15:00 between the
    // 14:00 and 16:00 stops while it wore no number. A floor is open on the side you act, so
    // 15:00 is any hour after — the order asks `knowsMoment` now, the same question the
    // number asks, and the two can no longer disagree about the same stop.
    const stay = event({
      id: 'stay',
      category: 'lodging' as TripEvent['category'],
      date: DAY,
      endDate: NEXT_DAY,
      startsAt: at2('15:00'),
      endsAt: `${NEXT_DAY}T11:00:00Z`,
    });
    const all = [
      ...usages({
        places: [place('hotel'), place('museum'), place('dinner')],
        events: [
          { ...stay, placeId: 'hotel' },
          event({ id: 'm', placeId: 'museum', startsAt: at2('14:00') }),
          event({ id: 'd', placeId: 'dinner', startsAt: at2('16:00') }),
        ],
      }).values(),
    ];
    const stops = buildDayStopSequence(all, {
      nameOf,
      onDate: DAY,
      eventById: (id) =>
        [
          stay,
          event({ id: 'm', startsAt: at2('14:00') }),
          event({ id: 'd', startsAt: at2('16:00') }),
        ].find((e) => e.id === id),
    });
    expect(ids(stops)).toEqual(['museum', 'dinner', 'hotel']);
    expect(orders(stops)).toEqual([1, 2, undefined]);
  });

  it('THE TAIL: a day idea with no schedule slot comes last, unnumbered, and marked', () => {
    const all = [
      ...usages({
        places: [place('museum'), place('cafe')],
        events: [event({ id: 'm', placeId: 'museum', startsAt: at2('10:00') })],
        maybeItems: [maybe({ id: 'idea', placeId: 'cafe', targetDate: DAY })],
      }).values(),
    ];
    const stops = buildDayStopSequence(all, { nameOf, onDate: DAY });
    expect(ids(stops)).toEqual(['museum', 'cafe']);
    expect(orders(stops)).toEqual([1, undefined]);
    expect(stops[1].tail).toBe(true);
    expect(stops[0].tail).toBeUndefined();
  });

  it('ambient is excluded — a middle night of a stay is backdrop, not a stop', () => {
    // A stay spanning the day either side makes DAY a strictly-middle night: no arrival,
    // no departure, nothing to step TO. (A `Booking` carries no dates of its own — ADR-0048
    // puts them on its events — so the span is an event's `date`/`endDate`.)
    const all = [
      ...usages({
        places: [place('hotel'), place('museum')],
        events: [
          event({
            id: 'stay',
            placeId: 'hotel',
            category: 'lodging' as TripEvent['category'],
            date: PREV_DAY,
            endDate: NEXT_DAY,
            startsAt: `${PREV_DAY}T15:00:00Z`,
            endsAt: `${NEXT_DAY}T11:00:00Z`,
          }),
          event({ id: 'm', placeId: 'museum', startsAt: at2('10:00') }),
        ],
      }).values(),
    ];
    // Neither a stop nor a tail member: `PIN_TIER.ambient` already calls it backdrop, and
    // you do not step to somewhere you are asleep in the middle of.
    expect(ids(buildDayStopSequence(all, { nameOf, onDate: DAY }))).toEqual(['museum']);
  });

  it('ALL-DAYS HAS NO SEQUENCE, which is why it has no traversal (§11)', () => {
    const all = [
      ...usages({
        places: [place('museum')],
        events: [event({ id: 'm', placeId: 'museum', startsAt: at2('10:00') })],
      }).values(),
    ];
    // Not "a control that is disabled" — there is nothing for a position to be an index of,
    // so the comparator would sequence the whole trip and a pin would read `27`.
    expect(buildDayStopSequence(all, { nameOf })).toEqual([]);
  });

  it('the pin numbers ARE this sequence, so the two cannot disagree', () => {
    const all = [
      ...usages({
        places: [place('kef'), place('hotel'), place('market')],
        events: [
          event({ id: 'a', placeId: 'kef', startsAt: at2('06:20') }),
          event({ id: 'b', placeId: 'hotel', startsAt: at2('11:30') }),
          event({ id: 'c', placeId: 'market', startsAt: at2('12:40') }),
        ],
      }).values(),
    ];
    const ctx = { nameOf, onDate: DAY };
    const index = buildPinOrderIndex(all, ctx);
    for (const stop of buildDayStopSequence(all, ctx)) {
      if (stop.order != null) expect(index.get(stop.usage.placeId)).toBe(stop.order);
    }
  });
});
