// @vitest-environment jsdom
//
// The card's contract is four claims, each a rule rather than a rendering detail (ADR-0218):
// the mark is the provider's own `symbol_code` through a lookup and not something the app draws
// (§7); precipitation is an AMOUNT and the copy may not imply a chance; a day past the horizon
// is a dashed placeholder rather than an error or a zero (§5); and a null view is no card at all
// (§4) — there is no error state anywhere on this surface.
//
// Queried by `t.*` and never by a copy literal (`frontend/CLAUDE.md`).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FORECAST_GLYPH } from '@waypoint/shared';
import { WeatherCard } from './WeatherCard';
import { t } from '../../i18n/he';
import { ltrIsolate } from '../../lib/bidi';
import type { WeatherView } from '../../lib/weather-view';

const LABELS = {
  '2026-09-03': t.weather.today,
  '2026-09-04': t.weather.tomorrow,
  '2026-09-05': t.weather.weekday('ש'),
};

const view = (over: Partial<WeatherView> = {}): WeatherView => ({
  head: {
    date: '2026-09-03',
    place: 'טוקיו',
    beyond: false,
    glyph: FORECAST_GLYPH.partlycloudy.day,
    symbolCode: 'partlycloudy_day',
    tempMax: 29,
    tempMin: 21,
    precipMm: 0,
  },
  days: [
    {
      date: '2026-09-03',
      place: 'טוקיו',
      beyond: false,
      glyph: FORECAST_GLYPH.partlycloudy.day,
      symbolCode: 'partlycloudy_day',
      tempMax: 29,
      tempMin: 21,
      precipMm: 0,
    },
    {
      date: '2026-09-04',
      place: 'האקונה',
      beyond: false,
      glyph: FORECAST_GLYPH.rain.day,
      symbolCode: 'lightrain',
      tempMax: 24,
      tempMin: 19,
      precipMm: 3.2,
    },
    { date: '2026-09-05', place: 'קיוטו', beyond: true },
  ],
  ...over,
});

describe('WeatherCard', () => {
  afterEach(cleanup);

  it('renders nothing at all for a null view — absent, never approximate', () => {
    const { container } = render(<WeatherCard view={null} dayLabels={LABELS} />);
    expect(container.innerHTML).toBe('');
  });

  it('states the head’s high, its low and its condition in words', () => {
    // Scoped to the head's own classes: the strip repeats the same numbers one row down, so an
    // unscoped query would match today's tile as readily as the head and pass either way.
    const { container } = render(<WeatherCard view={view()} dayLabels={LABELS} />);
    expect(container.querySelector('.wx-temp')?.textContent).toContain('29°');
    expect(container.querySelector('.wx-cond')?.textContent).toBe(t.weather.condition.partlycloudy);
    expect(container.querySelector('.wx-low')?.textContent).toBe(t.weather.low(ltrIsolate('21°')));
  });

  it('carries the provider’s own mark, and never one the app draws', () => {
    // §7: the app does not compute a condition, MET Norway does — so the mark is a fact
    // received, which is the category the design language keeps as emoji. `SunGlyph` next door
    // is drawn because its tiles are slices of the gradient above them; this card has no
    // illustration to draw from. There must be no `<svg>` here.
    const { container } = render(<WeatherCard view={view()} dayLabels={LABELS} />);
    expect(container.querySelector('.wx-glyph')?.textContent).toBe(FORECAST_GLYPH.partlycloudy.day);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('states precipitation as an amount, and says nothing that reads as a chance', () => {
    const v = view();
    const rainy = { ...v, head: { ...v.head, precipMm: 3.2, symbolCode: 'lightrain' as const } };
    const { container } = render(<WeatherCard view={rainy} dayLabels={LABELS} />);
    expect(screen.getByText(t.weather.condPrecip(t.weather.condition.rain, '⁦3.2⁩'))).toBeTruthy();
    // MET publishes no probability of precipitation, so no surface may print one.
    expect(container.textContent).not.toContain('%');
  });

  it('omits the amount entirely on a dry day rather than printing a zero', () => {
    render(<WeatherCard view={view()} dayLabels={LABELS} />);
    expect(screen.getByText(t.weather.condition.partlycloudy)).toBeTruthy();
    expect(screen.queryByText(new RegExp(t.weather.precip('0')))).toBeNull();
  });

  it('names every tile with its own place — the one thing a weather app cannot do', () => {
    render(<WeatherCard view={view()} dayLabels={LABELS} />);
    for (const place of ['טוקיו', 'האקונה', 'קיוטו']) {
      expect(screen.getAllByText(place).length).toBeGreaterThan(0);
    }
  });

  it('draws a day past the horizon as a dashed placeholder, still named, never as an error', () => {
    const { container } = render(<WeatherCard view={view()} dayLabels={LABELS} />);
    const beyond = container.querySelector('.wx-day.beyond');
    expect(beyond).toBeTruthy();
    expect(beyond?.getAttribute('aria-label')).toContain(t.weather.beyond);
    expect(beyond?.textContent).toContain('קיוטו');
    // A regular dash, and never an em dash (root CLAUDE.md's copy rule).
    expect(container.textContent).not.toContain('—');
  });

  it('takes its day labels from the host, which owns the zone and the date grammar', () => {
    render(<WeatherCard view={view()} dayLabels={LABELS} />);
    expect(screen.getByText(t.weather.today)).toBeTruthy();
    expect(screen.getByText(t.weather.tomorrow)).toBeTruthy();
    expect(screen.getByText(t.weather.weekday('ש'))).toBeTruthy();
  });
});
