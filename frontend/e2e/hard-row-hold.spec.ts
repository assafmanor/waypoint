// Browser-contract e2e for **the hold a hard row cannot obey** (ADR-0199), and for the
// selection rule that turned out to be the same defect seen from the other side.
//
// The owner reported two things — a hard event should animate to say it will not drag, and
// its text (plus every Trip-day row's) should stop selecting. Both are browser facts the
// unit suite is structurally unable to see:
//
//   • **Whether the beat ANIMATES.** jsdom has no CSS engine, so `motionDurationMs` answers
//     0 there and every unit assertion takes the no-animation branch by construction. That
//     the `.is-pinned` class lands is a unit test; that a keyframe named `bld-pinned` is
//     actually running on the row is only ever this.
//   • **Whether text selects.** `user-select` is a rendering property. jsdom reports the
//     computed value (which the mockup measured) and has no selection model behind it, so
//     "a long press selects the title" can only be asked of a real engine.
//
// Driven through CDP touch events for the same reason `shelf-drag.spec.ts` is:
// `page.touchscreen` can only tap, and this whole file is about the 500ms in between.
import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { bootIntoTrip, shortLiveTripDates, todayAt } from './boot';
import { dispatchTouch } from './touch';
import { DRAG_HOLD_MS } from '../src/constants';
import { BEAT } from '../src/lib/one-shot';
import { t } from '../src/i18n/he';

// Phone-sized and touch-capable: `hasTouch` is what makes the browser arbitrate
// scroll-vs-gesture at all, and the refusal is a touch answer first (ADR-0017).
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const TODAY = new Date().toISOString().slice(0, 10); // trip timezone is UTC

const event = (id: string, kind: 'hard' | 'soft', hhmm: string, title: string) => ({
  id,
  tripId: 't1',
  date: TODAY,
  title,
  kind,
  status: 'planned',
  source: 'manual',
  sortOrder: kind === 'hard' ? 1 : 2,
  startsAt: `${TODAY}T${hhmm}:00.000Z`,
  endsAt: `${TODAY}T${hhmm}:30.000Z`,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  updatedBy: 'u1',
});

const HARD_TITLE = 'טיסה לפרנקפורט';
const SOFT_TITLE = 'ארוחת ערב';
const EVENTS = [
  event('ev-hard', 'hard', '09:00', HARD_TITLE),
  event('ev-soft', 'soft', '19:00', SOFT_TITLE),
];

const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
  dispatchTouch(cdp, type, [{ x, y }]);

/** The Plan builder's hard row. `.bld:not(.soft)` is the kind distinction the stylesheet
 *  itself draws (a solid border against soft's dashed), so it is the honest selector. */
const hardRow = (page: Page) => page.locator('.builder-main .bld:not(.soft)').first();
const softRow = (page: Page) => page.locator('.builder-main .bld.soft').first();

