// @vitest-environment jsdom
//
// **DO TWO SURFACES SAY THE SAME THING ABOUT ONE MINUTE?** (ADR-0226)
//
// The property nothing tested, and the reason six contradictions shipped green in three weeks
// (ADR-0206 §AJ3, §AY, §BB, §BD, §BF, and the night-origin fix in #827). Every surface is tested
// alone against its own fixture, so a board and a day view that disagree both pass — which is
// exactly what happened on 2026-09-14, when the hero said `זמן חופשי · עד 10:30` over a tile
// counting `7 דקות ליציאה` and all 5559 tests were green.
//
// ADR-0159 §1 is the rule: two elevations may differ in POSTURE and may not differ about a FACT.
// This file is that sentence as an assertion. It compares the INSTANTS the surfaces tag
// themselves with (`lib/time-claim.ts`), never their words, because the words are the posture and
// are meant to differ — `יציאה עד 10:15` and `7 דקות ליציאה` are one claim said two ways.
//
// **What a failure here means.** Not "a snapshot moved". Two surfaces of this app are telling a
// traveller different things about the same moment, and one of them is wrong.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { setSimulatedNow } from './lib/useClock';
import { wrapNav } from './test/nav-harness';
import { MapScopeProvider } from './state/map-scope-state';
import { DragProvider } from './state/drag-state';
import {
  AGREE_NOW,
  AGREE_ZONE,
  agreeDinner,
  agreeMuseum,
  authState,
  dayShapes,
  dayTravel,
  resetWorld,
  tripState,
  world,
} from './test/agreement-harness';
import { TIME_FACT_ATTR, claimClock, parseTimeFacts, type TimeFactClaim } from './lib/time-claim';
import type { TripEvent } from '@waypoint/shared';
import './test/scroll-into-view';

vi.mock('./state/trip-state', () => ({
  // `DayView` sorts with this comparator out of the same module it reads the trip from, so a
  // mock that omits it renders nothing and the suite silently compares an empty day.
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => tripState(),
}));
vi.mock('./state/auth-state', () => ({ useAuth: () => authState() }));
vi.mock('./state/mode-state', () => ({
  useMode: () => ({ mode: 'trip', chromeMode: 'trip', goingLive: null, skipGoingLive: () => {} }),
}));
vi.mock('./state/verbs', () => ({
  useVerbs: () => ({ done: vi.fn(), skip: vi.fn(), restore: vi.fn(), onWay: vi.fn() }),
}));
vi.mock('./lib/travel', () => ({
  useDayTravel: () => dayTravel(),
  useDayShapes: () => dayShapes(),
}));
vi.mock('./lib/useGeolocation', () => ({
  useGeolocation: () => ({
    status: 'denied',
    permission: 'denied',
    blocked: false,
    request: vi.fn(),
  }),
}));

const { Home } = await import('./screens/Home');
const { DayView } = await import('./screens/DayView');

/** A claim, plus which surface made it — so a failure names the two disagreeing surfaces rather
 *  than reporting that "something" disagreed. */
interface Stated extends TimeFactClaim {
  surface: string;
  /** The text the element actually printed, for the zone half of the check. */
  text: string;
}

/** Harvest every derived time claim a rendered surface tagged itself with. */
function harvest(root: HTMLElement, surface: string): Stated[] {
  return [...root.querySelectorAll(`[${TIME_FACT_ATTR}]`)].flatMap((el) =>
    parseTimeFacts(el.getAttribute(TIME_FACT_ATTR)).map((fact) => ({
      ...fact,
      surface,
      text: el.textContent ?? '',
    })),
  );
}

const showHome = () => harvest(render(wrapNav(<Home />)).container, 'board');

const showDay = () =>
  harvest(
    render(
      wrapNav(
        <MapScopeProvider>
          <DragProvider>
            <DayView />
          </DragProvider>
        </MapScopeProvider>,
      ),
    ).container,
    'day',
  );

/** The comparison key: a claim is only comparable to another claim of the same KIND about the
 *  same SUBJECT. Without the subject, a board's departure for dinner would be held against a
 *  day's departure for the museum and reported as a contradiction that is two different facts. */
const keyOf = (c: TimeFactClaim) => `${c.kind}@${c.of ?? '-'}`;

