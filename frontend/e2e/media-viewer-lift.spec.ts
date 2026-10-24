// **THE PINCH LIFTS THE PICTURE OUT OF THE CARD** (owner, 2026-08-05: _"the image zooms out of
// the box and auto resets to the original size when lifting the finger"_ — ADR-0062's amendment).
//
// The old zoom was **sticky and confined**: pinch to a scale, keep it, pan inside the frame,
// double-tap to toggle — all of it inside `.doc-viewer-body`, whose `overflow: hidden` is the
// box the report is about. The new one exists only while fingers are down, and the picture
// leaves the card entirely while they are.
//
// **Every claim here is geometry or trust, and jsdom has neither.** `MediaViewer.test.tsx`
// asserts the model — how many fingers make a gesture, which element leaves the card, what the
// copy is transformed to, when it stops existing — and cannot see whether the copy is CLIPPED,
// which is the whole feature. Two things need a real engine:
//
//   the escape   `overflow: hidden` changes no rect at all (frontend/CLAUDE.md: "reading a rect
//                and calling it visibility"), so the copy is proved whole by measuring it
//                against the boxes that would have cut it — the frame and the rounded card.
//   the fingers  a pinch is two TRUSTED touch points. An untrusted `PointerEvent` from
//                `page.evaluate` has no active pointer behind it, so `setPointerCapture` throws
//                and the gesture never starts — the events go through CDP (`touch.ts`).
//
// It also guards the thing this feature could plausibly break and no unit test would notice:
// ADR-0062's app-wide pinch suppressor. The viewer is its one exception, and the page itself
// must still not zoom while the picture does.
import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { dispatchTouch, type TouchPoint } from './touch';
import { pngBytes } from './png';
import { t } from '../src/i18n/he';

// A real phone, touch-capable — `hasTouch` is what makes the browser deliver the gesture at all.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const today = () => new Date().toISOString().slice(0, 10);
const stamps = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  updatedBy: 'u1',
};
/** Landscape, so the frame it fits is much shorter than the card is tall — which leaves the
 *  escape room to be visible on both axes when the copy grows. */
const PHOTO = { width: 1200, height: 800 };

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

/** Opens the full picture — the place card's hero is the way in (ADR-0167 §11.1), and the
 *  document path reaches the same viewer through the Index. */
async function openFullPicture(page: Page): Promise<void> {
  await page.route(
    (u) => u.pathname.startsWith('/enrichment/images/'),
    (r) =>
      r.fulfill({
        contentType: 'image/png',
        body: pngBytes(PHOTO.width, PHOTO.height, [110, 140, 180]),
      }),
  );
  await bootIntoTrip(page, {
    places: [place],
    events: [event],
    enrichments: {
      'pl-known': {
        summary: {
          en: {
            value: 'Nezu Museum is an art museum in Minato, Tokyo.',
            lang: 'en',
            ...provenance,
          },
        },
        image: {
          url: '/enrichment/images/enr_11111111-2222-3333-4444-555555555555',
          mimeType: 'image/png',
          sizeBytes: 1024,
          ...PHOTO,
          ...provenance,
        },
      },
    },
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await page.locator('nav.nav button', { hasText: 'מפה' }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await page.locator('.map-list .place').first().click();
  await page.getByRole('button', { name: t.map.know.more, exact: true }).click();
  await page.locator('.map-hero').click();
  await expect(page.locator('.doc-viewer-img')).toBeVisible();
  // A decoded image before any measurement: a broken one has a box that measures perfectly.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = document.querySelector('.doc-viewer-img') as HTMLImageElement | null;
        return !!img && img.complete && img.naturalWidth > 0;
      }),
    )
    .toBe(true);

  // **And an ARRIVED viewer.** The card comes in from `scale(0.88)` and the picture fades
  // (ADR-0140's amendment), so a box read at the wrong moment is 12% small and an opacity read
  // there is 0.978 — both of which this file would then compare a released state against. A
  // transition in flight makes every measurement a lie; wait for two frames that agree.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const card = document.querySelector('.doc-viewer-card') as HTMLElement;
            const img = document.querySelector('.doc-viewer-img') as HTMLElement;
            const read = () =>
              `${card.getBoundingClientRect().width}/${getComputedStyle(img).opacity}`;
            const before = read();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(read() === before && before.endsWith('/1'))),
            );
          }),
      ),
    )
    .toBe(true);
}

