// **THE DECIDING CARD: what a place looks like before you save it** (ADR-0166 §17,
// ADR-0167 §9.1). Measured here because every claim in §9.1 is about boxes — the hero's 130px, the
// three-line clamp, and the full-width lines those two blocks take on a row whose identity line
// must not reflow. jsdom loads no CSS and reports every rect as zero, which is why
// `Map.embedded.test.tsx` can only assert which row asks and which row shows.
//
// It is also the first spec here that drives Google's half of the search. That is hermetic: the
// relay is a `page.route` stub like every other API call, and the tab is on its list-only path (no
// Maps key in this run), which renders the same list body as the split — one fragment, deliberately
// (`Map.tsx`).
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';

const WIDTHS = [390, 360]; // ADR-0017's primary band, both ends

/** Long enough to prove the clamp is doing something — the measured extract range is 86–1,321
 *  characters (ADR-0166 §11), and only a long one can fail a line count. */
const LONG_EN =
  'Tokyo Skytree is a broadcasting and observation tower in Sumida, Tokyo. It became the ' +
  'tallest structure in Japan in 2010 and reached its full height of 634 metres in 2011, ' +
  'making it the tallest tower in the world at the time of its completion.';

const RESULT = {
  googlePlaceId: 'g-sky',
  primaryText: 'Tokyo Skytree',
  secondaryText: 'Sumida, Tokyo',
  lat: 35.7101,
  lng: 139.8107,
};

const KNOWN = {
  summary: {
    en: {
      value: LONG_EN,
      lang: 'en',
      source: 'wikipedia',
      license: 'CC BY-SA 4.0',
      attribution: 'Wikipedia',
      fetchedAt: '2026-08-05T10:00:00.000Z',
      confidence: 1,
      method: 'settled_id',
      ref: 'Q57965',
    },
  },
  image: {
    url: '/enrichment/images/enr_11111111-2222-3333-4444-555555555555',
    mimeType: 'image/png',
    width: 840,
    height: 600,
    sizeBytes: 1024,
    source: 'commons',
    license: 'CC BY-SA 4.0',
    attribution: 'Kakidai',
    fetchedAt: '2026-08-05T10:00:00.000Z',
    confidence: 1,
    method: 'settled_id',
    ref: 'Skytree.jpg',
  },
};

/** Requests the app made for a candidate's enrichment — the trigger is "on tap only", so how many
 *  there are is part of what this spec asserts. */
type Asked = { url: string; body: unknown }[];

async function boot(page: Page, width: number, known: unknown = KNOWN): Promise<Asked> {
  const asked: Asked = [];
  await page.setViewportSize({ width, height: 844 });
  await page.route(
    (u) => u.pathname.startsWith('/enrichment/images/'),
    (r) =>
      r.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          'base64',
        ),
      }),
  );
  // Google's half, stubbed at the relay — the SKU that returns coordinates (ADR-0132 §7).
  await page.route(
    (u) => u.pathname === `/trips/${TRIP_ID}/places/search-text`,
    (r) => r.fulfill({ json: [RESULT] }),
  );
  // The one enrichment read a client asks for (§17). It answers with what a pass found.
  await page.route(
    (u) => u.pathname === `/trips/${TRIP_ID}/enrichment/lookup`,
    (r) => {
      asked.push({ url: r.request().url(), body: r.request().postDataJSON() });
      r.fulfill({ json: known });
    },
  );
  await bootIntoTrip(page, { now: todayAt('02:00'), dates: shortLiveTripDates() });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: 'מפה' }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  return asked;
}

/** Search for the candidate — the row exists, collapsed, and nothing has been asked yet. */
async function find(page: Page) {
  await page.locator('.map-search-btn').click();
  await page.getByPlaceholder('שם או כתובת').fill('skytree');
  const row = page.locator('[data-result="g-sky"]');
  await expect(row).toBeVisible();
  return row;
}

/** Tap it — the gesture that both selects it and asks (the owner's "on tap only"). */
async function findAndTap(page: Page) {
  const row = await find(page);
  await row.locator('.map-res-open').click();
  return row;
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const round = (r: DOMRect) => ({
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      right: Math.round(r.right),
    });
    const row = document.querySelector('[data-result="g-sky"]') as HTMLElement;
    const hero = row.querySelector('.map-hero') as HTMLElement;
    const img = hero.querySelector('img') as HTMLElement;
    const credit = row.querySelector('.map-credit') as HTMLElement;
    const block = row.querySelector('.map-sum') as HTMLElement;
    const prose = block.querySelector('.map-sum-t') as HTMLElement;
    const name = row.querySelector('.map-name') as HTMLElement;
    const main = row.querySelector('.map-main') as HTMLElement;
    const add = row.querySelector('.map-addmaybe') as HTMLElement;
    const out = row.querySelector('.map-res-out') as HTMLElement;
    return {
      row: round(row.getBoundingClientRect()),
      hero: round(hero.getBoundingClientRect()),
      img: round(img.getBoundingClientRect()),
      objectFit: getComputedStyle(img).objectFit,
      credit: round(credit.getBoundingClientRect()),
      creditText: credit.textContent ?? '',
      block: round(block.getBoundingClientRect()),
      prose: round(prose.getBoundingClientRect()),
      lineHeight: parseFloat(getComputedStyle(prose).lineHeight),
      lineClamp: getComputedStyle(prose).webkitLineClamp,
      // The clamp, proved rather than assumed: the text does not fit the box it is given.
      clamped: prose.scrollHeight > prose.clientHeight + 1,
      main: round(main.getBoundingClientRect()),
      nameLines: name.getClientRects().length,
      // The row's two controls have to survive the blocks arriving under them (ADR-0017).
      add: round(add.getBoundingClientRect()),
      out: round(out.getBoundingClientRect()),
    };
  });
}

