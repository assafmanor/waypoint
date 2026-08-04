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
  // Two now (ADR-0151's 2026-08-04 amendment), both LOCAL — and the ORDER is a decision, not
  // an accident: `suggestFor` dedupes by ref keeping the first, so `fits-a-day` leading is
  // what lets its sentence win for the few ideas it can speak about. Registered second it
  // would be dead code, because `near-the-day` emits every idea.
  it('registers both LOCAL strategies, fits-a-day first (ADR-0151 §3 + amendment)', () => {
    expect(SUGGESTION_STRATEGIES.map((s) => s.source)).toEqual([
      SUGGESTION_SOURCE.FITS_A_DAY,
      SUGGESTION_SOURCE.NEAR_THE_DAY,
    ]);
    expect(SUGGESTION_STRATEGIES.every((s) => s.placement === SUGGESTION_PLACEMENT.LOCAL)).toBe(
      true,
    );
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

// **ADR-0151's second strategy** (2026-08-04 amendment). It answers a different question from
// `near-the-day` — WHICH DAY does this dateless idea belong to, rather than how does it rank for
// the day I am on — which is why it is a strategy and not a parameter on that one.
describe('fits-a-day', () => {
  const DAY_1 = '2026-07-20';
  const DAY_4 = '2026-07-23';
  const DAY_5 = '2026-07-24';
  /** Day 4 stops at the museum; day 5 stops at lunch, across town. Day 1 (the focused one)
   *  has its own stops from `ctxOf`. */
  const days = [
    { date: DAY_1, stops: [LUNCH] },
    { date: DAY_4, stops: [MUSEUM] },
    { date: DAY_5, stops: [LUNCH] },
  ];
  /** 300m from the museum, which is day 4's only stop. */
  const nearMuseum = {
    lat: MUSEUM.at.lat + 300 / 111_320,
    lng: MUSEUM.at.lng,
  };
  const fits = (ctx: SuggestionContext) =>
    suggestFor(ctx, SUGGESTION_PLACEMENT.LOCAL).filter(
      (s) => s.source === SUGGESTION_SOURCE.FITS_A_DAY,
    );

  it('names the day a dateless idea sits nearest to, and how far', () => {
    const [only] = fits(
      ctxOf([{ item: idea({ id: 'oden' }), at: nearMuseum }], { date: DAY_1, days }),
    );
    expect(only.reason).toEqual({
      code: SUGGESTION_REASON.FITS_DAY,
      date: DAY_4,
      meters: expect.closeTo(300, 0),
      stopName: MUSEUM.name,
    });
  });

  // The one answer, not every day it happens to be near — the question has one.
  it('keeps the best day only', () => {
    const twoNear = [
      { date: DAY_4, stops: [MUSEUM] },
      // Day 5 also stops at the museum, but 1km away rather than 300m.
      {
        date: DAY_5,
        stops: [{ name: 'רחוק', at: { lat: MUSEUM.at.lat + 0.009, lng: MUSEUM.at.lng } }],
      },
    ];
    const out = fits(
      ctxOf([{ item: idea({ id: 'oden' }), at: nearMuseum }], { date: DAY_1, days: twoNear }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].reason).toMatchObject({ date: DAY_4 });
  });

  // "It fits today" is `near-the-day`'s sentence, not a second opinion on it. Note what this
  // does NOT claim: standing on day 4, an idea beside the museum is still ~3km from lunch on
  // days 1 and 5, so it may well propose one of those. The rule is that it never proposes the
  // day you are on — not that it goes quiet there.
  it('never proposes the day being ranked, whatever else it has to say', () => {
    const onDay4 = ctxOf([{ item: idea({ id: 'oden' }), at: nearMuseum }], {
      date: DAY_4,
      days,
      dayStops: [MUSEUM],
    });
    for (const s of fits(onDay4)) {
      expect(s.reason).toMatchObject({ code: SUGGESTION_REASON.FITS_DAY });
      if (s.reason.code === SUGGESTION_REASON.FITS_DAY) expect(s.reason.date).not.toBe(DAY_4);
    }
    // …and with day 4 the only day that has stops, it has nothing left to say.
    expect(
      fits(
        ctxOf([{ item: idea({ id: 'oden' }), at: nearMuseum }], {
          date: DAY_4,
          days: [{ date: DAY_4, stops: [MUSEUM] }],
          dayStops: [MUSEUM],
        }),
      ),
    ).toEqual([]);
  });

  it('says nothing about an idea already pencilled in for a day', () => {
    const aimed = ctxOf([{ item: idea({ id: 'oden', targetDate: DAY_5 }), at: nearMuseum }], {
      date: DAY_1,
      days,
    });
    expect(fits(aimed)).toEqual([]);
  });

  it('says nothing about an idea with no coordinates to measure', () => {
    expect(fits(ctxOf([{ item: idea({ id: 'oden' }) }], { date: DAY_1, days }))).toEqual([]);
  });

  // A proposal with no content is not a proposal: past FAR_M it is "not near this day either".
  it('says nothing when the nearest day is too far to mean anything', () => {
    const faraway = { lat: MUSEUM.at.lat + 0.5, lng: MUSEUM.at.lng };
    expect(
      fits(ctxOf([{ item: idea({ id: 'oden' }), at: faraway }], { date: DAY_1, days })),
    ).toEqual([]);
  });

  // Every surface except the shelf passes no days at all, and must be unaffected.
  it('stays silent with no days given', () => {
    expect(fits(ctxOf([{ item: idea({ id: 'oden' }), at: nearMuseum }]))).toEqual([]);
  });

  it('respects the category filter, like the strategy beside it', () => {
    const ctx = ctxOf([{ item: idea({ id: 'oden', category: 'food' }), at: nearMuseum }], {
      date: DAY_1,
      days,
      category: 'nature',
    });
    expect(fits(ctx)).toEqual([]);
  });
});

// **One suggestion per thing suggested.** Two strategies can point at the same idea — the two
// LOCAL ones do, by design — and a consumer maps a suggestion to a ROW, so a duplicate ref is a
// duplicate row. First wins, which is why registry order is a decision and not an accident.
describe('merging, when two strategies name the same idea', () => {
  const DAY_4 = '2026-07-23';
  const nearMuseum = { lat: MUSEUM.at.lat + 300 / 111_320, lng: MUSEUM.at.lng };
  const days = [{ date: DAY_4, stops: [MUSEUM] }];

  it('emits each idea exactly once', () => {
    const ctx = ctxOf(
      [{ item: idea({ id: 'oden' }), at: nearMuseum }, { item: idea({ id: 'plain' }) }],
      { days },
    );
    expect(ids(ctx).sort()).toEqual(['oden', 'plain']);
  });

  // `fits-a-day` is registered FIRST, so for the idea it can speak about, its sentence is the
  // one that survives — and that idea leads the pool. Registered second it would be dead code,
  // because `near-the-day` emits every idea and would win every ref.
  it('lets fits-a-day own the reason for the idea it can speak about, and lead', () => {
    const ctx = ctxOf(
      [{ item: idea({ id: 'plain' }) }, { item: idea({ id: 'oden' }), at: nearMuseum }],
      { days },
    );
    const out = suggestFor(ctx, SUGGESTION_PLACEMENT.LOCAL);
    expect(out[0].source).toBe(SUGGESTION_SOURCE.FITS_A_DAY);
    expect(out[0].reason.code).toBe(SUGGESTION_REASON.FITS_DAY);
    expect(out.filter((s) => s.source === SUGGESTION_SOURCE.NEAR_THE_DAY)).toHaveLength(1);
  });

  // The dedupe runs BEFORE the limit, or a duplicate would spend one of the N slots.
  it('does not let a duplicate spend one of the limited slots', () => {
    const ctx = ctxOf(
      [{ item: idea({ id: 'oden' }), at: nearMuseum }, { item: idea({ id: 'plain' }) }],
      { days, limit: 2 },
    );
    expect(ids(ctx).sort()).toEqual(['oden', 'plain']);
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
