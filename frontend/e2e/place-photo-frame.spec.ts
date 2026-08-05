// **THE BADGE BECOMES THE FRAME** (ADR-0167 §1, build plan Phase 4).
//
// A fetched photograph fills the badge's interior and the category hue moves from fill to a
// 2px ring. The claim is that this costs the row **nothing** — no width, no height, no slot —
// because the badge was already there; and that everything the badge already carried survives
// underneath it: the order counter at its corner, the soft grammar, the category.
//
// **This spec is a MEASUREMENT, which is why it is here and not in the unit suite.** Every
// assertion below is about boxes, painted edges and `overflow`, so it needs the real
// stylesheets and a real layout engine: jsdom loads no CSS and reports every rect as zero, so
// `PlaceBadge.test.tsx` can assert the markup and nothing else. Two of the three traps ADR-0167
// records were found by measuring rather than by reading, and one of them (§11.2) survived a
// render pass and needed a human eye on a device:
//
//   §11.2 — `overflow: hidden` on the BADGE clips the order counter into a quarter circle.
//           The photo therefore clips on an inner element, and the badge stays `visible`.
//   §8.1  — an `inset` box-shadow paints below the element's children, so a hue put on the
//           badge is covered by the photo and the badge silently loses its category. The ring
//           is therefore an overlay above the image.
//
// The photo is REAL BYTES, generated below rather than mocked away: a `Content-Type` the
// browser refuses, or a body it cannot decode, gives a broken image whose box measures fine —
// exactly the failure a geometry harness cannot see. The row is asserted to hold a decoded
// image before anything is measured.
//
// What is NOT here, and belongs in the unit suite instead: the badge as the way to the pin. On
// the Map that verb is the place CARD's, not the list row's (ADR-0129 §1) — `renderRow` supplies
// `onFrame` only there — and the card only exists on a rendered canvas, which the hermetic run
// has no key for. So the list badges here are the inert variant, and that a photo leaves the
// handler, the role and the marker intact is asserted in `PlaceBadge.test.tsx`.
import { deflateSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

/* ── a real PNG, built here ──────────────────────────────────────────────────────────────
   PNG rather than JPEG because it can be written by hand: a deflate stream of raw scanlines
   and three CRC'd chunks, all from `node:zlib`, with no image library in the toolchain. The
   sniffer accepts it as a stored type (`image/png` is in the avatar allow-list the pipeline
   reuses), so this is a body the real route could serve.

   Wide on purpose — 3:2, inside the measured 0.54–1.78 aspect range (ADR-0166 §11.4) — because
   a square source would make `object-fit: cover` untestable: the one thing the badge must
   never do is letterbox, and only a non-square image can show it does not. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function chunk(type: string, body: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  let crc = ~0;
  for (const byte of typed) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(~crc >>> 0);
  return Buffer.concat([length, typed, checksum]);
}

const PHOTO_WIDTH = 120;
const PHOTO_HEIGHT = 80;

function pngBytes(width: number, height: number, rgb: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 2; // truecolour RGB, so a scanline is width × 3 bytes
  const scanline = Buffer.concat([
    Buffer.from([0]), // filter: none
    Buffer.from(Array.from({ length: width }, () => rgb).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => scanline));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── the fixture ─────────────────────────────────────────────────────────────────────────── */

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};
const today = () => new Date().toISOString().slice(0, 10);

const IMAGE_KEY = 'enr_11111111-2222-3333-4444-555555555555';

/** One delivered image, as the snapshot carries it (`deliveredImageValueSchema`): a
 *  root-relative URL the server assembled, never a blob key. */
const image = (key: string) => ({
  url: `/enrichment/images/${key}`,
  mimeType: 'image/png',
  width: PHOTO_WIDTH,
  height: PHOTO_HEIGHT,
  sizeBytes: 1024,
  source: 'commons',
  license: 'CC BY-SA 3.0',
  attribution: 'Kakidai',
  fetchedAt: '2026-08-05T10:00:00.000Z',
  confidence: 1,
  method: 'settled_id',
  ref: 'Sensoji 2023.jpg',
});

/** Four places. The first two are the comparison — **the same title**, so the two rows are
 *  comparable box for box, one enriched with a photo and one not. Note what none of them
 *  carries: an `icon`. ADR-0147 stores that only on a human's pick, and a pick beats a photo
 *  (§2) — which `pl-picked` is here to prove at the render, not just in the pure function. */