for (const width of WIDTHS) {
  test.describe(`the deciding card @${width}`, () => {
    // **The mockup's own numbers** for the deciding column: a 130px hero at radius 12, the credit
    // under it, and the summary at THREE lines — the two-line clamp is the committed card's
    // variant, and this is the state §9.1 measured.
    test('is a 130px hero, a credit and three lines of summary', async ({ page }) => {
      await boot(page, width);
      await findAndTap(page);
      await expect(page.locator('.map-hero')).toBeVisible();
      const m = await measure(page);

      expect(m.hero.h).toBe(130);
      expect(m.img.w).toBe(m.hero.w);
      expect(m.img.h).toBe(m.hero.h);
      // The measured aspect range is 0.54–1.78, so a `contain` would letterbox six in 32.
      expect(m.objectFit).toBe('cover');
      expect(m.lineClamp).toBe('3');
      expect(m.clamped).toBe(true);
      expect(m.prose.h).toBeGreaterThanOrEqual(Math.round(3 * m.lineHeight) - 1);
      expect(m.prose.h).toBeLessThanOrEqual(Math.round(3 * m.lineHeight) + 1);
      expect(m.creditText).toContain('CC BY-SA 4.0');
    });

    // Each block takes its own full-width line, which is the whole reason `PlaceKnowledge` renders
    // a FRAGMENT: they are children of the row's own wrapping layout, so the identity line above
    // them must not reflow to make room.
    test('takes full-width lines and reflows nothing above them', async ({ page }) => {
      await boot(page, width);
      const row = await find(page);
      const before = await page.evaluate(() => {
        const main = document.querySelector('[data-result="g-sky"] .map-main') as HTMLElement;
        return Math.round(main.getBoundingClientRect().width);
      });
      await row.locator('.map-res-open').click();
      await expect(page.locator('.map-hero')).toBeVisible();
      const m = await measure(page);

      expect(m.nameLines).toBe(1);
      expect(m.main.w).toBe(before);
      // Stacked in the order the design puts them in: picture, credit, words.
      expect(m.hero.top).toBeGreaterThanOrEqual(m.main.top + m.main.h);
      expect(m.credit.top).toBeGreaterThanOrEqual(m.hero.top + m.hero.h);
      expect(m.block.top).toBeGreaterThanOrEqual(m.credit.top + m.credit.h);
      expect(m.hero.w).toBeGreaterThan(m.main.w);
      // And the row grew by the blocks rather than by a reflow.
      expect(m.row.h).toBeGreaterThan(m.hero.h + m.credit.h + m.block.h);
    });

    // The credit stays on the card's own edge — §8.2's point: the bug is making the element LTR,
    // which orphans it to the opposite edge from every other line while reading correctly.
    test('keeps the credit on the row’s own edge, and the controls at their floor', async ({
      page,
    }) => {
      await boot(page, width);
      await findAndTap(page);
      await expect(page.locator('.map-hero')).toBeVisible();
      const m = await measure(page);

      // Against the hero rather than the name, which is inset by the badge and its gap.
      expect(Math.abs(m.credit.right - m.hero.right)).toBeLessThanOrEqual(1);
      // ADR-0017's floor on the way out, still met with three blocks under it.
      expect(m.out.h).toBeGreaterThanOrEqual(44);
      expect(m.out.w).toBeGreaterThanOrEqual(44);
      // And both controls stay on the IDENTITY line: the blocks arrive underneath them rather
      // than pushing the row's two verbs down the card.
      expect(m.add.top).toBeLessThan(m.hero.top);
      expect(m.out.top).toBeLessThan(m.hero.top);
    });
  });
}

// **One tap, one ask** (the owner's trigger). A search returns several candidates and most of them
// nobody keeps, so the list is not enriched — and asking twice about the same place is the way a
// polite trigger turns rude.
test('asks once, for the place you tapped @390', async ({ page }) => {
  const asked = await boot(page, 390);
  const row = await findAndTap(page);
  await expect(page.locator('.map-hero')).toBeVisible();

  expect(asked).toHaveLength(1);
  expect(asked[0].body).toEqual({
    googlePlaceId: 'g-sky',
    name: 'Tokyo Skytree',
    lat: 35.7101,
    lng: 139.8107,
  });

  // Tapping it again is not a second question.
  await row.locator('.map-res-open').click();
  await expect(page.locator('.map-hero')).toBeVisible();
  expect(asked).toHaveLength(1);
});

// The majority case (ADR-0166 §11.3): 0 of 7 Tokyo restaurants had an image. An empty answer is a
// complete state, so the row is the row it always was — no block, no banner, no skeleton left
// behind.
test('is the row it always was for a place the sources cannot describe @390', async ({ page }) => {
  await boot(page, 390, {});
  const row = await findAndTap(page);

  await expect(row).toHaveClass(/selected/);
  await expect(row.locator('.map-hero')).toHaveCount(0);
  await expect(row.locator('.map-sum')).toHaveCount(0);
  await expect(page.locator('.wp-banner')).toHaveCount(0);
  // Its way to more is the one it always had (ADR-0134 §5).
  await expect(row.locator('.map-res-out')).toBeVisible();
});
