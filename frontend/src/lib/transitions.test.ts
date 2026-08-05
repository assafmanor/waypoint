// The mid-span words (session 215). The keys and the journey/held distinction are the
// shared profile's and are tested there; what this file covers is the half that lives on
// the frontend — that a key resolves to Hebrew, that every key the profile can hand over
// actually exists in `i18n/he.ts`, and that a mode with no middle answers `undefined`
// rather than a placeholder.
//
// The missing-key case is why this is worth a file: `midSpanWord` falls back to the key
// itself, so a profile that names a word nobody wrote would put `transitLive` on the
// app's loudest surface instead of failing.
import { describe, expect, it } from 'vitest';
import { eventMidSpan, type TripEvent } from '@waypoint/shared';
import { eventMidSpanWords, midSpanWord } from './transitions';
import { t } from '../i18n/he';

const ev = (partial: Partial<TripEvent>): TripEvent => ({
  id: 'ev',
  tripId: 't',
  date: '2026-08-05',
  title: 'x',
  kind: 'hard',
  status: 'planned',
  source: 'manual',
  sortOrder: 1,
  createdAt: '2026-08-05T00:00:00Z',
  updatedAt: '2026-08-05T00:00:00Z',
  updatedBy: 'u',
  ...partial,
});

const flight = ev({ category: 'transport', icon: '✈️' });
const train = ev({ category: 'transport', icon: '🚆' });
const hire = ev({ category: 'transport', icon: '🚗' });

describe('eventMidSpanWords', () => {
  it('gives a flight its own live word and the shared label', () => {
    expect(eventMidSpanWords(flight)).toEqual({
      kind: 'journey',
      live: t.board.midSpan.flightLive,
      label: t.board.midSpan.transitLabel,
    });
  });

  // The defect this shipped to fix: `בטיסה` was a literal on the board, so a train in
  // motion announced itself as a flight.
  it('gives every other mode that carries you the generic word', () => {
    expect(eventMidSpanWords(train)).toEqual({
      kind: 'journey',
      live: t.board.midSpan.transitLive,
      label: t.board.midSpan.transitLabel,
    });
    expect(eventMidSpanWords(train)?.live).not.toBe(t.board.midSpan.flightLive);
  });

  it('marks a car hire as held, with the car’s own words', () => {
    expect(eventMidSpanWords(hire)).toEqual({
      kind: 'held',
      live: t.board.midSpan.carHoldLive,
      label: t.board.midSpan.carHoldLabel,
    });
  });

  it('is undefined for anything whose middle does not surface', () => {
    expect(eventMidSpanWords(ev({ category: 'food' }))).toBeUndefined();
    expect(eventMidSpanWords(ev({ category: undefined }))).toBeUndefined();
  });

  // Every key the profile can produce must have Hebrew behind it: the resolver falls back
  // to the key, and a key is not a word.
  it('has copy for every mid-span key the profile can hand over', () => {
    const events = [
      flight,
      train,
      hire,
      ev({ category: 'transport' }),
      ev({ category: 'lodging', icon: '🏨' }),
    ];
    for (const event of events) {
      const mid = eventMidSpan(event)!;
      for (const key of [mid.liveKey, mid.labelKey]) {
        expect(midSpanWord(key), key).not.toBe(key);
      }
    }
  });
});
