// **A NOTE INSIDE A CARD IS A PREVIEW** (ADR-0235).
//
// This file exists because the decision is a HEIGHT, and jsdom has none. `useIsClipped` asks
// the box whether it hid anything, and in a document with no layout both metrics read 0 — so
// the unit suite can only prove the structural half (the class is on the right element, the
// control wears the foot's chrome, a stubbed box routes the tap) and has to be TOLD what it
// would have measured. Everything below is the half only a browser can answer:
//
//  1. the clip actually bounds the body, and at the budget the stylesheet states;
//  2. a note that FITS is untouched — no control, and the tap still opens the foot, which is
//     ADR-0153 §4 unchanged and the thing most at risk of being broken by this change;
//  3. the fade does not grey the last line of a short note (the defect the absolute mask
//     stops were written for — a percentage gradient would have, and nothing in jsdom or in
//     the contract test can see a mask that paints);
//  4. the control meets ADR-0017's 44px floor from a ~19px box, via the `::after` overlay.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

const PHONE = { width: 390, height: 844 };
const NOW = () => todayAt('15:00');

const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

const hotel = {
  id: 'bk-hotel',
  tripId: TRIP_ID,
  type: 'hotel',
  title: 'מלון שינג׳וקו גרנבל',
  source: 'manual',
  ...stamps,
};

/** The reported note, retyped from the owner's screenshot — including both codes, which is
 *  the whole reason a clip may never be a truncation of what is stored. */
const LONG = [
  'Welcome Assaf. Sorry wrong day :-)',
  'You have a reservation on our apartment on Saturday 19 September 2026 and check out on the Saturday 19 September 2026 we hope that you have a pleasant stay.',
  'Here are some points to help. The apartment is located on Tryggvabraut 24 arrival from FURUVELLIR (at the other side of the House), the apartment is on the third floor no. 308.',
  'Enter a code 1944 on the keypad on you right side of the main door of the Hotel Apartments.',
  'In front of the apartment is a key box and the code for that is 2308.',
  'Check in time is from 16:00 and check out before 10:00.',
  'Free WI Fi is TB24 password Trb24!!!',
  'Sandra 00354 8475790 (WhatsApp)',
].join('\n\n');

const SHORT = 'הצ׳ק-אין רק מ-15:00';

const note = (id: string, body: string) => ({
  id,
  tripId: TRIP_ID,
  body,
  bookingId: hotel.id,
  source: 'member',
  createdBy: 'u1',
  createdAt: '2024-01-02T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  updatedBy: 'u1',
});

/** Into the booking's detail sheet, which is the surface the report came from. */
async function openBooking(page: Page, bodies: string[]) {
  await page.setViewportSize(PHONE);
  await bootIntoTrip(page, {
    bookings: [hotel],
    notes: bodies.map((b, i) => note(`n${i}`, b)),
    now: NOW(),
    dates: shortLiveTripDates(),
  });
  await page.goto('/?tab=index');
  await page.getByText('הזמנות', { exact: true }).first().click();
  await page.locator('.wp-listrow', { hasText: hotel.title }).first().click();
  await expect(page.getByRole('dialog')).toContainText(hotel.title);
}

