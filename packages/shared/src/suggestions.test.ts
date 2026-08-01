import { describe, expect, it } from 'vitest';
import {
  SUGGESTION_PLACEMENT,
  SUGGESTION_REASON,
  SUGGESTION_REF,
  SUGGESTION_SOURCE,
  SUGGESTION_STRATEGIES,
  suggestFor,
  suggestionSchema,
  type SuggestionContext,
  type SuggestionIdea,
  type SuggestionStop,
} from './suggestions';
import type { MaybeItem } from './entities';

// Tokyo, because the shelf mockup's fixture is a Tokyo trip. `מסעדת מון` is the
// day's lunch stop in `mockups/shelf-crowded-v1.html`, which is what the reason
// names.
const LUNCH: SuggestionStop = { name: 'מסעדת מון', at: { lat: 35.6812, lng: 139.7671 } };
const MUSEUM: SuggestionStop = { name: 'מוזיאון אדו', at: { lat: 35.6963, lng: 139.7966 } };

let seq = 0;
const idea = (over: Partial<MaybeItem> & { id: string }): MaybeItem => ({
  tripId: 'trip-1',
  title: over.id,
  createdBy: 'user-1',
  consumed: false,
  createdAt: `2026-07-${String(10 + seq++).padStart(2, '0')}T09:00:00.000Z`,
  updatedAt: '2026-07-20T09:00:00.000Z',
  updatedBy: 'user-1',
  ...over,
});

/** Metres offset into a lat/lng, roughly — enough to order things deterministically. */
const nearLunch = (metersNorth: number) => ({
  lat: LUNCH.at.lat + metersNorth / 111_320,
  lng: LUNCH.at.lng,
});

const ctxOf = (ideas: SuggestionIdea[], over: Partial<SuggestionContext> = {}) =>
  ({ date: '2026-07-20', dayStops: [LUNCH, MUSEUM], ideas, ...over }) satisfies SuggestionContext;

const ids = (ctx: SuggestionContext) =>
  suggestFor(ctx, SUGGESTION_PLACEMENT.LOCAL).map((s) =>
    s.ref.kind === SUGGESTION_REF.MAYBE_ITEM ? s.ref.id : s.ref.kind,
  );

describe('the registry and its seam', () => {
  it('registers exactly one strategy, and it is LOCAL (ADR-0151 §3)', () => {
    expect(SUGGESTION_STRATEGIES).toHaveLength(1);
    expect(SUGGESTION_STRATEGIES[0].source).toBe(SUGGESTION_SOURCE.NEAR_THE_DAY);
    expect(SUGGESTION_STRATEGIES[0].placement).toBe(SUGGESTION_PLACEMENT.LOCAL);
  });

  // §4's endpoint is reserved, not built. Asking for REMOTE must be empty rather
  // than an error — that is what makes ADR-0151 §5's "offline a remote source is
  // ABSENT" the default instead of a special case a surface has to write.
  it('returns nothing for a placement with no strategies, rather than throwing', () => {
    expect(suggestFor(ctxOf([{ item: idea({ id: 'a' }) }]), SUGGESTION_PLACEMENT.REMOTE)).toEqual(
      [],
    );
  });

  it('emits the shared shape, reason included', () => {
    const [first] = suggestFor(
      ctxOf([{ item: idea({ id: 'a' }), at: nearLunch(300) }]),
      SUGGESTION_PLACEMENT.LOCAL,
    );
    expect(() => suggestionSchema.parse(first)).not.toThrow();
    expect(first.reason).toBeDefined();
  });

  it('honours `limit`', () => {
    const ideas = ['a', 'b', 'c'].map((id) => ({ item: idea({ id }) }));
    expect(ids(ctxOf(ideas, { limit: 2 }))).toHaveLength(2);
  });
});

