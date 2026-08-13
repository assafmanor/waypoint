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
import { edgeSentence, edgeTimePhrase, eventMidSpanWords, midSpanWord } from './transitions';
import { withoutBidiControls } from './bidi';
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

// **What an edge SAYS**, written once because two surfaces now say it (the day's transition
// row and the ambient strip above the list). The words themselves are ADR-0171 §3's and were
// tested on the row; what this file owns is that one function produces them, and that the
// numeric run is isolated — which is the half a screenshot cannot show.
const TZ = 'Asia/Jerusalem';
const stay = ev({
  category: 'lodging',
  icon: '🏨',
  date: '2026-09-15',
  endDate: '2026-09-18',
  startsAt: '2026-09-15T12:00:00Z', // 15:00 local
  endsAt: '2026-09-18T08:00:00Z', // 11:00 local
});
const at = (iso: string) => Date.parse(iso);

describe('edgeTimePhrase', () => {
  it('marks a floor and a ceiling, and leaves `exact` alone', () => {
    expect(withoutBidiControls(edgeTimePhrase(stay, 'start', at(stay.startsAt!), TZ))).toBe(
      'מ-15:00',
    );
    expect(withoutBidiControls(edgeTimePhrase(stay, 'end', at(stay.endsAt!), TZ))).toBe('עד 11:00');
    // A flight's ends are instants, so the clock stands unqualified — marking it would put a
    // word on nearly every row in the app to say "normal".
    expect(withoutBidiControls(edgeTimePhrase(flight, 'start', at(stay.startsAt!), TZ))).toBe(
      '15:00',
    );
  });

  it('reads a window as its two AUTHORED numbers, whatever `atMs` says', () => {
    const windowed = { ...stay, startWindowEnd: '2026-09-15T18:00:00Z' }; // 15:00–21:00 local
    expect(withoutBidiControls(edgeTimePhrase(windowed, 'start', at(stay.startsAt!), TZ))).toBe(
      '15:00–21:00',
    );
    // **The bug this assertion caught.** `atMs` is where `edgeAt` PLACED the row, which for a
    // windowed edge is not one of the window's ends — so building the range from it invented a
    // window. Pushed past the window's own close (a leg landing at 23:00) it used to render
    // `21:00–23:00`, hiding that the real window had shut.
    expect(
      withoutBidiControls(edgeTimePhrase(windowed, 'start', at('2026-09-15T20:00:00Z'), TZ)),
    ).toBe('15:00–21:00');
  });

  it('isolates the numeric run in every branch', () => {
    // The strip renders `${label} · ${phrase}` with no `dir`, so a Hebrew word leads and the
    // element resolves RTL — an un-isolated range renders reversed there (ADR-0118). Asserted
    // on the characters, because the eye cannot see this one.
    for (const phrase of [
      edgeTimePhrase(stay, 'start', at(stay.startsAt!), TZ),
      edgeTimePhrase(stay, 'end', at(stay.endsAt!), TZ),
      edgeTimePhrase(
        { ...stay, startWindowEnd: '2026-09-15T18:00:00Z' },
        'start',
        at(stay.startsAt!),
        TZ,
      ),
    ]) {
      expect(phrase, phrase).toContain('⁦');
      expect(phrase, phrase).toContain('⁩');
    }
  });
});

describe('edgeSentence', () => {
  // The report: two guesthouses on one day, one being left and one being arrived at, both
  // reading `לילה 1 מתוך 1` — the same words for opposite events.
  it('names the edge, so a check-in day cannot read like a check-out day', () => {
    const checkIn = edgeSentence(
      { event: stay, edge: 'start', atMs: at(stay.startsAt!), labelKey: 'checkIn' },
      TZ,
    );
    const checkOut = edgeSentence(
      { event: stay, edge: 'end', atMs: at(stay.endsAt!), labelKey: 'checkOut' },
      TZ,
    );
    expect(withoutBidiControls(checkIn)).toBe(`${t.glance.transition.checkIn} · מ-15:00`);
    expect(withoutBidiControls(checkOut)).toBe(`${t.glance.transition.checkOut} · עד 11:00`);
    expect(checkIn).not.toBe(checkOut);
  });

  // The owner listed the car explicitly. It needs no branch here: `transitionLabel` resolves
  // per profile, so `החזרת הרכב` arrives with nobody having thought about cars.
  it('uses each mode’s own words — the car returns, it does not check out', () => {
    const returned = edgeSentence(
      { event: hire, edge: 'end', atMs: at('2026-09-18T15:00:00Z'), labelKey: 'carDropoff' },
      TZ,
    );
    expect(withoutBidiControls(returned)).toBe(`${t.glance.transition.carDropoff} · עד 18:00`);
  });
});
