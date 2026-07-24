// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';

const ACTIVE_DATE = '2026-07-20';

const place = (id: string, coords: boolean): Place => ({
  id,
  tripId: 't1',
  name: id,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u1',
  ...(coords ? { lat: 35.6, lng: 139.6 } : {}),
});

const event = (p: Partial<TripEvent> & Pick<TripEvent, 'id' | 'placeId'>): TripEvent => ({
  tripId: 't1',
  date: ACTIVE_DATE,
  title: p.id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u1',
  ...p,
});

const maybe = (p: Partial<MaybeItem> & Pick<MaybeItem, 'id'>): MaybeItem =>
  ({ tripId: 't1', title: p.id, consumed: false, ...p }) as MaybeItem;

// Fixtures: a food event + a coordless-lite event today; a sightseeing event on
// another day; a food maybe (no day). Mutable so a test can blank them.
let tripEvents: TripEvent[] = [];
let tripMaybes: MaybeItem[] = [];
let tripPlaces: Place[] = [];
let currentMode = 'trip';

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: {
      id: 't1',
      name: 'טיול',
      timezone: 'Asia/Tokyo',
      startDate: '2026-07-19',
      endDate: '2026-07-25',
    },
    events: tripEvents,
    bookings: [],
    maybeItems: tripMaybes,
    places: tripPlaces,
    activeDate: ACTIVE_DATE,
    usingCachedSnapshot: false,
  }),
}));
vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: currentMode }) }));
vi.mock('../lib/outbox', () => ({ useIsOffline: () => false }));

import { ToastProvider } from '../ui/Toast';
import { NavProvider } from '../state/nav-state';
import { MapView } from './Map';
import { t } from '../i18n/he';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

function seed() {
  tripPlaces = [place('food', true), place('see', true), place('idea', true), place('lite', false)];
  tripEvents = [
    event({ id: 'food', placeId: 'food', category: 'food' }),
    event({ id: 'see', placeId: 'see', category: 'sightseeing', date: '2026-07-21' }),
    event({ id: 'lite', placeId: 'lite', category: 'activity' }),
  ];
  tripMaybes = [maybe({ id: 'idea', placeId: 'idea', category: 'food' })];
}

describe('MapView (Phase 3, ADR-0109/0110)', () => {
  afterEach(() => {
    cleanup();
    tripEvents = [];
    tripMaybes = [];
    tripPlaces = [];
    currentMode = 'trip';
  });

  it('Trip mode defaults to today: shows today’s places, hides other-day and dayless ones', () => {
    seed();
    render(wrap(<MapView />));
    expect(screen.getByText('food')).toBeTruthy();
    expect(screen.getByText('lite')).toBeTruthy(); // coordless, still listed on its day
    expect(screen.queryByText('see')).toBeNull(); // another day
    expect(screen.queryByText('idea')).toBeNull(); // a maybe has no day facet
  });

  it('a coord place gets a Google directions link; a coordless one gets the listed-only note', () => {
    seed();
    render(wrap(<MapView />));
    const nav = screen.getAllByRole('link', { name: new RegExp(t.actions.navigate) });
    expect(nav[0].getAttribute('href')).toContain('/maps/dir/?api=1&destination=');
    expect(screen.getByText(t.map.listedOnly)).toBeTruthy();
  });

  it('the all-days chip reveals every place (other days + dayless maybes/bookings)', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
    expect(screen.getByText('see')).toBeTruthy();
    expect(screen.getByText('idea')).toBeTruthy();
  });

  it('the maybes toggle narrows to shelf ideas', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) })); // see everything
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.filter.maybes) }));
    expect(screen.getByText('idea')).toBeTruthy();
    expect(screen.queryByText('food')).toBeNull();
    expect(screen.queryByText('see')).toBeNull();
  });

  it('Plan mode defaults to all days', () => {
    seed();
    currentMode = 'plan';
    render(wrap(<MapView />));
    expect(screen.getByText('see')).toBeTruthy();
    expect(screen.getByText('idea')).toBeTruthy();
  });

  it('empty trip → the empty state', () => {
    render(wrap(<MapView />));
    expect(screen.getByText(t.map.empty.title)).toBeTruthy();
  });
});