test.describe('a long note in a host’s section', () => {
  test('is bounded at the stated budget, and offers a named way to the rest', async ({ page }) => {
    await openBooking(page, [LONG]);
    const prose = page.locator('.note-item-b .note-prose');

    // Bounded: the box shows less than the text needs, and the difference is large enough
    // that no rounding could produce it.
    const { client, scroll, lines, budget } = await prose.evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      lines: Number(getComputedStyle(el).getPropertyValue('--note-clip-lines')),
      budget: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(scroll).toBeGreaterThan(client * 2);
    // …and the bound is the budget the stylesheet states, not some other number.
    expect(client).toBeLessThanOrEqual(Math.ceil(lines * budget) + 1);

    // The way to the rest is present, named, and wears the foot's own class.
    const more = page.locator('.note-item-main > .note-more');
    await expect(more).toHaveText(/תצוגה מלאה/);
    await expect(more).toHaveClass(/row-open-act/);

    // **ADR-0017's floor from a box that never grew the line.** The visible control is about
    // 19px; the overlay is `.row-open-act::after`, a 44px box centred on it — inherited by
    // reusing that class rather than re-declared, which is the point of reusing it.
    const box = (await more.boundingBox())!;
    expect(box.height).toBeLessThan(30);
    const hit = await more.evaluate((el) => parseFloat(getComputedStyle(el, '::after').height));
    expect(hit).toBeGreaterThanOrEqual(44);
    // …and it is 44px OF THIS CONTROL rather than 44px of somewhere else: a hit test 20px
    // above the text's own centre still lands on the button, which a `height` read off a
    // pseudo-element cannot tell you. (`elementFromPoint` returns the element a pseudo's box
    // belongs to, which is exactly what is being asserted.)
    const hitsAbove = await more.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2 - 20);
      return at === el || el.contains(at);
    });
    expect(hitsAbove).toBe(true);
  });

  test('the control opens the note’s own screen, and so does the body', async ({ page }) => {
    await openBooking(page, [LONG]);
    await page.locator('.note-item-main > .note-more').click();
    await expect(page.locator('.note-full')).toBeVisible();
    // Every word is there — a preview is a rendering decision, never a truncation of what is
    // stored. Both codes in particular, which is what the reported note was for.
    await expect(page.locator('.note-full-body')).toContainText('1944');
    await expect(page.locator('.note-full-body')).toContainText('2308');
  });
});

test.describe('a note that fits its budget', () => {
  test('is untouched: no control, and the tap still opens the foot', async ({ page }) => {
    await openBooking(page, [SHORT]);
    const prose = page.locator('.note-item-b .note-prose');
    const overflow = await prose.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page.locator('.note-more')).toHaveCount(0);

    // ADR-0153 §4, unchanged: the only thing missing from a note you can already read is the
    // verb, so the tap opens the foot rather than a screen.
    await page.locator('.note-item-b').click();
    await expect(page.locator('.note-item.is-open .row-open-foot')).toHaveCount(1);
    await expect(page.locator('.note-full')).toHaveCount(0);
  });

  // **The fade's stops are absolute, and this is the only place that can prove it.** A
  // `100% - 1.15lh` gradient resolves against the box, so a note shorter than the budget
  // would have had its last line greyed out. A mask paints; no unit test and no CSS-text
  // contract can see the result, so the pixels are sampled.
  test('keeps its last line at full strength — the fade does not reach it', async ({ page }) => {
    await openBooking(page, [SHORT]);
    const prose = page.locator('.note-item-b .note-prose');
    const shot = await prose.screenshot();
    const faded = await prose.evaluate(
      (el) =>
        getComputedStyle(el).maskImage !== 'none' ||
        getComputedStyle(el).webkitMaskImage !== 'none',
    );
    // The rule IS applied — this is not passing because the class went missing.
    expect(faded).toBe(true);
    // And the text still paints at full contrast: a faded run would push the darkest pixel
    // in the bottom third towards the paper behind it.
    const [darkestOverall, darkestInLastThird] = await darkest(page, shot, [0, 2 / 3]);
    expect(darkestInLastThird).toBeLessThanOrEqual(darkestOverall + 12);
  });
});

/** The darkest grey in each bottom slice of a screenshot, decoded in the page under test —
 *  it already has a canvas, and a second browser to read one PNG costs more than the
 *  assertion is worth. `from` is a list so one decode answers every slice. */
async function darkest(page: Page, png: Buffer, from: number[]): Promise<number[]> {
  return page.evaluate(
    async ([b64, starts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64 as string}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return (starts as number[]).map((start) => {
        const y0 = Math.floor(img.height * start);
        const { data } = ctx.getImageData(0, y0, img.width, img.height - y0);
        let min = 255;
        for (let i = 0; i < data.length; i += 4)
          min = Math.min(min, (data[i] + data[i + 1] + data[i + 2]) / 3);
        return min;
      });
    },
    [png.toString('base64'), from] as [string, number[]],
  );
}
