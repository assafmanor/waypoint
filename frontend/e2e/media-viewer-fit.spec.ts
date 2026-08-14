// **THE VIEWER'S FRAME IS THE PICTURE'S OWN BOX** (owner, 2026-08-05: the media viewer
// _"shouldn't hardcode the size of the box, it should fit the size of the image"_).
//
// The frame used to be `flex: 1 1 78vh` — a constant, reserved off the mime type so the card
// could not jump when the bytes landed (`screens.css`'s frame block has that history). It bought
// the no-jump and paid for it in letterbox: a 3:2 photograph on a 390px phone sat in a ~620px
// frame with a warm `--paper` band above and below it, which is the stain the build log left as
// its last open question. The reservation was never the problem; the CONSTANT was.
//
// **This spec is a MEASUREMENT, which is why it is here and not in the unit suite.** Every claim
// below is about boxes: jsdom loads no CSS and reports every rect as zero, so
// `MediaViewer.test.tsx` can assert the ratio the frame is sized FROM and nothing about the box
// it produces. The one thing a rect can miss is also guarded — a 404 or an undecodable body
// leaves a box that measures beautifully, so every run asserts a decoded image first and serves
// real bytes at the dimensions it claims (`png.ts`).
//
// **Both sources, because they learn the size differently** (and only one of them existed when
// the owner reported it):
//
//   the DOCUMENT       knows nothing until its bytes decode, so the frame settles from the
//                      image itself — the viewer's original and still most-used path;
//   the PLACE PHOTO    is delivered with the bucket's real `width`/`height` (ADR-0166 §11.4),
//                      so the frame is reserved at the right ratio before a byte arrives.
//
// Landscape for one and portrait for the other on purpose: a single ratio cannot tell "fits the
// image" from "happens to match the constant we replaced".
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { pngBytes } from './png';

const VIEWPORT = { width: 390, height: 844 }; // ADR-0017's primary phone
const today = () => new Date().toISOString().slice(0, 10);
const stamps = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
};

/** A wide scan — the shape the report was about, and the one the old constant stretched into a
 *  tall frame with bands. */
const SCAN = { width: 1200, height: 800 };
/** A portrait photograph, inside the measured 0.54–1.78 aspect range (ADR-0166 §11.4). Taller
 *  than wide, so it also proves the frame is not simply landscape-shaped now. */
const PHOTO = { width: 600, height: 900 };

const passportDoc = {
  id: 'd-passport',
  tripId: TRIP_ID,
  type: 'passport',
  title: 'דרכון של דנה',
  mimeType: 'image/png',
  sizeBytes: 248_000,
  ...stamps,
};

