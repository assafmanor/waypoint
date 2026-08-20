// **AN IDEA REACHES ITS OWN PIN** (ADR-0121 §8's 2026-08-04 amendment).
//
// §8's rule — every event and booking has an easy way to its pin, in both modes — was on
// `EventCard`, `BuilderRow` and `TransitionRow`, and not on `MaybeCard`. That is the wrong
// entity to have missed: every place added from the map outside an errand becomes a shelf
// idea, so the shelf is where map research accumulates, and with thirty ideas on it
// "where is this one?" is the first question asked.
//
// **This spec is a MEASUREMENT, and that is why it is here rather than in the unit suite.**
// `PlaceBadge`'s own header records what killed its first draft: a separate control in the
// row's trailing slot, which took a title from one line to two at 390px and to five at 360px.
// The badge is meant to cost nothing because it is already there — and "costs nothing" is a
// claim about boxes, so it needs real stylesheets and a real layout. jsdom loads no CSS and
// reports every rect as zero, so the unit suite cannot fail this assertion by construction.
//
// The crowded case is Plan mode's tile, which carries the `✕` AND the note mark, so the pin
// has three corner marks to stay clear of rather than one.
import { test, expect, type Page } from '@playwright/test';
import { iconForCategory } from '@waypoint/shared';
import { bootIntoTrip, shortLiveTripDates, todayAt, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const WIDTHS = [390, 360]; // ADR-0017's primary band, both ends
const today = () => new Date().toISOString().slice(0, 10);
const stamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
};

const place = {
  id: 'p-oden',
  tripId: TRIP_ID,
  name: 'אודן קאשימה',
  lat: 35.69,
  lng: 139.7,
  ...stamps,
};

/** Two ideas with the SAME title, so the two cards are comparable box for box: one carries a
 *  place with coordinates, the other carries none. */
const idea = (id: string, placeId?: string) => ({
  id,
  tripId: TRIP_ID,
  title: 'אודן קאשימה בשינג׳וקו',
  icon: '🍜',
  category: 'food',
  placeId,
  consumed: false,
  createdBy: 'u1',
  ...stamps,
});

/** A note on the badged idea, so its tile carries the corner mark too (ADR-0153 §7). */
const note = {
  id: 'n-1',
  tripId: TRIP_ID,
  body: 'הכניסה מאחור',
  source: 'member',
  maybeItemId: 'm-place',
  createdBy: 'u1',
  ...stamps,
};