/** The assertion this file exists to make. */
function expectAgreement(claims: Stated[]) {
  const groups = new Map<string, Stated[]>();
  for (const c of claims) groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);
  for (const [key, group] of groups) {
    const distinct = [...new Set(group.map((c) => c.atMs))];
    expect(
      distinct.length,
      `surfaces disagree about ${key}: ` +
        group.map((c) => `${c.surface} says ${new Date(c.atMs).toISOString()}`).join(' · '),
    ).toBe(1);
  }
}

/**
 * **THE RELATIONS BETWEEN DIFFERENT CLAIMS ABOUT ONE SUBJECT** — the check that catches §BF,
 * which agreement alone cannot see.
 *
 * Written after the first draft of this suite was pointed at the shipped §BF bug and **passed**.
 * The reason is worth keeping: the board's overstated `free-until` did not contradict another
 * SURFACE, it contradicted the `leave-by` on its own card ⁦100px⁩ below it. Grouping by
 * (kind, subject) puts those two in different groups, so nothing compared them — the same blind
 * spot the per-surface suites have, faithfully reproduced one level up.
 *
 * So agreement is necessary and not sufficient. These are the relations ADR-0206 states in prose,
 * as assertions:
 *
 *  - **The free time ends where the journey begins** (§AJ4.1). `free-until` IS the departure, not
 *    the point the departure is for. That is §BF exactly, and it is detectable from ONE surface.
 *  - **You arrive after you leave.** A guard on the arithmetic rather than a decision, holding on
 *    every arm that states both.
 */
function expectCoherence(claims: Stated[]) {
  for (const subject of new Set(claims.map((c) => c.of ?? '-'))) {
    const about = claims.filter((c) => (c.of ?? '-') === subject);
    const one = (kind: string) => about.find((c) => c.kind === kind);
    const leave = one('leave-by');
    const free = one('free-until');
    const arrive = one('arrive-at');
    if (leave && free) {
      expect(
        free.atMs,
        `the free time for ${subject} runs to ${new Date(free.atMs).toISOString()} ` +
          `(${free.surface}) but the departure is ${new Date(leave.atMs).toISOString()} ` +
          `(${leave.surface}) — ADR-0206 §AJ4.1: the free time ends where the journey begins`,
      ).toBe(leave.atMs);
    }
    if (leave && arrive) {
      expect(
        arrive.atMs,
        `${subject} arrives at ${new Date(arrive.atMs).toISOString()} before it departs at ` +
          `${new Date(leave.atMs).toISOString()}`,
      ).toBeGreaterThan(leave.atMs);
    }
  }
}

/**
 * The second half, and the one §BD needs: the same instant printed against two different walls is
 * still two different clocks on two screens. A claim rendered AS A CLOCK must be readable as its
 * own instant in the zone the surface declared.
 *
 * **It binds only where a clock was actually printed**, and that is the point rather than a
 * loophole. ADR-0159 §1's posture freedom is mostly a choice between a clock and a duration — the
 * board's tile says `7 דקות ליציאה` about the very instant the day row prints as `יציאה עד 14:37`
 * — and a duration has no wall to be measured against. So the check is keyed on whether the text
 * contains a clock at all; the moment a surface prints one, it must be the right one.
 */
const CLOCK = /\d{1,2}:\d{2}/;
function expectClocksMatchInstants(claims: Stated[]) {
  for (const c of claims.filter((c) => CLOCK.test(c.text))) {
    expect(
      c.text,
      `${c.surface} tagged ${c.kind} as ${new Date(c.atMs).toISOString()} in ${c.zone} ` +
        `(= ${claimClock(c)}) but printed "${c.text}"`,
    ).toContain(claimClock(c));
  }
}

