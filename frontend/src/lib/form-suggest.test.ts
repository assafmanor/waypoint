// **The suggestion table** (ADR-0203 §5/§8). What is worth pinning is the MECHANISM's
// properties — at most one, null is ordinary, and the filter can only ever remove — because
// those are what make offering anything on a hard commitment defensible.
import { describe, expect, it } from 'vitest';
import type { Place } from '@waypoint/shared';
import {
  DATE_SOURCES,
  PLACE_SOURCES,
  suggest,
  tripEdgeFor,
  type SuggestContext,
} from './form-suggest';

const place = (id: string, name: string, timezone?: string): Place => ({
  id,
  tripId: 't1',
  name,
  timezone,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'u1',
});

const TLV = place('tlv', 'Ben Gurion', 'Asia/Jerusalem');
const KEF = place('kef', 'Keflavík', 'Atlantic/Reykjavik');
const AEY = place('aey', 'Akureyri', 'Atlantic/Reykjavik');

const WORDS = {
  tripStart: 'תחילת הטיול',
  tripEnd: 'סוף הטיול',
  afterPrevious: 'יום הקטע הקודם',
  fromOutbound: 'מההלוך',
  fromReturn: 'מהחזרה',
};

const ctx = (over: Partial<SuggestContext> = {}): SuggestContext => ({
  destination: { name: 'Iceland', timezone: 'Atlantic/Reykjavik', countryCode: 'IS' },
  trip: { startDate: '2026-08-12', endDate: '2026-08-21' },
  legs: [],
  words: WORDS,
  ...over,
});

describe('tripEdgeFor (ADR-0203 §5) — which edge, or none', () => {
  it('reads the way there and the way home off the destination', () => {
    expect(tripEdgeFor(ctx({ from: TLV, to: KEF }))).toBe('out');
    expect(tripEdgeFor(ctx({ from: KEF, to: TLV }))).toBe('back');
  });

  it('answers NOTHING for an internal hop, where the trip edges are the wrong answer', () => {
    expect(tripEdgeFor(ctx({ from: KEF, to: AEY }))).toBe(null);
  });

  it('answers nothing when neither end can be placed — the degradation, not a guess', () => {
    expect(tripEdgeFor(ctx({ from: place('a', 'Downtown'), to: place('b', 'The Quay') }))).toBe(
      null,
    );
    expect(tripEdgeFor(ctx())).toBe(null);
  });
});

describe('DATE_SOURCES — one suggestion, and the priority is the point', () => {
  it('offers the trip start for the way there and the end for the way home', () => {
    expect(suggest(DATE_SOURCES, ctx({ from: TLV, to: KEF }))).toMatchObject({
      value: '2026-08-12',
      label: WORDS.tripStart,
      source: 'trip-edge',
    });
    expect(suggest(DATE_SOURCES, ctx({ from: KEF, to: TLV }))?.value).toBe('2026-08-21');
  });

  it('prefers where the previous leg landed over the trip edge', () => {
    // A mid-trip journey continues from the last one; the trip's edges are about its ends.
    const hit = suggest(DATE_SOURCES, ctx({ from: TLV, to: KEF, previousLanded: '2026-08-15' }));
    expect(hit).toMatchObject({ value: '2026-08-15', source: 'previous-leg' });
  });

  it('offers NOTHING when no source answers, which is an ordinary state', () => {
    expect(suggest(DATE_SOURCES, ctx({ from: KEF, to: AEY }))).toBe(null);
    expect(suggest(DATE_SOURCES, ctx())).toBe(null);
  });

  it('marks a date as mono, because a numeral is not a word', () => {
    // The trap `value-token.css` keeps a `word` tone for: Hebrew in the mono face has no
    // glyphs and falls back to different metrics.
    expect(suggest(DATE_SOURCES, ctx({ from: TLV, to: KEF }))?.mono).toBe(true);
    expect(
      suggest(DATE_SOURCES, ctx({ from: TLV, to: KEF, previousLanded: '2026-08-15' }))?.mono,
    ).toBeUndefined();
  });
});

describe('PLACE_SOURCES (ADR-0203 §8) — the owner’s own example', () => {
  const withOutbound = { legs: [{ from: TLV, to: KEF }] };

  it('suggests the return’s ARRIVAL from where the outbound started', () => {
    // "suggest the arrival airport for the return flight if we have the flight to the
    // destination" — this is that sentence, as a spec.
    expect(suggest(PLACE_SOURCES, ctx({ ...withOutbound, role: 'to' }))).toMatchObject({
      value: TLV,
      label: 'Ben Gurion',
      detail: WORDS.fromOutbound,
      source: 'mirror-existing-leg',
    });
  });

  it('suggests the return’s DEPARTURE from where the outbound landed', () => {
    expect(suggest(PLACE_SOURCES, ctx({ ...withOutbound, role: 'from' }))?.value).toBe(KEF);
  });

  it('reads the mirror the other way when the trip only has a leg going home', () => {
    const withReturn = { legs: [{ from: KEF, to: TLV }] };
    expect(suggest(PLACE_SOURCES, ctx({ ...withReturn, role: 'from' }))).toMatchObject({
      value: TLV,
      detail: WORDS.fromReturn,
    });
    expect(suggest(PLACE_SOURCES, ctx({ ...withReturn, role: 'to' }))?.value).toBe(KEF);
  });

  it('offers nothing on the FIRST journey of a trip, which has nothing to mirror', () => {
    // The gap ADR-0203 §8 leaves open deliberately: only a trip's very first endpoint has no
    // source, and closing it needs a cross-trip place memory `Place` is not.
    expect(suggest(PLACE_SOURCES, ctx({ role: 'from' }))).toBe(null);
    expect(suggest(PLACE_SOURCES, ctx({ role: 'to' }))).toBe(null);
  });

  it('offers nothing for an interior stop, which is not an end of the journey', () => {
    expect(suggest(PLACE_SOURCES, ctx({ ...withOutbound }))).toBe(null);
  });

  it('offers nothing when the trip’s legs cannot be placed either', () => {
    const vague = { legs: [{ from: place('a', 'Downtown'), to: place('b', 'The Quay') }] };
    expect(suggest(PLACE_SOURCES, ctx({ ...vague, role: 'from' }))).toBe(null);
  });
});
