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
import { weekdayLetter } from '../../lib/time';
import type { WeatherView } from '../../lib/weather-view';

// The weekday comes from `weekdayLetter`, exactly as the host supplies it — NOT from a copy
// key. Both halves of this file used to read one wrapper that appended a geresh, so the spec
// agreed with the component about a fact neither had checked and `ש׳׳` shipped (owner report,
// 2026-09-03). Querying by `t.*` is right for a literal and cannot protect a DERIVED string.
const SOURCE = { label: 'Data from MET Norway', href: 'https://www.met.no/en' };

const LABELS = {
  '2026-09-04': t.weather.tomorrow,
  '2026-09-05': weekdayLetter('2026-09-05'),
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
  // The strip starts at TOMORROW: the head is today, and a `היום` tile would repeat its number.
  days: [
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
    const { container } = render(<WeatherCard view={null} source={SOURCE} dayLabels={LABELS} />);
    expect(container.innerHTML).toBe('');
  });

  it('states the head’s high, its low and its condition in words', () => {
    // Scoped to the head's own classes: the strip repeats the same numbers one row down, so an
    // unscoped query would match today's tile as readily as the head and pass either way.
    const { container } = render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    expect(container.querySelector('.wx-temp')?.textContent).toContain('29°');
    expect(container.querySelector('.wx-cond')?.textContent).toContain(
      t.weather.condition.partlycloudy,
    );
    expect(container.querySelector('.wx-low')?.textContent).toBe(t.weather.low(ltrIsolate('21°')));
  });

  it('carries the provider’s own mark, and never one the app draws', () => {
    // §7: the app does not compute a condition, MET Norway does — so the mark is a fact
    // received, which is the category the design language keeps as emoji. `SunGlyph` next door
    // is drawn because its tiles are slices of the gradient above them; this card has no
    // illustration to draw from. There must be no `<svg>` here.
    const { container } = render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    expect(container.querySelector('.wx-glyph')?.textContent).toBe(FORECAST_GLYPH.partlycloudy.day);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('states precipitation as an amount, and says nothing that reads as a chance', () => {
    const v = view();
    const rainy = { ...v, head: { ...v.head, precipMm: 3.2, symbolCode: 'lightrain' as const } };
    const { container } = render(<WeatherCard view={rainy} source={SOURCE} dayLabels={LABELS} />);
    // The head reads `place · condition · amount`; the amount is the run that must survive.
    expect(container.querySelector('.wx-cond')?.textContent).toContain(
      t.weather.condPrecip(t.weather.condition.rain, ltrIsolate('3.2')),
    );
    // MET publishes no probability of precipitation, so no surface may print one.
    expect(container.textContent).not.toContain('%');
  });

  it('omits the amount entirely on a dry day rather than printing a zero', () => {
    const { container } = render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    expect(container.querySelector('.wx-detail')?.textContent).toBe(
      t.weather.condition.partlycloudy,
    );
    expect(container.textContent).not.toContain(t.weather.precip('0'));
  });

  it('names every tile with its own place — the one thing a weather app cannot do', () => {
    render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    for (const place of ['האקונה', 'קיוטו']) {
      expect(screen.getAllByText(place).length).toBeGreaterThan(0);
    }
  });

  it('starts the strip at TOMORROW — the head is today, and a tile for it would repeat it', () => {
    // ADR-0218's amendment §C. The head's number appeared again ⁦60px⁩ down the same card, which
    // is the duplication ADR-0214 measured once and ADR-0215 measured again.
    const { container } = render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    const tiles = [...container.querySelectorAll('.wx-day')];
    expect(tiles).toHaveLength(2);
    // Today's place appears in the HEAD and nowhere in the strip.
    expect(container.querySelector('.wx-days')?.textContent).not.toContain('טוקיו');
    expect(container.querySelector('.wx-where')?.textContent).toBe('טוקיו');
  });

  it('names the place the head speaks for, inside the condition run', () => {
    // ADR-0218's amendment §B: the head follows the LIVE anchor, so on a travel day it is a
    // different place from where the day began — unnamed, that reads as a contradiction.
    const { container } = render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    expect(container.querySelector('.wx-where')?.textContent).toBe('טוקיו');
    expect(container.querySelector('.wx-detail')?.textContent).toBe(
      t.weather.condition.partlycloudy,
    );
    // The separator is chrome between two runs, not part of either.
    expect(container.querySelector('.wx-sep')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the amount in its own run, so the PLACE is what shrinks on a tight line', () => {
    // Measured at 360px in `a-card-carries-its-own-source-v1.html` §6: `place · condition ·
    // amount` overflows, and with one ellipsising run the amount is cut — last in the string
    // and the most actionable fact on the card. jsdom cannot lay this out, so what is asserted
    // here is the structure that makes the CSS able to choose: three runs, not one.
    const v = view();
    const rainy = { ...v, head: { ...v.head, precipMm: 4.1, symbolCode: 'lightrain' as const } };
    const { container } = render(<WeatherCard view={rainy} source={SOURCE} dayLabels={LABELS} />);
    expect(container.querySelector('.wx-where')?.textContent).toBe('טוקיו');
    expect(container.querySelector('.wx-detail')?.textContent).toContain(
      t.weather.precip(ltrIsolate('4.1')),
    );
  });

  it('carries the provider’s own credit INSIDE the card, linked', () => {
    // ADR-0218's amendment §A. Inside, because neither card is a `<button>` any more; linked,
    // because the terms require it; verbatim, because the wording is the source's.
    const { container } = render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    const link = container.querySelector('.wx-widget .card-src-link');
    expect(link?.textContent).toBe(SOURCE.label);
    expect(link?.getAttribute('href')).toBe(SOURCE.href);
  });

  it('omits the source line rather than inventing one when nothing is held', () => {
    const { container } = render(<WeatherCard view={view()} source={null} dayLabels={LABELS} />);
    expect(container.querySelector('.card-src')).toBeNull();
  });

  it('draws a day past the horizon as a dashed placeholder, still named, never as an error', () => {
    const { container } = render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    const beyond = container.querySelector('.wx-day.beyond');
    expect(beyond).toBeTruthy();
    expect(beyond?.getAttribute('aria-label')).toContain(t.weather.beyond);
    expect(beyond?.textContent).toContain('קיוטו');
    // A regular dash, and never an em dash (root CLAUDE.md's copy rule).
    expect(container.textContent).not.toContain('—');
  });

  it('takes its day labels from the host, which owns the zone and the date grammar', () => {
    render(<WeatherCard view={view()} source={SOURCE} dayLabels={LABELS} />);
    expect(screen.getByText(t.weather.tomorrow)).toBeTruthy();
    expect(screen.getByText(weekdayLetter('2026-09-05'))).toBeTruthy();
  });
});