async function openPlanDayBuilder(page: Page) {
  await page.getByRole('button', { name: t.mode.plan, exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-mode', 'plan');
  await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
  await expect(page.locator('.builder-side')).toBeVisible({ timeout: 20_000 });
}

async function boot(page: Page) {
  // Pinned for the same reason the shelf spec pins: the builder's height depends on the
  // day's phase, and an unpinned run means a different page after midnight UTC.
  await bootIntoTrip(page, { events: EVENTS, now: todayAt('15:00'), dates: shortLiveTripDates() });
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
}

/** Press and hold the centre of a row for long enough to arm, without lifting. */
async function holdOn(page: Page, cdp: CDPSession, locator: ReturnType<typeof hardRow>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('row has no box');
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touch(cdp, 'touchStart', at.x, at.y);
  await page.waitForTimeout(DRAG_HOLD_MS + 120);
  return at;
}

/** The running animations on an element, by keyframe name — the only question a real
 *  engine can answer and jsdom cannot. */
const animationNames = (locator: ReturnType<typeof hardRow>) =>
  locator.evaluate((el) =>
    el.getAnimations().map((a) => (a as unknown as { animationName?: string }).animationName ?? ''),
  );

test.describe('a hard row answers the hold it cannot obey', () => {
  test('the beat really runs on the row, and nothing is dragged', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await boot(page);
    await openPlanDayBuilder(page);
    const row = hardRow(page);
    await expect(row).toContainText(HARD_TITLE);

    // At rest, nothing is running.
    expect(await animationNames(row)).not.toContain('bld-pinned');

    // `holdOn` returns ~120ms into a 240ms beat, which is what makes the reading below
    // possible at all: `getAnimations()` reports nothing once an animation has finished,
    // so this question can only be asked while it is still in flight.
    await holdOn(page, cdp, row);
    await expect(row).toHaveClass(new RegExp(BEAT.PINNED));
    expect(await animationNames(row)).toContain('bld-pinned');
    // The lock strains with it, and it is what points at the control that DOES move a
    // hard event — `hardLock` renders inside `button.bld-time` (ADR-0199 §3).
    expect(await animationNames(row.locator('.hard-lock'))).toContain('hard-lock-strain');

    // Nothing armed: no page-wide selection kill, and no ghost following the finger.
    await expect(page.locator('body')).not.toHaveClass(/wp-dragging/);
    await expect(page.locator('.wp-dragghost')).toHaveCount(0);

    await touch(cdp, 'touchEnd');
  });

  // The release must not read as a tap. The row's body opens its read (ADR-0174 §4), and a
  // hold that ends by opening the thing it just refused to move is the same class of defect
  // as a drop reading as a tap.
  test('releasing the hold does not open the row', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await boot(page);
    await openPlanDayBuilder(page);
    const row = hardRow(page);

    await holdOn(page, cdp, row);
    await touch(cdp, 'touchEnd');

    await page.waitForTimeout(200);
    await expect(page.locator('.wp-modal')).toHaveCount(0);
    await expect(row).toBeVisible();
  });

  test('a soft row still lifts — the refusal is about the hard one only', async ({
    page,
    context,
  }) => {
    const cdp = await context.newCDPSession(page);
    await boot(page);
    await openPlanDayBuilder(page);
    const row = softRow(page);
    await expect(row).toContainText(SOFT_TITLE);

    await holdOn(page, cdp, row);
    await expect(page.locator('body')).toHaveClass(/wp-dragging/);
    await expect(row).not.toHaveClass(new RegExp(BEAT.PINNED));

    await touch(cdp, 'touchEnd');
  });
});

// ADR-0199 §4. The rule was keyed on `.draggable`, and the key was the bug: the two rows
// that never drag were the two that selected.
test.describe('a day row is a gesture, not a document', () => {
  /** Try to select the row's text the way a drag-select would, and report what came out.
   *  `user-select: none` is what makes this answer empty, and it is a rendering property —
   *  there is no jsdom equivalent of this question. */
  const selectedTextIn = (page: Page, selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no element for ${sel}`);
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const text = selection?.toString() ?? '';
      selection?.removeAllRanges();
      return text.trim();
    }, selector);

  test('neither Plan row selects, hard or soft', async ({ page }) => {
    await boot(page);
    await openPlanDayBuilder(page);
    await expect(hardRow(page)).toContainText(HARD_TITLE);

    expect(await selectedTextIn(page, '.builder-main .bld:not(.soft)')).toBe('');
    expect(await selectedTextIn(page, '.builder-main .bld.soft')).toBe('');
  });

  test('the Trip day card does not select either', async ({ page }) => {
    await boot(page);
    // A live trip lands in Trip mode; the day tab is where `.wp-event` lives.
    await page.locator('nav.nav button', { hasText: t.tabs.days }).click();
    await expect(page.locator('.wp-event').first()).toBeVisible({ timeout: 20_000 });

    expect(await selectedTextIn(page, '.wp-event')).toBe('');
  });
});
