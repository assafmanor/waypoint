// @vitest-environment jsdom
// **This file exists because its absence let a bug ship** (ADR-0163 §3's miss, owner report
// 2026-08-04). `BookingTitle` decided "draw a route" from `carriesRoute`, which agreed with
// "is this named by its route" for every type that existed before the car hire — so §3 could
// change the stored title and this component would keep rebuilding a route from the place
// FKs, printing `נריטה ← נריטה` on the Index row and `נריטה ← -` with the return unset.
//
// The one question worth pinning is therefore which types draw a route and which draw their
// name, and the half-filled hire — the case that produced the visible dash.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  type Booking,
  type BookingType,
  type Place,
} from '@waypoint/shared';

import { BookingTitle } from './BookingTitle';

const places: Place[] = [
  { id: 'pl-tlv', tripId: 't1', name: 'נתב״ג', createdAt: '', updatedAt: '', updatedBy: 'u' },
  { id: 'pl-nrt', tripId: 't1', name: 'נריטה', createdAt: '', updatedAt: '', updatedBy: 'u' },
];

const booking = (type: BookingType, over: Partial<Booking> = {}): Booking => ({
  id: 'bk',
  tripId: 't1',
  type,
  title: 'Hertz',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...over,
});

/** The arrow `RouteLabel` draws is an SVG, so the presence of a ROUTE is read off the
 *  element it renders — not off the text, which would pass on a title that merely
 *  contains two place names. */
const drewRoute = () => document.querySelector('.route') != null;

describe('BookingTitle', () => {
  afterEach(cleanup);

  it('draws a route for the modes named by one', () => {
    for (const type of [BOOKING_TYPE.FLIGHT, BOOKING_TYPE.TRAIN, BOOKING_TYPE.TRANSIT]) {
      const { unmount } = render(
        <BookingTitle
          booking={booking(type, { fromPlaceId: 'pl-tlv', toPlaceId: 'pl-nrt' })}
          places={places}
        />,
      );
      expect(drewRoute()).toBe(true);
      unmount();
    }
  });

  // **The report.** A hire has two counters and a name; it must show the name.
  it('draws a car hire by its name, never by its counters', () => {
    render(
      <BookingTitle
        booking={booking(BOOKING_TYPE.CAR, { fromPlaceId: 'pl-nrt', toPlaceId: 'pl-nrt' })}
        places={places}
      />,
    );
    expect(drewRoute()).toBe(false);
    expect(screen.getByText('Hertz')).toBeTruthy();
    expect(document.body.textContent).not.toContain('נריטה');
  });

  // The case that produced the visible dash: one endpoint set, so `RouteLabel` filled the
  // other with its `-` placeholder.
  it('shows no dash for a hire whose return place was never set', () => {
    render(
      <BookingTitle
        booking={booking(BOOKING_TYPE.CAR, { fromPlaceId: 'pl-nrt' })}
        places={places}
      />,
    );
    expect(drewRoute()).toBe(false);
    expect(document.body.textContent).toBe('Hertz');
  });

  it('draws a one-way hire by its name too — the route is real, just not its title', () => {
    render(
      <BookingTitle
        booking={booking(BOOKING_TYPE.CAR, { fromPlaceId: 'pl-tlv', toPlaceId: 'pl-nrt' })}
        places={places}
      />,
    );
    expect(drewRoute()).toBe(false);
    expect(screen.getByText('Hertz')).toBeTruthy();
  });

  it('falls back to the title when a journey has no endpoints in reach', () => {
    render(
      <BookingTitle booking={booking(BOOKING_TYPE.FLIGHT, { title: 'טיסה' })} places={places} />,
    );
    expect(drewRoute()).toBe(false);
    expect(screen.getByText('טיסה')).toBeTruthy();
  });

  it('shows a single-place booking by its title', () => {
    render(
      <BookingTitle
        booking={booking(BOOKING_TYPE.HOTEL, { title: 'Granbell', placeId: 'pl-nrt' })}
        places={places}
      />,
    );
    expect(drewRoute()).toBe(false);
    expect(screen.getByText('Granbell')).toBeTruthy();
  });
});