describe('near-the-day', () => {
  it('ranks by distance to the day’s stops', () => {
    const ideas = [
      { item: idea({ id: 'far' }), at: nearLunch(3000) },
      { item: idea({ id: 'near' }), at: nearLunch(200) },
      { item: idea({ id: 'mid' }), at: nearLunch(1200) },
    ];
    expect(ids(ctxOf(ideas))).toEqual(['near', 'mid', 'far']);
  });

  // The report, as a test: the nearest idea is buried in the snapshot's order and
  // has to come out at position 1 (the mockup's measurement panel, 3 · 18 · 18 → 1).
  it('brings the nearest idea to position 1 however deep it was buried', () => {
    const ideas = [
      ...['a', 'b', 'c', 'd'].map((id) => ({ item: idea({ id }), at: nearLunch(4000) })),
      { item: idea({ id: 'wanted' }), at: nearLunch(150) },
    ];
    expect(ids(ctxOf(ideas))[0]).toBe('wanted');
  });

  // ADR-0116 §2's partition is preserved, not re-decided: a nearer idea that is
  // already pencilled in for another day still loses to a dateless one.
  it('keeps dateless ideas ahead of ideas aimed elsewhere, however near', () => {
    const ideas = [
      { item: idea({ id: 'spoken-for', targetDate: '2026-07-24' }), at: nearLunch(50) },
      { item: idea({ id: 'dateless' }), at: nearLunch(4500) },
    ];
    expect(ids(ctxOf(ideas))).toEqual(['dateless', 'spoken-for']);
  });

  it('measures against `near` instead of the whole day when the gap sheet passes it', () => {
    const ideas = [
      { item: idea({ id: 'by-lunch' }), at: nearLunch(100) },
      { item: idea({ id: 'by-museum' }), at: { lat: MUSEUM.at.lat + 0.0009, lng: MUSEUM.at.lng } },
    ];
    expect(ids(ctxOf(ideas, { near: [MUSEUM] }))).toEqual(['by-museum', 'by-lunch']);
  });

  it('filters by category when the context asks for one', () => {
    const ideas = [
      { item: idea({ id: 'food', category: 'food' }), at: nearLunch(900) },
      { item: idea({ id: 'sight', category: 'sightseeing' }), at: nearLunch(100) },
    ];
    expect(ids(ctxOf(ideas, { category: 'food' }))).toEqual(['food']);
  });

  it('falls back to recency, newest first, when nothing spatial separates two ideas', () => {
    const ideas = [{ item: idea({ id: 'older' }) }, { item: idea({ id: 'newer' }) }];
    expect(ids(ctxOf(ideas))).toEqual(['newer', 'older']);
  });

  // A located-but-far idea must not outrank a placeless one on coordinates alone —
  // past FAR_M neither is "near today", so recency decides both.
  it('ties a far idea with a placeless one and lets recency break it', () => {
    const ideas = [
      { item: idea({ id: 'far' }), at: nearLunch(9000) },
      { item: idea({ id: 'no-place' }) },
    ];
    expect(ids(ctxOf(ideas))).toEqual(['no-place', 'far']);
  });

  it('ranks without stops at all, which is the offline/no-places day', () => {
    const ideas = [{ item: idea({ id: 'a' }) }, { item: idea({ id: 'b' }) }];
    expect(ids(ctxOf(ideas, { dayStops: [] }))).toEqual(['b', 'a']);
  });
});

describe('the reason, which is what makes a bad ranking arguable (ADR-0151 §8)', () => {
  it('names the stop and the distance when it measured one', () => {
    const [first] = suggestFor(
      ctxOf([{ item: idea({ id: 'a' }), at: nearLunch(300) }]),
      SUGGESTION_PLACEMENT.LOCAL,
    );
    expect(first.reason).toMatchObject({
      code: SUGGESTION_REASON.NEAR_STOP,
      stopName: 'מסעדת מון',
    });
    if (first.reason.code !== SUGGESTION_REASON.NEAR_STOP) throw new Error('unreachable');
    expect(first.reason.meters).toBeGreaterThan(250);
    expect(first.reason.meters).toBeLessThan(350);
  });

  it('says which day an idea is aimed at when it has no location to speak of', () => {
    const [first] = suggestFor(
      ctxOf([{ item: idea({ id: 'a', targetDate: '2026-07-24' }) }]),
      SUGGESTION_PLACEMENT.LOCAL,
    );
    expect(first.reason).toEqual({
      code: SUGGESTION_REASON.AIMED_AT_DAY,
      targetDate: '2026-07-24',
    });
  });

  it('says recency when there is nothing else true to say', () => {
    const [first] = suggestFor(ctxOf([{ item: idea({ id: 'a' }) }]), SUGGESTION_PLACEMENT.LOCAL);
    expect(first.reason).toEqual({ code: SUGGESTION_REASON.RECENTLY_ADDED });
  });

  it('every suggestion carries one — a strategy that cannot say why has not finished', () => {
    const ideas = [
      { item: idea({ id: 'a' }), at: nearLunch(100) },
      { item: idea({ id: 'b', targetDate: '2026-07-25' }) },
      { item: idea({ id: 'c' }) },
    ];
    for (const s of suggestFor(ctxOf(ideas), SUGGESTION_PLACEMENT.LOCAL)) {
      expect(s.reason.code).toBeTruthy();
    }
  });
});
