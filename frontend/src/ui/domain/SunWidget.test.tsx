// @vitest-environment jsdom
//
// The widget's contract, and every case in it is one the design had to decide:
// the polar states are drawn rather than blanked, the half-open golden hour
// reads as open rather than as `A–undefined`, and the arc stays on the correct
// side of the horizon so the picture agrees with the words under it.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { dayLight, type LatLng } from '@waypoint/shared';
import { skyStops, sunArc } from '../../lib/daylight-view';
import { t } from '../../i18n/he';
import { SunWidget } from './SunWidget';

const TEL_AVIV: LatLng = { lat: 32.0853, lng: 34.7818 };
const TROMSO: LatLng = { lat: 69.6492, lng: 18.9553 };

const localMidnight = (iso: string, offsetHours: number) =>
  Date.parse(`${iso}T00:00:00.000Z`) - offsetHours * 3_600_000;

afterEach(cleanup);

/** Renders the widget the way `Home` does: one place, one day, one clock. */
function widget(at: LatLng, date: string, offset: number, nowMs: number | null = null) {
  const dayStartMs = localMidnight(date, offset);
  const light = dayLight(at, dayStartMs);
  const hhmm = (ms: number | null) =>
    ms === null ? null : new Date(ms + offset * 3_600_000).toISOString().slice(11, 16);
  return {
    light,
    container: render(
      <SunWidget
        light={light}
        arc={sunArc(at, dayStartMs, light, nowMs)}
        sky={skyStops(dayStartMs, light)}
        times={{
          sunrise: hhmm(light.sunriseMs),
          sunset: hhmm(light.sunsetMs),
          goldenStart: hhmm(light.goldenEveningStartMs),
          goldenEnd: hhmm(light.goldenEveningEndMs),
        }}
      />,
    ).container,
  };
}

describe('SunWidget — an ordinary day', () => {
  it('prints sunrise and sunset, and the golden hour between them', () => {
    widget(TEL_AVIV, '2026-09-02', 3);
    // Matched by regex, not by an exact string: every numeric run here is
    // wrapped in U+2066/U+2069 by `ltrIsolate` (ADR-0118), so the text node is
    // `⁦06:17⁩` and an equality assertion would be asserting the isolate away.
    expect(screen.getByText(/06:17/)).toBeTruthy();
    expect(screen.getByText(/19:04/)).toBeTruthy();
    // The range is one isolated LTR run, so it is asserted as one string.
    expect(screen.getByText(/18:32–19:19/)).toBeTruthy();
  });

  it('draws the arc crossing the horizon, with a lit run above it', () => {
    const { container } = widget(TEL_AVIV, '2026-09-02', 3);
    expect(container.querySelector('.sun-arc')).toBeTruthy();
    expect(container.querySelector('.sun-arc-lit')).toBeTruthy();
    expect(container.querySelector('.sun-horizon')).toBeTruthy();
  });

  it('marks now only when the day has one', () => {
    const noon = localMidnight('2026-09-02', 3) + 12 * 3_600_000;
    expect(
      widget(TEL_AVIV, '2026-09-02', 3, noon).container.querySelector('.sun-disc'),
    ).toBeTruthy();
    cleanup();
    // A day being browsed is not today: drawing a disc would put the sun at a
    // position the clock is nowhere near.
    expect(widget(TEL_AVIV, '2026-09-02', 3, null).container.querySelector('.sun-disc')).toBeNull();
  });
});

describe('SunWidget — the polar states are drawn, not blanked', () => {
  it('midnight sun says so, and draws no times', () => {
    const { container, light } = widget(TROMSO, '2026-06-21', 2);
    expect(light.polar).toBe('day');
    expect(container.querySelector('.sf-polar')).toBeTruthy();
    // Queried by key, never by a copy literal (`frontend/CLAUDE.md`): a
    // rewording pass must not cost a red test with no defect behind it.
    expect(screen.getByText(t.sun.polarDay)).toBeTruthy();
    // No clock is printed, because there is no crossing to print.
    expect(container.querySelector('.sf-t')).toBeNull();
  });

  it('polar night says the opposite thing', () => {
    widget(TROMSO, '2026-12-21', 1);
    expect(screen.getByText(t.sun.polarNight)).toBeTruthy();
  });

  it('the arc still renders on a polar day — that IS the statement', () => {
    const { container } = widget(TROMSO, '2026-06-21', 2);
    const path = container.querySelector('.sun-arc')?.getAttribute('d') ?? '';
    expect(path.length).toBeGreaterThan(0);
  });
});

describe('SunWidget — a half-open golden hour reads as open', () => {
  /**
   * At Tromsø in June the sun drops below +6° and never reaches −4°, so the
   * evening has a start and no end. A naive range prints `22:35–undefined`; the
   * chip has to say the interval is open instead.
   */
  it('says "from HH:MM" rather than printing a range with a missing end', () => {
    const dayStartMs = localMidnight('2026-06-21', 2);
    const light = dayLight(TROMSO, dayStartMs);
    expect(light.goldenEveningStartMs).not.toBeNull();
    expect(light.goldenEveningEndMs).toBeNull();

    const { container } = render(
      <SunWidget
        light={{ ...light, polar: null }}
        arc={sunArc(TROMSO, dayStartMs, light, null)}
        sky={skyStops(dayStartMs, light)}
        times={{ sunrise: '00:00', sunset: '23:59', goldenStart: '22:35', goldenEnd: null }}
      />,
    );
    expect(container.textContent).toContain('22:35');
    expect(container.textContent).not.toContain('undefined');
    expect(container.textContent).not.toContain('22:35–');
  });

  it('draws no golden chip at all when there is no golden hour to state', () => {
    const dayStartMs = localMidnight('2026-12-21', 1);
    const light = dayLight(TROMSO, dayStartMs);
    const { container } = render(
      <SunWidget
        light={{ ...light, polar: null }}
        arc={sunArc(TROMSO, dayStartMs, light, null)}
        sky={skyStops(dayStartMs, light)}
        times={{ sunrise: null, sunset: null, goldenStart: null, goldenEnd: null }}
      />,
    );
    // Absent, not a dash — ADR-0045's rule for a fact the app does not have.
    expect(container.querySelector('.sf-gold')).toBeNull();
  });
});