/** Boxes, plus the two facts a box cannot carry: whether the copy is a descendant of anything
 *  that clips, and whether the PAGE zoomed (ADR-0062's suppressor). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const round = (r: DOMRect) => ({
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
    });
    const img = document.querySelector('.doc-viewer-img') as HTMLElement;
    const frame = document.querySelector('.doc-viewer-body') as HTMLElement;
    const card = document.querySelector('.doc-viewer-card') as HTMLElement;
    const copy = document.querySelector('.doc-viewer-lift') as HTMLElement | null;
    const scrim = document.querySelector('.doc-viewer-lift-scrim') as HTMLElement | null;
    return {
      img: round(img.getBoundingClientRect()),
      imgOpacity: getComputedStyle(img).opacity,
      frame: round(frame.getBoundingClientRect()),
      card: round(card.getBoundingClientRect()),
      copy: copy ? round(copy.getBoundingClientRect()) : null,
      // The clip test that no rect can answer: an ancestor's `overflow: hidden` cuts what
      // paints and changes nothing measurable, so ask about the ancestry itself.
      copyInsideCard: copy ? card.contains(copy) : null,
      copyEvents: copy ? getComputedStyle(copy).pointerEvents : null,
      scrim: !!scrim,
      // The card's furniture while the picture is out of its box, and what it would take.
      headOpacity: getComputedStyle(document.querySelector('.doc-viewer-head') as Element).opacity,
      headEvents: getComputedStyle(document.querySelector('.doc-viewer-head') as Element)
        .pointerEvents,
      // There is no ✕ any more — the ways out are the backdrop, back and Escape.
      closeButtons: document.querySelectorAll('.doc-viewer button').length,
      // ADR-0062: the app's own pinch is still suppressed. A page that zoomed would report a
      // scale above 1 here, and every box above would be a lie in the same breath.
      pageScale: window.visualViewport?.scale ?? 1,
    };
  });
}

/** Two fingers, `spread` px apart, centred on a point — the shape of every pinch below. */
const fingers = (centre: TouchPoint, spread: number): TouchPoint[] => [
  { x: centre.x - spread / 2, y: centre.y },
  { x: centre.x + spread / 2, y: centre.y },
];

async function pinchOut(
  cdp: CDPSession,
  centre: TouchPoint,
  from: number,
  to: number,
): Promise<void> {
  await dispatchTouch(cdp, 'touchStart', fingers(centre, from));
  // A few steps rather than one jump: the handler reads every move, and a single 180px leap
  // would not exercise the same path a finger does.
  for (const spread of [from + (to - from) / 3, from + ((to - from) * 2) / 3, to]) {
    await dispatchTouch(cdp, 'touchMove', fingers(centre, spread));
  }
}

