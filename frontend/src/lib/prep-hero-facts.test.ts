// **The eve's clock counts to the instant the mode flips** (ADR-0221 §3) — on the clock the
// mode reads, which is the zone you are standing in (ADR-0107, 2026-09-09 amendment), not the
// trip's primary zone. Asserted as a relation against `deriveMode` rather than a literal, so
// the two cannot drift apart again: on the owner's device the eve opened on `26:59:48` to
// מחר, because BOTH read the far side's midnight on a westward trip (2026-09-10).
import { describe, expect, it } from 'vitest';
import type { ZoneEvidence } from '@waypoint/shared';
import { prepHeroFacts } from './prep-hero-facts';
import { deriveMode } from './mode';
import { PREP_TIER } from './prep-tier';

const JLM = 'Asia/Jerusalem';
const REK = 'Atlantic/Reykjavik';
const trip = { startDate: '2026-09-11', endDate: '2026-09-22', timezone: REK };
const evidence = (crossings: ZoneEvidence['crossings']): ZoneEvidence => ({
  events: [],
  bookings: [],
  places: [],
  crossings,
  primaryZone: REK,
});
// The outbound flight leaves Tel Aviv on the 11th, so home is the live zone until then.
const outbound = evidence([{ at: Date.parse('2026-09-11T05:00:00Z'), fromZone: JLM, toZone: REK }]);

describe('prepHeroFacts — the eve clock', () => {
  it('counts to home midnight of day 1, the instant the mode flips (field report, 2026-09-09)', () => {
    // 00:00 at home on the 10th: the eve, and exactly 24 hours to go — not 27.
    const now = new Date('2026-09-09T21:00:00Z');
    const facts = prepHeroFacts({ trip, events: [], now, zoneEvidence: outbound });
    expect(facts.days).toBe(1);
    expect(facts.tier).toBe(PREP_TIER.EVE);
    const target = facts.eve!.targetMs;
    expect(target).toBe(Date.parse('2026-09-10T21:00:00Z'));
    // The zero IS the flip: plan one millisecond before it, trip at it.
    expect(deriveMode(trip, new Date(target - 1), outbound)).toBe('plan');
    expect(deriveMode(trip, new Date(target), outbound)).toBe('trip');
  });

  it('falls back to the primary zone when no crossing anchors the itinerary, as the mode does', () => {
    const none = evidence([]);
    const now = new Date('2026-09-10T00:00:00Z');
    const facts = prepHeroFacts({ trip, events: [], now, zoneEvidence: none });
    const target = facts.eve!.targetMs;
    expect(target).toBe(Date.parse('2026-09-11T00:00:00Z'));
    expect(deriveMode(trip, new Date(target - 1), none)).toBe('plan');
    expect(deriveMode(trip, new Date(target), none)).toBe('trip');
  });

  it('reads 00:00:00 on the first morning: the target has passed, the count is over', () => {
    // 05:00 at home on day 1, before the flight.
    const now = new Date('2026-09-11T02:00:00Z');
    const facts = prepHeroFacts({ trip, events: [], now, zoneEvidence: outbound });
    expect(facts.days).toBe(0);
    expect(facts.tier).toBe(PREP_TIER.EVE);
    expect(facts.eve!.targetMs).toBeLessThanOrEqual(now.getTime());
  });
});
