// The card's view model, and mostly a spec about ADR-0218 §4 — the rule that INVERTS ADR-0180 §4
// for the one case that ADR does not cover. A rate of any age is still the rate; a forecast has
// a shelf life, and past it the widget goes rather than lies.
import { describe, expect, it } from 'vitest';
import {
  FORECAST_GLYPH,
  type Forecast,
  type Place,
  type TripEvent,
  type ZoneEvidence,
} from '@waypoint/shared';
import { weatherView } from './weather-view';

const ISSUED = '2026-09-03T06:00:00Z';
const NOW = Date.parse('2026-09-03T09:00:00Z'); // three hours after the model ran
const TODAY = '2026-09-03';

const place = (over: Partial<Place>): Place =>
  ({
    id: 'p-tokyo',
    tripId: 't1',
    name: 'שיבויה',
    lat: 35.6595,
    lng: 139.7005,
    createdAt: ISSUED,
    updatedAt: ISSUED,
    updatedBy: 'u1',
    ...over,
  }) as Place;

const TOKYO = place({});
const HAKONE = place({ id: 'p-hakone', name: 'האקונה', lat: 35.2324, lng: 139.1069 });

/** An event that PLACES a day at Hakone, which is what makes the day anchor resolve there
 *  rather than to the trip's destination. Only the four fields `dayAnchorCoord` reads matter. */
const hakoneEventOn = (date: string) =>
  ({ id: `e-${date}`, tripId: 't1', date, placeId: HAKONE.id, title: 'אונסן' }) as TripEvent;

const evidence = (places: Place[]): ZoneEvidence => ({
  events: [],
  bookings: [],
  places,
  crossings: [],
  primaryZone: 'Asia/Tokyo',
});

const forecast = (over: Partial<Forecast['cells'][number]> = {}): Forecast => ({
  provider: 'Data from MET Norway',
  providerUrl: 'https://www.met.no/en',
  cells: [
    {
      cell: '35.7,139.7',
      zone: 'Asia/Tokyo',
      issuedAt: ISSUED,
      days: [
        { date: '2026-09-03', symbolCode: 'clearsky_day', tempMax: 29, tempMin: 21, precipMm: 0 },
        { date: '2026-09-04', symbolCode: 'lightrain', tempMax: 24, tempMin: 19, precipMm: 3.2 },
      ],
      ...over,
    },
  ],
});

const input = (over: Partial<Parameters<typeof weatherView>[0]> = {}) => ({
  dates: ['2026-09-03', '2026-09-04', '2026-09-05'],
  evidence: evidence([TOKYO]),
  places: [TOKYO],
  destination: { lat: 35.6762, lng: 139.6503 },
  destinationName: 'טוקיו',
  forecast: forecast(),
  nowMs: NOW,
  today: TODAY,
  ...over,
});

describe('weatherView — the head', () => {
  it('leads with the active day and its own extremes', () => {
    const view = weatherView(input());
    expect(view?.head.date).toBe('2026-09-03');
    expect(view?.head.tempMax).toBe(29);
    expect(view?.head.tempMin).toBe(21);
    expect(view?.head.glyph).toBe(FORECAST_GLYPH.clear.day);
  });

  it('is absent — not empty, not stale — once the head passes the 6-hour bound', () => {
    // §4's whole point: a forecast expires, and the accepted cost is that the card disappears
    // after ~6 hours offline. That is the honest failure, and it is a visible one.
    expect(weatherView(input({ nowMs: Date.parse('2026-09-03T13:00:00Z') }))).toBeNull();
    expect(weatherView(input({ nowMs: Date.parse('2026-09-03T11:59:00Z') }))).not.toBeNull();
  });

  it('is absent when we hold nothing at all, and when there is no anchor', () => {
    expect(weatherView(input({ forecast: null }))).toBeNull();
    expect(
      weatherView(input({ places: [], evidence: evidence([]), destination: undefined })),
    ).toBeNull();
  });

  it('is absent for an empty date range rather than throwing', () => {
    expect(weatherView(input({ dates: [] }))).toBeNull();
  });
});

describe('weatherView — the strip', () => {
  it('draws one tile per date, in order, including the head', () => {
    const view = weatherView(input());
    expect(view?.days.map((d) => d.date)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05']);
  });

  it('names every tile with its own place, which is the whole point of the strip', () => {
    const view = weatherView(input());
    // Shibuya and the trip's destination round to the same cell, so the day is named by the
    // group's own place rather than by the trip's display string.
    expect(view?.days.every((d) => d.place === TOKYO.name)).toBe(true);
  });

  it('falls back to the trip’s destination name when no place of ours sits in the cell', () => {
    const view = weatherView(
      input({ places: [], evidence: evidence([]), destinationName: 'טוקיו' }),
    );
    expect(view?.head.place).toBe('טוקיו');
  });

  it('marks a day past the provider’s horizon as beyond, not as an error or a zero', () => {
    const view = weatherView(input());
    const day5 = view?.days.find((d) => d.date === '2026-09-05');
    expect(day5?.beyond).toBe(true);
    // Still named: a placeless tile would be a weather app's answer wearing this app's chrome.
    expect(day5?.place).toBe(TOKYO.name);
  });

  it('holds a future day to the 24-hour bound while the head keeps the 6-hour one', () => {
    // **The two bounds only diverge when two cells were fetched at different times**, which is
    // exactly why there are two: today's weather is the fact being substituted for a window, and
    // a day-4 forecast barely moves in a day. Hakone's cell is 13h old — dead under today's
    // bound, live under tomorrow-and-beyond's — and the day anchors there because an event
    // places it.
    const stale = '2026-09-02T20:00:00Z'; // 13h before `NOW`
    const hakoneDay = { ...evidence([TOKYO, HAKONE]), events: [hakoneEventOn('2026-09-05')] };
    const view = weatherView(
      input({
        places: [TOKYO, HAKONE],
        evidence: hakoneDay,
        forecast: {
          ...forecast(),
          cells: [
            forecast().cells[0],
            {
              cell: '35.2,139.1',
              zone: 'Asia/Tokyo',
              issuedAt: stale,
              days: [
                {
                  date: '2026-09-05',
                  symbolCode: 'lightrain',
                  tempMax: 22,
                  tempMin: 18,
                  precipMm: 1.1,
                },
              ],
            },
          ],
        },
      }),
    );
    const day5 = view?.days.find((d) => d.date === '2026-09-05');
    expect(view?.head.beyond).toBe(false);
    expect(day5?.beyond).toBe(false);
    expect(day5?.place).toBe(HAKONE.name);
    if (day5?.beyond === false) expect(day5.tempMax).toBe(22);
  });

  it('drops that same 13-hour-old cell when the day it names is TODAY', () => {
    // The mirror of the case above, and what makes it a claim about the two bounds rather than
    // about one: the identical cell age reads live at three days out and dead today.
    const stale = '2026-09-02T20:00:00Z';
    expect(
      weatherView(
        input({
          forecast: {
            ...forecast(),
            cells: [{ ...forecast().cells[0], issuedAt: stale }],
          },
        }),
      ),
    ).toBeNull();
  });

  it('carries precipitation as an amount on the tile that has one', () => {
    const view = weatherView(input());
    const tomorrow = view?.days.find((d) => d.date === '2026-09-04');
    expect(tomorrow?.beyond).toBe(false);
    if (tomorrow?.beyond === false) expect(tomorrow.precipMm).toBe(3.2);
  });
});
