import { describe, expect, it } from 'vitest';
import {
  FORECAST_CONDITION,
  FORECAST_GLYPH,
  FORECAST_MAX_AGE_AHEAD_MS,
  FORECAST_MAX_AGE_TODAY_MS,
  forecastCell,
  forecastCellCoord,
  forecastCondition,
  forecastDayAt,
  forecastGlyph,
  forecastSeverity,
  isForecastFresh,
  isNightSymbol,
  type Forecast,
} from './weather';

describe('forecastCell', () => {
  it('rounds to the 0.1° grid', () => {
    expect(forecastCell(35.6762, 139.6503)).toBe('35.7,139.7');
    expect(forecastCell(32.0853, 34.7818)).toBe('32.1,34.8');
  });

  it('puts two stops in one city in one cell, and two cities in two', () => {
    // Shibuya and Shinjuku — one anchor for the day, so one fetch.
    expect(forecastCell(35.6595, 139.7005)).toBe(forecastCell(35.6938, 139.7034));
    expect(forecastCell(35.6762, 139.6503)).not.toBe(forecastCell(35.2324, 139.1069));
  });

  it('normalises negative zero, so the equator is not two cells', () => {
    expect(forecastCell(-0.02, -0.03)).toBe('0.0,0.0');
    expect(forecastCell(0.02, 0.03)).toBe('0.0,0.0');
  });

  it('round-trips through forecastCellCoord', () => {
    expect(forecastCellCoord(forecastCell(-33.8688, 151.2093))).toEqual({
      lat: -33.9,
      lng: 151.2,
    });
    expect(forecastCellCoord('nonsense')).toBeUndefined();
  });
});

describe('forecastCondition', () => {
  it('reads MET’s combinatorial codes, most severe marker first', () => {
    expect(forecastCondition('clearsky_day')).toBe(FORECAST_CONDITION.CLEAR);
    expect(forecastCondition('fair_night')).toBe(FORECAST_CONDITION.FAIR);
    expect(forecastCondition('partlycloudy_day')).toBe(FORECAST_CONDITION.PARTLY_CLOUDY);
    expect(forecastCondition('cloudy')).toBe(FORECAST_CONDITION.CLOUDY);
    expect(forecastCondition('lightrain')).toBe(FORECAST_CONDITION.RAIN);
    expect(forecastCondition('heavyrainshowers_day')).toBe(FORECAST_CONDITION.RAIN_SHOWERS);
    expect(forecastCondition('heavyrainshowersandthunder_day')).toBe(FORECAST_CONDITION.THUNDER);
    expect(forecastCondition('lightsleetshowers_night')).toBe(FORECAST_CONDITION.SLEET);
    expect(forecastCondition('heavysnowandthunder')).toBe(FORECAST_CONDITION.THUNDER);
    expect(forecastCondition('fog')).toBe(FORECAST_CONDITION.FOG);
  });

  it('classifies the two codes MET itself misspells', () => {
    // `lightssleetshowersandthunder` / `lightssnowshowersandthunder` are in the
    // published list with the doubled `s`. An enumeration would miss both.
    expect(forecastCondition('lightssleetshowersandthunder_day')).toBe(FORECAST_CONDITION.THUNDER);
    expect(forecastCondition('lightssnowshowersandthunder_night')).toBe(FORECAST_CONDITION.THUNDER);
  });

  it('degrades an unknown code to cloudy, never to a sun', () => {
    expect(forecastCondition('meteor_shower_day')).toBe(FORECAST_CONDITION.CLOUDY);
  });
});

describe('forecastSeverity', () => {
  it('orders by what changes a plan, not by meteorology', () => {
    expect(forecastSeverity('heavyrainandthunder')).toBeLessThan(forecastSeverity('rain'));
    expect(forecastSeverity('lightrain')).toBeLessThan(forecastSeverity('rainshowers_day'));
    expect(forecastSeverity('cloudy')).toBeLessThan(forecastSeverity('clearsky_day'));
  });

  it('ranks an unrecognised code as cloudy, so it cannot outrank rain', () => {
    expect(forecastSeverity('unheard_of')).toBe(forecastSeverity('cloudy'));
    expect(forecastSeverity('unheard_of')).toBeGreaterThan(forecastSeverity('lightrain'));
  });
});

describe('forecastGlyph', () => {
  it('honours the provider’s own day/night variant', () => {
    expect(isNightSymbol('clearsky_night')).toBe(true);
    expect(isNightSymbol('clearsky_day')).toBe(false);
    expect(forecastGlyph('clearsky_day')).toBe(FORECAST_GLYPH.clear.day);
    expect(forecastGlyph('clearsky_night')).toBe(FORECAST_GLYPH.clear.night);
  });

  it('covers every condition in both variants', () => {
    for (const pair of Object.values(FORECAST_GLYPH)) {
      expect(pair.day.length).toBeGreaterThan(0);
      expect(pair.night.length).toBeGreaterThan(0);
    }
  });
});

describe('isForecastFresh', () => {
  const issued = '2026-09-03T06:00:00Z';
  const at = (hoursLater: number) => Date.parse(issued) + hoursLater * 3_600_000;

  it('holds today to 6 hours and everything beyond to 24', () => {
    expect(isForecastFresh(issued, at(5), true)).toBe(true);
    expect(isForecastFresh(issued, at(7), true)).toBe(false);
    expect(isForecastFresh(issued, at(7), false)).toBe(true);
    expect(isForecastFresh(issued, at(25), false)).toBe(false);
  });

  it('reads the bounds off the exported constants', () => {
    expect(isForecastFresh(issued, Date.parse(issued) + FORECAST_MAX_AGE_TODAY_MS, true)).toBe(
      true,
    );
    expect(isForecastFresh(issued, Date.parse(issued) + FORECAST_MAX_AGE_AHEAD_MS + 1, false)).toBe(
      false,
    );
  });

  it('treats a clock disagreement as fresh, not as an error', () => {
    expect(isForecastFresh(issued, at(-3), true)).toBe(true);
  });

  it('treats an unparseable issue time as stale', () => {
    expect(isForecastFresh('not a date', at(0), true)).toBe(false);
  });
});

describe('forecastDayAt', () => {
  const forecast: Forecast = {
    provider: 'Data from MET Norway',
    providerUrl: 'https://www.met.no/',
    cells: [
      {
        cell: '35.7,139.7',
        zone: 'Asia/Tokyo',
        issuedAt: '2026-09-03T05:00:00Z',
        days: [
          {
            date: '2026-09-03',
            symbolCode: 'partlycloudy_day',
            tempMax: 29,
            tempMin: 21,
            precipMm: 0,
          },
        ],
      },
    ],
  };

  it('finds a day at a cell', () => {
    expect(forecastDayAt(forecast, '35.7,139.7', '2026-09-03')?.day.tempMax).toBe(29);
  });

  it('answers undefined for a day past the horizon, a cell we hold nothing for, and no forecast', () => {
    expect(forecastDayAt(forecast, '35.7,139.7', '2026-09-30')).toBeUndefined();
    expect(forecastDayAt(forecast, '48.9,2.3', '2026-09-03')).toBeUndefined();
    expect(forecastDayAt(null, '35.7,139.7', '2026-09-03')).toBeUndefined();
    expect(forecastDayAt(forecast, undefined, '2026-09-03')).toBeUndefined();
  });
});