const places = [
  { id: 'pl-photo', tripId: TRIP_ID, name: 'Sensoji', lat: 35.7148, lng: 139.7967, ...stamps },
  { id: 'pl-bare', tripId: TRIP_ID, name: 'Sensoji', lat: 35.7149, lng: 139.7968, ...stamps },
  {
    id: 'pl-picked',
    tripId: TRIP_ID,
    name: 'Ichiran',
    icon: '🍜',
    lat: 35.69,
    lng: 139.7,
    ...stamps,
  },
  { id: 'pl-idea', tripId: TRIP_ID, name: 'Nezu', lat: 35.66, lng: 139.71, ...stamps },
];

/** Scheduled, timed and in one day — which is what gives each row an order counter, the thing
 *  §11.2's clip destroyed. `food` on all three so every badge takes the same category hue and
 *  the ring's colour is one value to compare against. */
const events = ['pl-photo', 'pl-bare', 'pl-picked'].map((placeId, i) => ({
  id: `ev-${placeId}`,
  tripId: TRIP_ID,
  date: today(),
  title: `stop ${i + 1}`,
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  placeId,
  startsAt: `${today()}T0${5 + i}:00:00.000Z`,
  sortOrder: i,
  source: 'manual',
  ...stamps,
}));

/** A pure shelf idea, which is the row that wears the SOFT grammar (`.place.soft`) — and so
 *  the one that can show the soft line survived the photo. It carries no event, deliberately:
 *  scheduled would make it hard-or-soft by its event and not a provisional row at all. */
const idea = {
  id: 'm-idea',
  tripId: TRIP_ID,
  title: 'Nezu',
  icon: '🍜',
  category: 'food',
  placeId: 'pl-idea',
  consumed: false,
  createdBy: 'u1',
  ...stamps,
};

const enrichments = {
  'pl-photo': { image: image(IMAGE_KEY) },
  'pl-picked': { image: image(IMAGE_KEY) },
  'pl-idea': { image: image(IMAGE_KEY) },
};

const VIEWPORT = { width: 390, height: 844 }; // ADR-0017's primary phone