/** One event, because an empty day renders its empty state instead of the list and shelf. */
const anchor = {
  id: 'ev-1',
  tripId: TRIP_ID,
  date: today(),
  title: 'משהו',
  icon: '📌',
  kind: 'soft',
  status: 'planned',
  startsAt: `${today()}T05:00:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamps,
};

async function boot(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await bootIntoTrip(page, {
    events: [anchor],
    maybeItems: [idea('m-place', 'p-oden'), idea('m-bare')],
    places: [place],
    notes: [note],
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
}

const toDays = (page: Page) => page.locator('nav.nav button', { hasText: t.tabs.days }).click();

/** Both tiles' boxes, and every way the pin could be in the way. Waits for both cards first:
 *  the shelf is below the day list, and measuring a strip that has not rendered yet reads as
 *  "no cards" rather than as a failure. */
async function tiles(page: Page) {
  await expect(page.locator('.wp-maybecard.compact')).toHaveCount(2);
  return page.evaluate(() =>
    ([...document.querySelectorAll('.wp-maybecard.compact')] as HTMLElement[]).map((card) => {
      const badge = card.querySelector('.wp-maybecard-ic') as HTMLElement;
      const mark = card.querySelector('.wp-placebadge-mark') as HTMLElement | null;
      const title = card.querySelector('.wp-maybecard-title') as HTMLElement;
      const c = card.getBoundingClientRect();
      const m = mark?.getBoundingClientRect();
      const tt = title.getBoundingClientRect();
      const area = (a: DOMRect, b: DOMRect) =>
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return {
        badged: !!mark,
        cardH: Math.round(c.height),
        cardW: Math.round(c.width),
        // The whole risk: a control that reflows the title it sits beside.
        titleLines: Math.round(tt.height / parseFloat(getComputedStyle(title).lineHeight)),
        titleW: Math.round(tt.width),
        overTitle: m ? Math.round(area(m, tt)) : 0,
        // The pin must stay inside the tile, and clear of the other two corner marks.
        outsideCard: m ? Math.round(area(m, c)) !== Math.round(m.width * m.height) : false,
        overCorners: m
          ? [...card.querySelectorAll('.note-mark, .wp-maybecard-x, .wp-maybecard-rm')].reduce(
              (sum, o) => sum + area(m, o.getBoundingClientRect()),
              0,
            )
          : 0,
        badgeIsControl: badge.getAttribute('role') === 'button',
        // The teal ring is a `box-shadow`, so it takes the shape of the box it sits on — and
        // this host's glyph is inline content, which gave it square corners (owner, 2026-08-04).
        badgeRadius: parseFloat(getComputedStyle(badge).borderStartStartRadius),
        // A bare pin, not a pin in a disc: nothing behind the glyph.
        markHasDisc: mark ? getComputedStyle(mark).backgroundColor !== 'rgba(0, 0, 0, 0)' : false,
        // The marker's size, and how much of the badge it takes. It was a flat 17px drawn
        // against the 32–40px badges of the three hosts that shipped it, and arrived here at
        // 80% of a 21×17px glyph (owner: "too large").
        markW: m ? Math.round(m.width) : 0,
        markRatio: m ? +(m.width / c.width).toFixed(2) : 0,
        // The tap area, which the badge grows out of flow because this glyph is far smaller
        // than the boxes the pattern was drawn on (ADR-0017).
        hit: (() => {
          const grow = parseFloat(getComputedStyle(badge, '::after').insetBlockStart || '0');
          const b = badge.getBoundingClientRect();
          return {
            box: [Math.round(b.width - 2 * grow), Math.round(b.height - 2 * grow)],
            // Zero, always: a tap on the words must open the row, never the map.
            overTitle: Math.round(
              Math.max(0, Math.min(b.right - grow, tt.right) - Math.max(b.left + grow, tt.left)),
            ),
          };
        })(),
      };
    }),
  );
}

for (const width of WIDTHS) {
  test.describe(`the shelf tile's badge @${width}`, () => {
    test.beforeEach(({ page }) => boot(page, width));

    // The rule the badge already follows everywhere else: "absent, not broken".
    test('is a control only on the idea that has a place with coordinates', async ({ page }) => {
      await toDays(page);
      const [badged, bare] = await tiles(page);
      expect(badged.badged).toBe(true);
      expect(badged.badgeIsControl).toBe(true);
      expect(bare.badged).toBe(false);
      expect(bare.badgeIsControl).toBe(false);
    });

    test('costs the tile nothing — same box, same title, in Trip mode', async ({ page }) => {
      await toDays(page);
      const [badged, bare] = await tiles(page);
      // The claim, measured: the badge was already there, so adding the way in adds no box.
      expect(badged.cardH).toBe(bare.cardH);
      expect(badged.cardW).toBe(bare.cardW);
      expect(badged.titleLines).toBe(bare.titleLines);
      expect(badged.titleW).toBe(bare.titleW);
      expect(badged.overTitle).toBe(0);
      expect(badged.outsideCard).toBe(false);
    });

    // Plan's tile is the crowded one: a `✕` at one top corner and the note mark at the other.
    // **The marker is proportional to the badge it sits on** (owner, 2026-08-04: "the icon for
    // the map pin is too large"). The flat 17px was 42% of `EventCard`'s 40px badge and 80% of
    // this glyph, so the size became a variable this host re-points — and the numbers are the
    // reason the variable exists, so they are asserted rather than described.
    test('wears a marker sized for THIS badge, not for a box twice as big', async ({ page }) => {
      await toDays(page);
      const [badged] = await tiles(page);
      expect(badged.markW).toBeLessThan(17); // the flat size the big badges were drawn with
      expect(badged.markRatio).toBeLessThan(0.7);
    });

    // 21×17 is a long way under ADR-0017's floor, and this host is the one that introduced a
    // badge that small. The target grows out of flow, as far as the card's own padding allows.
    // Both halves of the owner's second report (2026-08-04).
    test('wears a bare teal pin, on a ring with rounded corners', async ({ page }) => {
      await toDays(page);
      const [badged] = await tiles(page);
      expect(badged.markHasDisc).toBe(false);
      expect(badged.badgeRadius).toBeGreaterThan(0);
    });

    test('grows its tap area without any of it landing on the title', async ({ page }) => {
      await toDays(page);
      const [badged] = await tiles(page);
      expect(badged.hit.box[0]).toBeGreaterThan(30);
      expect(badged.hit.box[1]).toBeGreaterThan(26);
      expect(badged.hit.overTitle).toBe(0);
    });

    test('stays clear of the ✕ and the note mark, in Plan mode', async ({ page }) => {
      await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
      await toDays(page);
      await expect(page.locator('.builder-side')).toBeVisible({ timeout: 20_000 });

      const [badged, bare] = await tiles(page);
      expect(badged.badged).toBe(true);
      expect(badged.overCorners).toBe(0);
      expect(badged.overTitle).toBe(0);
      expect(badged.outsideCard).toBe(false);
      // …and still no reflow, with the ✕ taking width from the title on both cards.
      expect(badged.titleLines).toBe(bare.titleLines);
      expect(badged.titleW).toBe(bare.titleW);
    });
  });
}

