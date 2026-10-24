// **A FINISHED TRIP WEARS NO PLAN VIOLET** (ADR-0240, root rule 4: violet is plan mode's alone).
// A finished trip still reads `data-mode='plan'` for its light-band layout, so every rule that
// paints violet under that attribute reaches it unless something says otherwise — and the misses
// are invisible to jsdom. The build found five by probing the rendered app (the Home's interim hero, the
// Map's scope chip, the Index filter pills, the overlap cluster, two focus rings), so this walks
// the same surfaces in both themes and fails on any painted colour in violet's hue range.
//
// Two decorative ramps are allowed to sit near violet and are skipped by class: the lodging
// category pin (`--cat-lodging`) and the plum avatar (`--id-plum`), which design-language.md
// separates from the semantic hues by chroma, not angle.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, TWO_TYPE_BOOKINGS } from './boot';

const START = '2026-05-01';
const END = '2026-05-03';
const NOW = Date.parse('2026-05-07T03:00:00.000Z');

const stamp = {
  tripId: 't1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const place = (id: string, name: string, lng: number) => ({ id, name, lat: 35.66, lng, ...stamp });
const event = (id: string, placeId: string, time: string, end: string, status: string) => ({
  id,
  date: '2026-05-02',
  startsAt: `2026-05-02T${time}:00.000Z`,
  endsAt: `2026-05-02T${end}:00.000Z`,
  title: `${id} plan`,
  kind: 'soft',
  status,
  placeId,
  sortOrder: 0,
  source: 'manual',
  ...stamp,
});

/** Every painted colour in violet's hue range, as `selector · property · value`. */
async function violet(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lch = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => lin(v / 255));
      const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
      const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
      const a = 500 * (f(X) - f(Y));
      const bb = 200 * (f(Y) - f(Z));
      const h = (Math.atan2(bb, a) * 180) / Math.PI;
      return { c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
    };
    const colours = (s: string) => {
      const out: number[][] = [];
      for (const m of s.matchAll(/rgba?\(([^)]+)\)/g)) {
        const p = m[1]
          .split(/[ ,/]+/)
          .filter(Boolean)
          .map(Number);
        if ((p[3] ?? 1) > 0.02) out.push(p.slice(0, 3));
      }
      for (const m of s.matchAll(/srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/g))
        if ((m[4] === undefined ? 1 : +m[4]) > 0.02)
          out.push([+m[1] * 255, +m[2] * 255, +m[3] * 255]);
      return out;
    };
    const props = [
      'color',
      'backgroundColor',
      'backgroundImage',
      'borderTopColor',
      'boxShadow',
      'outlineColor',
      'stroke',
      'fill',
    ] as const;
    const hits: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('canvas, .cat-lodging, .wp-av')) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const cs = getComputedStyle(el);
      for (const prop of props) {
        const value = cs[prop];
        if (!value || value === 'none') continue;
        if (prop === 'borderTopColor' && cs.borderTopWidth === '0px') continue;
        if (prop === 'outlineColor' && cs.outlineStyle === 'none') continue;
        // Plan's hues sit at 300–303° (its band's chroma is 15); the app's navy ink sits at
        // 281°, and rose at ~350°, so this window holds violet and nothing else of ours.
        if (
          colours(value).some((rgb) => {
            const { c, h } = lch(rgb);
            return c > 10 && h >= 290 && h <= 325;
          })
        )
          hits.push(
            `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} · ${prop} · ${value.slice(0, 60)}`,
          );
      }
    }
    return hits;
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a finished trip paints no plan violet · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.addInitScript((th) => localStorage.setItem('waypoint:theme', th), theme);
    await bootIntoTrip(page, {
      now: NOW,
      dates: { startDate: START, endDate: END },
      bookings: TWO_TYPE_BOOKINGS,
      places: [place('pl-1', 'Bar', 139.7), place('pl-2', 'Club', 139.71)],
      // A done row overlapped by a skipped one: the pair that drew plan's violet cluster.
      events: [
        event('ev-done', 'pl-1', '11:00', '12:00', 'done'),
        event('ev-skip', 'pl-2', '11:30', '12:30', 'skipped'),
      ],
    });

    const surfaces: [string, string, string][] = [
      ['home', '/?trip=t1&tab=home', '.mem-cover'],
      ['days', '/?trip=t1&tab=days&day=2026-05-02', '.bld'],
      ['map', '/?trip=t1&tab=map', '.map-screen'],
      ['index', '/?trip=t1&tab=index', '.archive-banner'],
    ];
    for (const [name, url, ready] of surfaces) {
      await page.goto(url);
      await expect(page.locator(ready).first()).toBeVisible();
      expect(await violet(page), name).toEqual([]);
    }

    // The filter pills live one level in, on the bookings list.
    await page.locator('.wp-idx-tile').first().click();
    await expect(page.locator('.choice-pill.on')).toBeVisible();
    expect(await violet(page), 'index · bookings').toEqual([]);
  });
}