async function boot(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  // The bytes. Immutable content, so the route is answered from the key alone — which is also
  // the whole access check (ADR-0167 §5): the URL is the capability.
  await page.route(
    (u) => u.pathname.startsWith('/enrichment/images/'),
    (r) =>
      r.fulfill({
        contentType: 'image/png',
        body: pngBytes(PHOTO_WIDTH, PHOTO_HEIGHT, [110, 140, 180]),
      }),
  );
  await bootIntoTrip(page, {
    places,
    events,
    maybeItems: [idea],
    enrichments,
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'מפה' }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expect(page.locator('.map-list .place')).toHaveCount(places.length);
}

/* ── the measurement ─────────────────────────────────────────────────────────────────────── */

/** Every number the acceptance is stated in, per row, read from the settled layout.
 *
 *  Keyed by what makes each row identifiable rather than by index: two of them share a title
 *  on purpose, so the pair is told apart by the badge's own `[data-photo]` state — which is
 *  the difference under test. */
async function measure(page: Page) {
  // A DECODED image first. A 404, a refused content type or an undecodable body all leave a
  // box that measures perfectly, so every assertion below would pass on a broken image.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('.map-list .wp-placebadge-photo img')].every(
          (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);

  return page.evaluate(() => {
    // Any colour token, resolved to the `rgb()` form a computed `box-shadow` reports — so a
    // hex token and a painted shadow are comparable without parsing either by hand.
    const asRgb = (value: string): string => {
      const probe = document.createElement('span');
      probe.style.color = value;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };
    const round = (r: DOMRect) => ({
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
    });

    return [...document.querySelectorAll('.map-list .place')].map((el) => {
      const row = el as HTMLElement;
      const badge = row.querySelector('.map-badge') as HTMLElement;
      const clip = row.querySelector('.wp-placebadge-photo') as HTMLElement | null;
      const img = clip?.querySelector('img') as HTMLImageElement | null;
      const ring = row.querySelector('.wp-placebadge-ring') as HTMLElement | null;
      const title = row.querySelector('.map-t') as HTMLElement;
      const badgeStyle = getComputedStyle(badge);
      // The counter is a pseudo-element, so its box is only readable as computed style — the
      // same way the hit-area expander is measured in `idea-place-badge.spec.ts`.
      const counter = getComputedStyle(badge, '::before');
      return {
        title: title.textContent ?? '',
        photo: badge.hasAttribute('data-photo'),
        soft: row.classList.contains('soft'),
        row: round(row.getBoundingClientRect()),
        titleW: Math.round(title.getBoundingClientRect().width),
        titleH: Math.round(title.getBoundingClientRect().height),
        // One rect per line box, since `.map-t` is inline — so this counts the lines the name
        // wrapped onto without having to read a `line-height` that computes to `normal`.
        titleLines: title.getClientRects().length,
        badge: round(badge.getBoundingClientRect()),
        // §11.2: the badge must NOT clip, or the counter hanging off its corner is cut.
        badgeOverflow: badgeStyle.overflow,
        // The hue left the fill…
        badgeBackground: badgeStyle.backgroundImage === 'none' ? badgeStyle.backgroundColor : 'set',
        // …and the ring is where it went. Its own box, so a partial ring is visible as one.
        ring: ring ? round(ring.getBoundingClientRect()) : null,
        ringShadow: ring ? getComputedStyle(ring).boxShadow : null,
        ringParentIsBadge: ring ? ring.parentElement === badge : null,
        // The category hue this row's badge declares, and the soft line, both resolved so the
        // ring's shadow can be searched for them.
        hue: asRgb(badgeStyle.getPropertyValue('--badge-ring').trim()),
        softLine: asRgb(badgeStyle.getPropertyValue('--soft-line').trim()),
        clipOverflow: clip ? getComputedStyle(clip).overflow : null,
        clip: clip ? round(clip.getBoundingClientRect()) : null,
        img: img ? round(img.getBoundingClientRect()) : null,
        imgFit: img ? getComputedStyle(img).objectFit : null,
        // A non-square source is what makes `cover` provable: with these the box is square.
        natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
        glyph: badge.textContent ?? '',
        counter: {
          content: counter.content,
          w: Math.round(parseFloat(counter.minWidth)),
          h: Math.round(parseFloat(counter.height)),
          top: Math.round(parseFloat(counter.top)),
          start: Math.round(parseFloat(counter.insetInlineStart)),
        },
      };
    });
  });
}

type Rows = Awaited<ReturnType<typeof measure>>;
const photoRow = (rows: Rows) => rows.find((r) => r.title === 'Sensoji' && r.photo)!;
const bareRow = (rows: Rows) => rows.find((r) => r.title === 'Sensoji' && !r.photo)!;

/* ── the acceptance ──────────────────────────────────────────────────────────────────────── */

test.describe('a place row whose badge frames a photo @390', () => {
  test.beforeEach(({ page }) => boot(page));

  // THE HEADLINE CLAIM, measured: the frame is free. Same row, same title, same everything —
  // the badge was already a 40px square and the photo goes inside it.
  test('costs the row nothing: same height, same title, no reflow', async ({ page }) => {
    const rows = await measure(page);
    const [framed, bare] = [photoRow(rows), bareRow(rows)];
    // The acceptance, and it needs no magic number: the two rows are the same fixture apart
    // from the photo, measured in the same layout.
    expect(framed.row.h).toBe(bare.row.h);
    // **The absolute number, and it is the row's PITCH — which is the 73px ADR-0167 names.**
    // These two rows are adjacent (stops 1 and 2), so the distance between their tops is the
    // whole cost of a row in the list: a 64px box plus `.place`'s 9px `margin-bottom`. The
    // ADR's other figure — "collapsed rows stay at 69–71px" — is the MOCKUP's own box, whose
    // CSS is hand-written and not the app's (`docs/design/mockups.md` says to re-check exactly
    // this); the app's box is 64px and its pitch is the 73px the ADR calls `.place`.
    expect(bare.row.top - framed.row.top).toBe(73);
    // The badge is the 40×40 square it always was, in the same column — the frame goes INSIDE
    // it, so its box cannot move.
    expect(framed.badge.w).toBe(40);
    expect(framed.badge.h).toBe(40);
    expect(framed.badge.w).toBe(bare.badge.w);
    expect(framed.badge.h).toBe(bare.badge.h);
    expect(framed.badge.left).toBe(bare.badge.left);
    expect(framed.titleW).toBe(bare.titleW);
    expect(framed.titleH).toBe(bare.titleH);
    // Still one line — the failure mode a trailing thumbnail slot was measured and rejected for
    // (`PlaceBadge`'s header), asserted rather than assumed.
    expect(framed.titleLines).toBe(1);
    expect(bare.titleLines).toBe(1);
  });

  // The photo fills the interior and CROPS — the badge is square and the source is 3:2, so a
  // `contain` would letterbox it and leave two bands of category tint.
  test('fills the badge to its edges and crops rather than letterboxing', async ({ page }) => {
    const rows = await measure(page);
    const framed = photoRow(rows);
    expect(framed.natural).toEqual({ w: PHOTO_WIDTH, h: PHOTO_HEIGHT });
    expect(framed.imgFit).toBe('cover');
    expect(framed.clip).toEqual(framed.badge);
    expect(framed.img).toEqual(framed.badge);
    // The glyph is not behind it: a photograph under an emoji is unreadable as either. The
    // row beside it still draws one — the category's, since nobody picked an icon for it.
    expect(framed.glyph).toBe('');
    expect(bareRow(rows).glyph).not.toBe('');
  });

  // §11.2, the defect that shipped in the mockup and needed a human eye on a device: the clip
  // is an INNER element, so the badge itself keeps `overflow: visible` and the counter hanging
  // off its corner is whole. Asserted as the counter's own box being identical with and
  // without a photo — the photo changes nothing about it — plus the overflow that guarantees it.
  test('keeps the order counter overhanging its corner, uncut', async ({ page }) => {
    const rows = await measure(page);
    const framed = photoRow(rows);
    expect(framed.badgeOverflow).toBe('visible');
    expect(framed.clipOverflow).toBe('hidden');
    // Its box, not its content — the two rows are different stops, so they carry different
    // numbers. What must be identical is the geometry: the photo changes nothing about it.
    const { content: _, ...box } = framed.counter;
    const { content: __, ...bareBox } = bareRow(rows).counter;
    expect(box).toEqual(bareBox);
    // Overhanging, which is the whole reason the clip would have cut it: both offsets negative,
    // so the stamp sits outside the badge's box on two sides.
    expect(framed.counter.top).toBeLessThan(0);
    expect(framed.counter.start).toBeLessThan(0);
    expect(framed.counter.h).toBeGreaterThan(0);
    expect(framed.counter.content).not.toBe('none');
  });

  // §8.1: the hue left the fill, so it has to arrive somewhere the photo cannot cover. The ring
  // is an overlay ABOVE the image and OUTSIDE the clip, on the badge's full box.
  test('moves the category hue from the fill to a ring above the image', async ({ page }) => {
    const rows = await measure(page);
    const framed = photoRow(rows);
    expect(framed.hue).not.toBe('rgba(0, 0, 0, 0)');
    expect(framed.ringParentIsBadge).toBe(true);
    expect(framed.ring).toEqual(framed.badge);
    expect(framed.ringShadow).toContain(framed.hue);
    // The fill is cleared, so a thumbnail with alpha does not composite over a saturated tint.
    expect(framed.badgeBackground).toBe('rgba(0, 0, 0, 0)');
    // …and the row without a photo still wears the hue as its fill, untouched.
    expect(bareRow(rows).badgeBackground).toBe(framed.hue);
    expect(bareRow(rows).ring).toBeNull();
  });

  // Hard vs soft is non-negotiable everywhere it touches (root rule 1), and the soft line is
  // the category hue's trap all over again: an `inset` shadow on the badge, covered by the
  // photo. It is redrawn in the overlay, so a provisional row still reads provisional.
  test('keeps the soft grammar on a provisional row', async ({ page }) => {
    const rows = await measure(page);
    const soft = rows.find((r) => r.soft)!;
    expect(soft.photo).toBe(true);
    expect(soft.ringShadow).toContain(soft.softLine);
    expect(soft.ringShadow).toContain(soft.hue);
  });

  // The wiring, not the pure function: `badgePhoto` is what the row calls, so a place someone
  // picked an icon for renders the glyph even though the snapshot has a photo for it.
  test('yields to a picked icon', async ({ page }) => {
    const rows = await measure(page);
    const picked = rows.find((r) => r.title === 'Ichiran')!;
    expect(picked.photo).toBe(false);
    expect(picked.glyph).toBe('🍜');
  });

  // The Map is day-scoped, so both scopes are genuinely different renders (`frontend/CLAUDE.md`:
  // assert across both). All-days is also the crowded one — every place in the trip at once.
  test('frames the photo in all-days scope too', async ({ page }) => {
    await page.getByRole('button', { name: new RegExp('כל הימים') }).click();
    const rows = await measure(page);
    const framed = photoRow(rows);
    expect(framed.img).toEqual(framed.badge);
    expect(framed.ring).toEqual(framed.badge);
    expect(framed.row.h).toBe(bareRow(rows).row.h);
  });
});
