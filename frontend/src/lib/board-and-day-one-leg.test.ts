// **THE BOARD AND THE DAY MEASURE ONE LEG** — the repro for the 2026-09-20 field report.
//
// Two device screenshots one minute apart: the day view drew the live leg as in progress with a
// position-scaled remainder, the board read `פנוי · זמן חופשי · עד 17:18` with `11 · דקות · ליציאה`
// beside it. That implies `travelSeconds ≈ 7 דק׳` into a ⁦17:30⁩ arrival, where the day's own leg
// was ⁦3:26⁩ — so the two surfaces did not disagree about the traveller, they measured different
// journeys. ADR-0159 §1 allows the two elevations a difference in POSTURE and forbids one about a
// FACT, and which leg you are on is a fact.
//
// **The two derivations are genuinely different code**, which is why this file exists at all:
// the board asks `travelOrigin` (the latest stop that has STARTED today), the day asks `dayRun`'s
// journey chain (the last PLACED row, with placeless rows counted as spanned). They agree on an
// ordinary day and the interesting question is which days they do not — so the reported day is
// pinned here, plus the two shapes ADR-0232 built the chain for.
import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { dayRun } from './day-joins';
import { bookingWhen } from './booking-journey';
import { groupStartEvent, mergeDayEntries } from './day-entries';
import { buildTimeTree } from './time';
import { travelOrigin } from './hero-travel';

const TZ = 'Atlantic/Reykjavik';
const STAMP = '2026-12-01T00:00:00Z';
const DATE = '2026-12-20';

const ev = (over: Partial<TripEvent> & { id: string }): TripEvent => ({
  tripId: 't1',
  date: DATE,
  title: over.id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  sortOrder: 1,
  source: 'manual',
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: 'u1',
  ...over,
});

const at = (h: string, m = '00', day = '20') => `2026-12-${day}T${h}:${m}:00+00:00`;

/** The reported day, in clock order. The hotel's check-out is an ambient edge and never a stop. */
const hvit = ev({
  id: 'hvit',
  startsAt: at('12'),
  endsAt: at('12', '45'),
  status: EVENT_STATUS.DONE,
});
const kolg = ev({ id: 'kolg', startsAt: at('17', '30'), endsAt: at('18') });
const kirk = ev({ id: 'kirk', startsAt: at('18', '30'), endsAt: at('19', '15') });
/** No place — the aurora watch ADR-0232 R6 is about. */
const aurora = ev({ id: 'aurora', startsAt: at('22', '30'), endsAt: at('01', '30', '21') });

const DAY = [hvit, kolg, kirk, aurora];
const NOW = Date.parse(at('17', '07'));

const chainOf = (placed: Set<string>) => ({
  placedAt: (event: TripEvent) => placed.has(event.id),
  movesYou: () => false,
});

/** The day's answer: the `legFrom` recorded against the row the leg runs INTO. */
function dayLegFrom(events: TripEvent[], placed: Set<string>, to: string): string | undefined {
  const run = dayRun(mergeDayEntries(buildTimeTree(events), []), {
    bookings: [],
    when: bookingWhen(events),
    tz: TZ,
    chain: chainOf(placed),
  });
  const record = run.blocks
    .flatMap((b) => b.entries)
    .find((e) => e.entry.kind === 'event' && groupStartEvent(e.entry.group).id === to);
  return record?.legFrom?.id;
}

/** The board's answer, through the derivation `Home.tsx` actually calls. */
function boardLegFrom(
  events: TripEvent[],
  placed: Set<string>,
  to: string,
  nowMs = NOW,
): string | undefined {
  return travelOrigin({
    events,
    nowMs,
    excludeEventId: to,
    placed: (event) => placed.has(event.id),
  }).event?.id;
}

describe('the board and the day measure one leg (field report, 2026-09-20)', () => {
  const placed = new Set(['hvit', 'kolg', 'kirk']);

  it('agrees on the reported day: the leg into the 17:30 stop leaves the 12:00 one', () => {
    expect(dayLegFrom(DAY, placed, 'kolg')).toBe('hvit');
    expect(boardLegFrom(DAY, placed, 'kolg')).toBe('hvit');
  });

  it('and a settled stop is still where the plan left you, on both', () => {
    // `hvit` is `done` in the fixture above — the screenshot's `היינו ✓`. Neither derivation
    // treats a settled stop as absent; only a SKIPPED one denies the claim (ADR-0208 §2).
    expect(boardLegFrom(DAY, placed, 'kolg')).toBe('hvit');
    expect(travelOrigin({ events: DAY, nowMs: NOW, excludeEventId: 'kolg' }).denied).toBe(false);
  });

  it('agrees across a PLACELESS stop that has already started', () => {
    // At 23:00 the aurora has begun and has no place, so the plan's last claim about where you
    // are is "somewhere". The day spans it and leaves from `kirk`; the board walks back to the
    // same row and marks the claim as one the plan cannot make (ADR-0232 R6).
    const bed = ev({ id: 'bed', startsAt: at('01', '45', '21') });
    const events = [...DAY, bed];
    const night = Date.parse(at('23', '00'));
    expect(dayLegFrom(events, placed, 'bed')).toBe('kirk');
    const board = travelOrigin({
      events,
      nowMs: night,
      excludeEventId: 'bed',
      placed: (event) => placed.has(event.id),
    });
    expect(board.event?.id).toBe('kirk');
    expect(board.denied).toBe(true);
  });
});

// ── AND THE ROW THAT PRODUCED THE REPORT ─────────────────────────────────────────────────────
//
// Tonight's hotel checks in at ⁦16:00⁩ on a day whose last stop was at ⁦12:00⁩. The check-in hour has
// passed, so it is the latest thing to have STARTED — and `travelOrigin` reads "the last thing
// that started" as where the plan left you.
describe('a stay whose check-in hour has passed is not where you are', () => {
  const placed = new Set(['hvit', 'kolg', 'kirk', 'bed']);
  const bed = ev({
    id: 'bed',
    title: 'tonight',
    category: 'lodging',
    kind: EVENT_KIND.HARD,
    startsAt: at('16', '00'),
    endsAt: at('11', '00', '21'),
    endDate: '2026-12-21',
  });
  const events = [...DAY, bed];

  it('the day never saw it: its chain is built from `dayEvents`, which drops ambient spans', () => {
    expect(dayLegFrom(DAY, placed, 'kolg')).toBe('hvit');
  });

  it('and so does the board', () => {
    expect(boardLegFrom(events, placed, 'kolg')).toBe('hvit');
  });
});
