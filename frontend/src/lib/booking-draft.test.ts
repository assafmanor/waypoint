import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  type Booking,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { bookingSheetDraft } from './booking-draft';
import { t } from '../i18n/he';

// **Derived value or human choice? A VALUE TEST** (field reports #30/#31, following
// `chosenIcon`'s precedent). The sheet persists only the EFFECTIVE title and glyph, so what
// it reads back cannot say who put them there — and reading a stored default as a choice is
// the whole defect: the derivation stops following the thing it was derived from.
//
// A pure function, so this is where the provenance rules are pinned; the sheet's own tests
// then drive the behaviour those flags produce.
const trip = { timezone: 'Asia/Tokyo' };
const places: Place[] = [
  {
    id: 'pl-nrt',
    tripId: 't1',
    name: 'טוקיו',
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  } as Place,
];

const hotel = (fields: Partial<Booking>): Booking =>
  ({
    id: 'bk',
    tripId: 't1',
    type: BOOKING_TYPE.HOTEL,
    title: '',
    source: BOOKING_SOURCE.MANUAL,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
    ...fields,
  }) as Booking;

const linked = (icon?: string): TripEvent[] =>
  [
    { id: 'ev', tripId: 't1', bookingId: 'bk', date: '2026-07-20', title: 'x', icon },
  ] as TripEvent[];

const draftFor = (booking: Booking | null, events: TripEvent[] = []) =>
  bookingSheetDraft({ booking, trip, events, places });

describe('bookingSheetDraft — provenance is a value test, not a stored flag', () => {
  it('opens a fresh form untouched on both fields', () => {
    const draft = draftFor(null);
    expect(draft).toMatchObject({ title: '', titleTouched: false, iconTouched: false });
  });

  // The two rungs of field report #9's fallback chain. Either one is the derivation's own
  // answer, so a booking saved with either must keep following it — otherwise adding a place
  // to a nameless booking would leave it called `לינה` forever.
  it('reads a place-named and a type-labelled booking as still derived', () => {
    expect(draftFor(hotel({ title: 'טוקיו', placeId: 'pl-nrt' })).titleTouched).toBe(false);
    expect(draftFor(hotel({ title: t.index.bookingType.hotel })).titleTouched).toBe(false);
  });

  it('reads a name nobody could have derived as the person’s', () => {
    expect(draftFor(hotel({ title: 'הבקתה', placeId: 'pl-nrt' })).titleTouched).toBe(true);
  });

  it('reads the type’s own glyph as derived and any other as picked', () => {
    expect(draftFor(hotel({}), linked('🏨'))).toMatchObject({ icon: '🏨', iconTouched: false });
    expect(draftFor(hotel({}), linked('⭐'))).toMatchObject({ icon: '⭐', iconTouched: true });
  });

  // `chosenIcon` discards the placeholders before the comparison runs, so a stored `📌`
  // never shadows the type's own glyph — the defect it was extracted to undo, one layer up.
  it('discards a stored placeholder glyph rather than calling it a choice', () => {
    expect(draftFor(hotel({}), linked('📌'))).toMatchObject({ icon: '🏨', iconTouched: false });
    expect(draftFor(hotel({}), linked(undefined))).toMatchObject({
      icon: '🏨',
      iconTouched: false,
    });
  });
});