const place = {
  id: 'pl-known',
  tripId: TRIP_ID,
  name: 'Nezu',
  lat: 35.6656,
  lng: 139.7167,
  ...stamps,
};
const event = {
  id: 'ev-known',
  tripId: TRIP_ID,
  date: today(),
  title: 'stop 1',
  icon: '🍜',
  category: 'food',
  kind: 'soft',
  status: 'planned',
  placeId: place.id,
  startsAt: `${today()}T05:00:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
};

const provenance = {
  source: 'commons',
  license: 'CC BY-SA 4.0',
  attribution: 'Kakidai',
  fetchedAt: '2026-08-05T10:00:00.000Z',
  confidence: 1,
  method: 'settled_id',
  ref: 'Nezu.jpg',
};
const enrichments = {
  [place.id]: {
    summary: {
      en: { value: 'Nezu Museum is an art museum in Minato, Tokyo.', lang: 'en', ...provenance },
    },
    image: {
      url: '/enrichment/images/enr_11111111-2222-3333-4444-555555555555',
      mimeType: 'image/png',
      sizeBytes: 1024,
      ...PHOTO,
      ...provenance,
    },
  },
};

/** The document's `/content` route, which is auth-guarded in the app and answered here with the
 *  same bytes the real one would carry. */
async function routeBytes(page: Page, pattern: string, size: typeof SCAN): Promise<void> {
  await page.route(
    (u) => u.pathname.includes(pattern),
    (r) =>
      r.fulfill({
        contentType: 'image/png',
        body: pngBytes(size.width, size.height, [110, 140, 180]),
      }),
  );
}

/** Every number the acceptance is stated in, read from the settled layout — after the image is
 *  proved decoded, since a broken one measures fine. */
async function measure(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = document.querySelector('.doc-viewer-img') as HTMLImageElement | null;
        return !!img && img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);

  // **A settled frame, not a decoded one.** A document's ratio arrives with its bytes, so its
  // frame TRAVELS from the placeholder to the picture's box rather than snapping. Adjacent frames
  // are not a valid settled signal: an eased transition can move less than half a pixel before it
  // accelerates, and a busy production run can sample twice before the transition starts. Wait for
  // the image and frame to agree instead; a real letterbox regression still times out and fails.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const body = document.querySelector('.doc-viewer-body') as HTMLElement;
        const img = document.querySelector('.doc-viewer-img') as HTMLImageElement;
        const frame = body.getBoundingClientRect();
        const painted = img.getBoundingClientRect();
        return Math.max(
          Math.abs(frame.width - painted.width),
          Math.abs(frame.height - painted.height),
          Math.abs(frame.top - painted.top),
        );
      }),
    )
    .toBeLessThanOrEqual(1);

  return page.evaluate(() => {
    const round = (r: DOMRect) => ({
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
    });
    const body = document.querySelector('.doc-viewer-body') as HTMLElement;
    const img = document.querySelector('.doc-viewer-img') as HTMLImageElement;
    const card = document.querySelector('.doc-viewer-card') as HTMLElement;
    return {
      frame: round(body.getBoundingClientRect()),
      img: round(img.getBoundingClientRect()),
      card: round(card.getBoundingClientRect()),
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      // The letterbox is `--paper` showing through the frame around the picture, so what proves
      // there is none is the painted image's box against the frame's — not a colour.
      fit: getComputedStyle(img).objectFit,
      viewport: window.innerHeight,
    };
  });
}

type Measured = Awaited<ReturnType<typeof measure>>;

/** The acceptance both surfaces share: the frame IS the picture, to within a pixel of rounding,
 *  at the picture's own ratio and not at a constant. */
function expectFitsTheImage(m: Measured, size: { width: number; height: number }) {
  expect(m.natural).toEqual({ w: size.width, h: size.height });
  // No band, on any side: the painted image fills the frame it was given.
  expect(Math.abs(m.img.w - m.frame.w)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.img.h - m.frame.h)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.img.top - m.frame.top)).toBeLessThanOrEqual(1);
  // …and the frame carries the image's ratio, which is the actual fix — a frame that merely
  // matched the image would also pass the two assertions above if both were the old constant.
  expect(m.frame.w / m.frame.h).toBeCloseTo(size.width / size.height, 1);
  // The old constant, stated so a regression to it is unmistakable: 78vh of an 844px viewport
  // is ~658px, and a wide picture in it was ~220px of stain.
  expect(m.frame.h).toBeLessThan(Math.round(m.viewport * 0.78) - 40);
}

test.describe('the media viewer fits its image @390', () => {
  // **THE DOCUMENT VIEWER**, which is where the frame started and where most of its use is. The
  // size is unknowable until the bytes decode, so this path is the one that has to settle — and
  // it settles onto the scan's own box.
  test('a wide scan gets a wide frame, with no band above or below it', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await routeBytes(page, '/content', SCAN);
    await bootIntoTrip(page, {
      documents: [passportDoc],
      now: todayAt('02:00'),
      dates: shortLiveTripDates(),
    });
    await page.goto('/');
    await page.locator('nav.nav button', { hasText: 'אינדקס' }).click();
    await page.locator('.wp-idx-tile').nth(1).click(); // the documents tile
    await page.locator('.wp-listrow').first().click();
    await expect(page.locator('.doc-viewer')).toBeVisible();

    const m = await measure(page);
    expectFitsTheImage(m, SCAN);
    expect(m.fit).toBe('contain');
    // The card is the frame plus its chrome, so a frame that fits leaves no empty card either.
    expect(m.card.h - m.frame.h).toBeLessThan(120);
  });

  // **THE PLACE PHOTO** (ADR-0167 §10.2), the second source. It arrives with its dimensions, so
  // there is nothing to settle: the frame is this picture's box from the first render.
  test('a portrait place photo gets a portrait frame', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await routeBytes(page, '/enrichment/images/', PHOTO);
    await bootIntoTrip(page, {
      places: [place],
      events: [event],
      enrichments,
      now: todayAt('02:00'),
      dates: shortLiveTripDates(),
    });
    await page.goto('/');
    await page.locator('nav.nav button', { hasText: 'מפה' }).click();
    await expect(page.locator('.map-screen')).toBeVisible();
    await page.locator('.map-list .place').first().click();
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    await page.locator('.map-hero').click();
    await expect(page.locator('.doc-viewer')).toBeVisible();

    const m = await measure(page);
    expectFitsTheImage(m, PHOTO);
    // Portrait, and taller than it is wide — the assertion a landscape-only spec cannot make.
    expect(m.frame.h).toBeGreaterThan(m.frame.w);
    // Still inside the card's own ceiling (`max-height: 88vh`), which is what catches a ratio
    // applied with no bound: 600×900 at the card's width would overflow a shorter screen.
    expect(m.card.h).toBeLessThanOrEqual(Math.round(m.viewport * 0.88) + 1);
  });
});