describe('the surfaces agree about one minute (ADR-0226)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(AGREE_NOW));
    resetWorld();
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  /**
   * **The reported day.** A stop 22 minutes out with a 10-minute leg into it: the departure is
   * 7 minutes away and the point is 22. Before ADR-0206 §BF the board called the free time
   * `עד <the point>` while its own tile counted to the departure — the two numbers that were on
   * screen together in the field report.
   */
  it('states one departure and one free-time ceiling across the board and the day', () => {
    world.events = [agreeMuseum, agreeDinner(22)];
    world.travelSeconds = 10 * 60;
    const claims = [...showHome(), ...showDay()];
    // The suite is only meaningful if the surfaces actually spoke.
    expect(claims.length).toBeGreaterThan(1);
    expectAgreement(claims);
    expectCoherence(claims);
  });

  /** Every clock printed is its own instant in its own declared zone — §BD's shape, where the
   *  instants agreed and one surface kept a zone the other had taken off. */
  it('prints each instant in the zone it says it used', () => {
    world.events = [agreeMuseum, agreeDinner(22)];
    world.travelSeconds = 10 * 60;
    expectClocksMatchInstants([...showHome(), ...showDay()]);
  });

  /**
   * **The clamped arm** (ADR-0206 §AJ2/§AJ3) — the buffer lands the departure behind the row it
   * leaves from, so the instant is pulled forward to the earliest departure that exists. §AJ3 is
   * the bug where only `dayJourney` applied that clamp and the board, reading the raw answer,
   * marked a traveller late for a departure nobody could have made.
   */
  it('agrees on a departure the clamp pulled forward', () => {
    world.events = [agreeMuseum, agreeDinner(8)];
    world.travelSeconds = 30 * 60;
    const claims = [...showHome(), ...showDay()];
    expectAgreement(claims);
    expectCoherence(claims);
  });

  /** **No estimate is the ordinary answer** (ADR-0206 §D4), and silence cannot disagree with
   *  itself — but a surface inventing a claim where another states none would show up here. */
  it('agrees when there is no estimate to state', () => {
    world.events = [agreeMuseum, agreeDinner(22)];
    world.travelSeconds = null;
    const claims = [...showHome(), ...showDay()];
    expectAgreement(claims);
    expectCoherence(claims);
    expectClocksMatchInstants(claims);
  });

  /** A long leg, where the departure is already behind us: the board withdraws its ceiling and
   *  the day row states the passed departure. Whatever each says, they must say one instant. */
  it('agrees once the departure has passed', () => {
    world.events = [agreeMuseum, agreeDinner(12)];
    world.travelSeconds = 20 * 60;
    const claims = [...showHome(), ...showDay()];
    expectAgreement(claims);
    expectCoherence(claims);
    expectClocksMatchInstants(claims);
  });
});

/**
 * **The suite can fail**, proven rather than asserted — a conformance test that cannot go red is
 * decoration, and this one's whole value is that CI would have caught six shipped bugs.
 */
describe('the comparison itself', () => {
  const claim = (surface: string, atMs: number, zone = AGREE_ZONE): Stated => ({
    surface,
    kind: 'leave-by',
    atMs,
    zone,
    of: 'dinner',
    text: claimClock({ kind: 'leave-by', atMs, zone }),
  });

  it('fails when two surfaces name different instants for one subject', () => {
    const at = Date.parse(AGREE_NOW);
    expect(() => expectAgreement([claim('board', at), claim('day', at + 15 * 60_000)])).toThrow(
      /surfaces disagree about leave-by@dinner/,
    );
  });

  it('passes when they name the same instant in different words', () => {
    const at = Date.parse(AGREE_NOW);
    const board = { ...claim('board', at), text: `7 דקות ליציאה · ${claimClock(claim('x', at))}` };
    expect(() => expectAgreement([board, claim('day', at)])).not.toThrow();
  });

  /**
   * **The §BF shape, and the reason `expectCoherence` exists.** Both claims come from ONE
   * surface, so `expectAgreement` sees two groups of one and passes — verified here rather than
   * asserted, because that false pass is what made the first draft of this suite worthless.
   */
  it('agreement alone passes the bug that coherence catches', () => {
    const at = Date.parse(AGREE_NOW);
    const leave: Stated = claim('board', at);
    const free: Stated = { ...claim('board', at + 15 * 60_000), kind: 'free-until' };
    expect(() => expectAgreement([leave, free])).not.toThrow();
    expect(() => expectCoherence([leave, free])).toThrow(/the free time ends where the journey/);
  });

  /** The §BD half: one instant, two zones, two clocks on two screens. */
  it('fails when a surface prints an instant against the wrong wall', () => {
    const at = Date.parse(AGREE_NOW);
    const wrong: Stated = { ...claim('day', at), text: claimClock(claim('x', at, 'Asia/Tokyo')) };
    expect(() => expectClocksMatchInstants([wrong])).toThrow(/but printed/);
  });
});