test.describe('the media viewer’s pinch @390', () => {
  test('lifts the picture out of the card while the fingers are down', async ({ page }) => {
    await openFullPicture(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await measure(page);
    const centre = { x: at.img.left + at.img.w / 2, y: at.img.top + at.img.h / 2 };

    await pinchOut(cdp, centre, 60, 240);
    const held = await measure(page);

    // It exists, it is OUT of the card, and it is bigger than the box that used to confine it.
    expect(held.copy).not.toBeNull();
    expect(held.copyInsideCard).toBe(false);
    expect(held.copy!.w).toBeGreaterThan(held.frame.w);
    expect(held.copy!.h).toBeGreaterThan(held.frame.h);
    // **Past the card's own edges**, which is the report in one assertion: the picture is no
    // longer inside the thing that was clipping it.
    expect(held.copy!.top).toBeLessThan(held.card.top);
    expect(held.copy!.bottom).toBeGreaterThan(held.card.bottom);
    // The original is transparent, not gone — it is the box the copy was measured from.
    expect(held.imgOpacity).toBe('0');
    expect(held.img.w).toBe(at.img.w);
    // The copy takes no input: the backdrop tap under it is still the ONE close (ADR-0103 §2).
    expect(held.copyEvents).toBe('none');
    expect(held.scrim).toBe(true);
    // The card's furniture stands down and stops taking input while the picture is out. The
    // opacity is polled because it FADES — reading it on the frame the pinch ended lands
    // mid-transition, which is the trap this file's arrival wait exists for.
    expect(held.headEvents).toBe('none');
    await expect.poll(async () => (await measure(page)).headOpacity).toBe('0');
    // The page itself did not zoom — the viewer is the exception, not the hole (ADR-0062).
    expect(held.pageScale).toBe(1);
  });

  // **THE GESTURE IS THE WHOLE SCREEN'S** (owner, 2026-08-06: it _"should be available from the
  // entire screen when the image is already displaying, so that if the image dimensions are
  // small, you wouldn't have to place your fingers exactly inside the image borders"_). This is
  // the test that could not be written before the handlers left the `<img>`: the fingers here
  // never touch the picture, and they are not even on the card.
  test('pinches from fingers that never touch the picture', async ({ page }) => {
    await openFullPicture(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await measure(page);
    // Well below the card, on bare scrim — under the old model this was a backdrop tap.
    const centre = { x: 195, y: at.card.bottom + 90 };
    expect(centre.y).toBeGreaterThan(at.img.bottom + 40);

    await pinchOut(cdp, centre, 60, 240);
    const held = await measure(page);

    expect(held.copy).not.toBeNull();
    expect(held.copy!.w).toBeGreaterThan(at.img.w);
    // **And it grows where it stands.** The anchor is clamped into the picture's own box, so a
    // pinch below it lifts from its bottom edge instead of flying at the fingers: the copy has
    // to still be on screen and still overlap where the picture was.
    expect(held.copy!.top).toBeLessThan(at.img.bottom);
    expect(held.copy!.bottom).toBeGreaterThan(at.img.top);
    expect(held.copy!.top).toBeLessThan(844);
    expect(held.copy!.bottom).toBeGreaterThan(0);
    // The bottom edge under the fingers is the point held still, within a pixel of rounding.
    expect(Math.abs(held.copy!.bottom - at.img.bottom)).toBeLessThanOrEqual(1);

    // Releasing it does not close the viewer, though the gesture began on the backdrop whose
    // tap IS the one close: the click a released finger can synthesise is swallowed.
    await dispatchTouch(cdp, 'touchEnd');
    await expect.poll(async () => (await measure(page)).copy).toBeNull();
    await expect(page.locator('.doc-viewer-card')).toBeVisible();
  });

  // The ✕ is gone entirely (owner: _"this button is unnecessary"_), so the card carries no
  // control at all — and the ways out that remain still work. ADR-0103 §2 asks that they run
  // ONE close, not that one of them be labelled.
  test('has no close button, and the backdrop still closes it', async ({ page }) => {
    await openFullPicture(page);
    expect((await measure(page)).closeButtons).toBe(0);
    // The backdrop is everything around the card: the top-left corner is nowhere near it.
    await page.mouse.click(8, 8);
    await expect(page.locator('.doc-viewer')).toHaveCount(0);
  });

  test('puts it back exactly where it was when a finger lifts', async ({ page }) => {
    await openFullPicture(page);
    const cdp = await page.context().newCDPSession(page);
    const before = await measure(page);
    const centre = { x: before.img.left + before.img.w / 2, y: before.img.top + before.img.h / 2 };

    await pinchOut(cdp, centre, 60, 240);
    expect((await measure(page)).copy).not.toBeNull();

    await dispatchTouch(cdp, 'touchEnd');
    // The journey home plays, then the copy stops existing — no timer of our own here, since the
    // duration is a token: poll for the end state instead of racing it.
    await expect.poll(async () => (await measure(page)).copy).toBeNull();

    const after = await measure(page);
    // **Auto-reset**, stated as the boxes agreeing: same size, same place, and visible again.
    expect(after.img).toEqual(before.img);
    expect(after.frame).toEqual(before.frame);
    expect(after.card).toEqual(before.card);
    expect(after.imgOpacity).toBe('1');
    expect(after.scrim).toBe(false);
    // The furniture comes back with it — a fade again, so polled again.
    await expect.poll(async () => (await measure(page)).headOpacity).toBe('1');
    // And the viewer is still open — a pinch is not a way out.
    await expect(page.locator('.doc-viewer-card')).toBeVisible();
  });

  test('goes home on the FIRST finger up, not the last', async ({ page }) => {
    await openFullPicture(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await measure(page);
    const centre = { x: at.img.left + at.img.w / 2, y: at.img.top + at.img.h / 2 };

    await pinchOut(cdp, centre, 60, 240);
    // One finger lifts, the other stays down. There is no zoomed state to pan any more, so a
    // gesture that has stopped being a pinch has stopped being a zoom.
    await dispatchTouch(cdp, 'touchEnd', [fingers(centre, 240)[1]]);
    await expect.poll(async () => (await measure(page)).copy).toBeNull();
    expect((await measure(page)).imgOpacity).toBe('1');
  });
});
