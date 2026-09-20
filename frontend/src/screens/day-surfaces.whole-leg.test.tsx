// @vitest-environment jsdom
//
// **A LEG WITH NO DAYS LEFT TO CROSS DRAWS ONE ROW, ON BOTH DAY SCREENS** (ADR-0236 §8).
//
// The owner, with the trip's first and last day side by side: _"why does the flight back look
// different than the outward flight?"_ The outward leg — ⁦18:15–21:00⁩, one calendar day — draws a
// single card with its range, its duration and its distance. The flight home crossed midnight, so
// it was `isMultiDay` → `isAmbient` → off `dayEvents`, and rendered as ADR-0064 §B's two
// transition points instead: the same journey, two rows, and neither carrying the duration or the
// distance the outward card states.
//
// §B's reasoning is about a span whose ends land on **two** day surfaces. Once §4 hosts the
// landing back on the day it departed from there are no two days left, so the span takes its
// ordinary card. This file is that sentence on **both** screens at once, because a day derivation
// changed in `DayView` alone has cost a release twice (`frontend/CLAUDE.md`).
//
// Pinned clock, and no environment this file did not set.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { EVENT_KIND, type TripEvent } from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { wrapNav } from '../test/nav-harness';
import { MapScopeProvider } from '../state/map-scope-state';
import { DragProvider } from '../state/drag-state';
import {
  AGREE_NOW,
  agreeEvent,
  authState,
  dayShapes,
  dayTravel,
  resetWorld,
  tripState,
  world,
} from '../test/agreement-harness';
import '../test/scroll-into-view';

vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => tripState(),
}));
vi.mock('../state/auth-state', () => ({ useAuth: () => authState() }));
vi.mock('../state/mode-state', () => ({
  useMode: () => ({ mode: 'trip', chromeMode: 'trip', goingLive: null, skipGoingLive: () => {} }),
}));
vi.mock('../state/verbs', () => ({
  useVerbs: () => ({ done: vi.fn(), skip: vi.fn(), restore: vi.fn(), onWay: vi.fn() }),
}));
vi.mock('../lib/travel', () => ({
  useDayTravel: () => dayTravel(),
  useDayShapes: () => dayShapes(),
}));

const { DayView } = await import('./DayView');
const { PlanDay } = await import('./PlanDay');

/** The harness trip runs to 2026-08-05, so this is its last day. */
const LAST_DAY = '2026-08-05';

/** The flight home: leaves the last night, lands the morning after — a day the trip has not
 *  got, so §4 hosts its arrival back here and §8 then draws the leg whole. */
const flightHome = agreeEvent('home', {
  title: 'רומא → תל אביב',
  category: 'transport',
  icon: '✈️',
  kind: EVENT_KIND.HARD,
  date: LAST_DAY,
  endDate: '2026-08-06',
  startsAt: `${LAST_DAY}T20:10:00Z`,
  endsAt: '2026-08-06T00:30:00Z',
});

/** The control: a red-eye INSIDE the trip. Its two ends really are on two day surfaces, which
 *  is the case ADR-0064 §B was written for, so it must keep its two rows. */
const redEyeInside = agreeEvent('inside', {
  title: 'נאפולי → רומא',
  category: 'transport',
  icon: '✈️',
  date: '2026-08-03',
  endDate: '2026-08-04',
  startsAt: '2026-08-03T21:00:00Z',
  endsAt: '2026-08-04T01:00:00Z',
});

const dayScreen = () =>
  render(
    wrapNav(
      <MapScopeProvider>
        <DragProvider>
          <DayView />
        </DragProvider>
      </MapScopeProvider>,
    ),
  ).container;

const planScreen = () =>
  render(
    wrapNav(
      <MapScopeProvider>
        <DragProvider>
          <PlanDay />
        </DragProvider>
      </MapScopeProvider>,
    ),
  ).container;

/** The two shapes this file is about, counted on whichever screen it is handed. */
const shapes = (root: HTMLElement, rowClass: string) => ({
  rows: root.querySelectorAll(rowClass).length,
  transitions: root.querySelectorAll('.transition-row').length,
});

beforeEach(() => {
  setSimulatedNow(Date.parse(AGREE_NOW));
  resetWorld();
});
afterEach(() => {
  cleanup();
  setSimulatedNow(null);
});

describe('a leg with no days left to cross draws ONE row (ADR-0236 §8)', () => {
  beforeEach(() => {
    world.events = [flightHome];
    world.activeDate = LAST_DAY;
  });

  it('draws it as a card, not two transition points — Trip’s day view', () => {
    const { rows, transitions } = shapes(dayScreen(), '.wp-event-face');
    expect(rows).toBe(1);
    expect(transitions).toBe(0);
  });

  it('draws it the same way in Plan’s builder — posture may differ, the fact may not', () => {
    const { rows, transitions } = shapes(planScreen(), '.bld');
    expect(rows).toBe(1);
    expect(transitions).toBe(0);
  });

  it('states the crossing on the card, which is what two rows could not', () => {
    // ADR-0037's `+1`: the arrival is the next calendar day, said where the range is said.
    expect(dayScreen().querySelector('.wp-event-xmid')).toBeTruthy();
  });
});

describe('a red-eye INSIDE the trip keeps its two rows (ADR-0064 §B, untouched)', () => {
  beforeEach(() => {
    world.events = [redEyeInside];
    world.activeDate = '2026-08-03';
  });

  it('draws the departure as a transition point and no card — Trip’s day view', () => {
    const { rows, transitions } = shapes(dayScreen(), '.wp-event-face');
    expect(transitions).toBe(1);
    expect(rows).toBe(0);
  });

  it('and the same in Plan’s builder', () => {
    const { rows, transitions } = shapes(planScreen(), '.bld');
    expect(transitions).toBe(1);
    expect(rows).toBe(0);
  });

  it('puts its arrival on the NEXT day, which is the day it actually lands on', () => {
    world.activeDate = '2026-08-04';
    expect(shapes(dayScreen(), '.wp-event-face').transitions).toBe(1);
  });
});