test('the badge routes to the Map tab focused on that place', async ({ page }) => {
  await boot(page, 390);
  await toDays(page);
  await expect(page.locator('.wp-maybecard.compact')).toHaveCount(2);
  await page.locator('.wp-maybecard-ic.wp-placebadge').first().click();
  // The Map tab — an in-app destination, not Google's (ADR-0121 §8). The FOCUS itself is
  // in-memory (`requestFocus`, consumed once by the Map), not a URL param, so the routing is
  // what is assertable here; the hermetic e2e has no Maps key and so no canvas to land on.
  await expect(page).toHaveURL(/[?&]tab=map/);
});

test('the tap does not also open the idea sheet behind it', async ({ page }) => {
  await boot(page, 390);
  await toDays(page);
  await expect(page.locator('.wp-maybecard.compact')).toHaveCount(2);
  await page.locator('.wp-maybecard-ic.wp-placebadge').first().click();
  // The badge sits inside a card that is itself a button, so the tap must not do both
  // (`PlaceBadge` stops propagation for exactly this).
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// **AND THE GLYPH INSIDE THAT BADGE IS THE PLACE'S** (owner, 2026-08-20: _"maybe items added
// from the map don't inherit the place category and icon"_ — ADR-0165 §4's amendment).
//
// The fixtures above carry a glyph and a category of their own, which is the case that always
// worked. This is the one the map actually produces: `verbs.addMaybe` stores the shelf's `💡`
// when nothing was picked, and the pills that said `food` wrote to the PLACE — so the tile sat
// there as a lightbulb beside a pin the same gesture had coloured and glyphed correctly.
//
// Here rather than in the unit suite because the tile's glyph is the reported artefact and this
// file is where the tile is measured; `lib/shelf.test.ts` pins the resolution itself.
test('the tile shows the glyph its place resolves, not the shelf placeholder', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootIntoTrip(page, {
    events: [anchor],
    // The map's own output: no glyph picked, no category on the idea, both on the place.
    maybeItems: [
      {
        id: 'm-map',
        tripId: TRIP_ID,
        title: 'המקום מהמפה',
        icon: '💡',
        placeId: place.id,
        consumed: false,
        createdBy: 'u1',
        ...stamps,
      },
    ],
    places: [{ ...place, category: 'food' }],
    now: todayAt('02:00'),
    dates: shortLiveTripDates(),
  });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await toDays(page);
  const badge = page.locator('.wp-maybecard.compact .wp-maybecard-ic').first();
  await expect(badge).toHaveText(iconForCategory('food'));
});
