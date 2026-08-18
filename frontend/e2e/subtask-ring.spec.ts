// **THE ARC ACTUALLY PAINTS, AND THE PARENT'S ROW DOES NOT GROW FOR IT** (ADR-0196 §3/§6).
//
// This is the half of the feature the unit suite cannot reach, and the repo has paid for that
// gap before: `.tsk-tick-sec` shipped with **no rule at all** and rendered as a white platform
// square on five surfaces while every spec stayed green, because jsdom loads no stylesheet and
// reports every rect as zero. A `className` is a claim; only a browser checks it.
//
// So this pins the three things only a real browser knows about a task holding a checklist:
//
//  1. the arc is genuinely drawn — a `conic-gradient` on a masked layer, not a class name that
//     resolves to nothing (the exact failure mode above, one control over);
//  2. the parent's row is the same height as the leaf beside it — the whole "one noun at one
//     scale" claim, and the reason the count went to the meta line rather than into the ring;
//  3. the lead offers no press. A parent's completion is derived, so a button there would be
//     an inert control in the row's most prominent position — the thing ADR-0188 §4's
//     reversal exists to prevent.
import { test, expect, type Page } from '@playwright/test';
import { bootIntoTrip, TRIP_ID } from './boot';
import { t } from '../src/i18n/he';

const PHONE = { width: 390, height: 844 };

const task = (over: Record<string, unknown>) => ({
  tripId: TRIP_ID,
  dueHasTime: false,
  important: false,
  status: 'open',
  createdBy: 'u-assaf',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'u-assaf',
  ...over,
});

/** A parent with five steps, two done — and a plain task beside it, which is what makes the
 *  height assertion a comparison rather than a number nobody can check. */
const TASKS = [
  task({
    id: 'task-parent-0001',
    title: 'יציאה לשדה',
    dueAt: '2026-08-19T04:30:00.000Z',
    dueHasTime: true,
  }),
  // **The comparison row carries a deadline on purpose.** Without one it prints no meta line
  // at all, and the first run of this spec measured an 18px gap that was the LINE rather than
  // the arc — a height difference the parent's count creates and the ring does not. With both
  // rows carrying one line of meta, what is left to differ is the lead, which is the claim.
  task({
    id: 'task-plainrow-01',
    title: 'להחליף כסף',
    dueAt: '2026-08-20T09:00:00.000Z',
    dueHasTime: true,
  }),
  task({
    id: 'step-000000001',
    title: 'להזמין מונית',
    parentTaskId: 'task-parent-0001',
    status: 'done',
  }),
  task({
    id: 'step-000000002',
    title: 'להדפיס כרטיסים',
    parentTaskId: 'task-parent-0001',
    status: 'done',
  }),
  task({ id: 'step-000000003', title: 'צק-אין אונליין', parentTaskId: 'task-parent-0001' }),
  task({ id: 'step-000000004', title: 'לשלם על החניה', parentTaskId: 'task-parent-0001' }),
  task({ id: 'step-000000005', title: 'להעיר את כולם', parentTaskId: 'task-parent-0001' }),
];

test.use({ viewport: PHONE });

/** The tasks tile is the Index's second (`הזמנות · משימות · מסמכים · פתקים`, ADR-0189's
 *  ordering), reached the way every other Index spec reaches its own screen. */
async function openTasksScreen(page: Page) {
  // `bootIntoTrip` installs the routes; the spec navigates. (`back-index.spec.ts`'s shape.)
  await page.goto('/');
  await expect(page.locator('nav.nav')).toBeVisible();
  await page.locator('nav.nav button', { hasText: t.tabs.index }).click();
  await expect(page).toHaveURL(/[?&]tab=index/);
  await page.locator('.wp-idx-tile', { hasText: t.tasks.title }).click();
  await expect(page.locator('.idx-screen')).toBeVisible();
}

test('a parent reads as an arc and a count, and costs the row nothing', async ({ page }) => {
  await bootIntoTrip(page, { tasks: TASKS });
  await openTasksScreen(page);
  await expect(page.locator('.idx-screen')).toBeVisible();

  const parentRow = page.locator('.wp-listrow', { hasText: 'יציאה לשדה' });
  const plainRow = page.locator('.wp-listrow', { hasText: 'להחליף כסף' });
  await expect(parentRow).toBeVisible();

  // 1 — the lead is a READ. No button in the lead slot at all, so there is no press with
  // nothing to do.
  const lead = parentRow.locator('.wp-listrow-lead');
  await expect(lead.getByRole('img')).toHaveAttribute('aria-label', t.tasks.progress(2, 5));
  await expect(lead.locator('button')).toHaveCount(0);
  // …while the ordinary task beside it still has its control.
  await expect(plainRow.locator('.wp-listrow-lead button')).toHaveCount(1);

  // 2 — the arc is really drawn. `conic-gradient` on the `::after`, masked to a band: a class
  // that resolved to nothing would report `none` here, which is precisely how a tick once
  // shipped unpainted.
  const arc = await lead.getByRole('img').evaluate((el) => {
    const after = getComputedStyle(el, '::after');
    return { background: after.backgroundImage, mask: after.maskImage || after.webkitMaskImage };
  });
  expect(arc.background).toContain('conic-gradient');
  expect(arc.mask).toContain('radial-gradient');

  // 3 — and it costs the row nothing. The parent and the plain task are the same height, which
  // is the "one noun at one scale" claim the count-in-the-meta-line decision was made to keep.
  const parentBox = await parentRow.boundingBox();
  const plainBox = await plainRow.boundingBox();
  expect(Math.abs((parentBox?.height ?? 0) - (plainBox?.height ?? 0))).toBeLessThanOrEqual(1);

  // The count says the same thing the arc does, in the line that exists on every surface.
  await expect(parentRow.locator('.tsk-count')).toHaveText(/2\/5/);
});

test('opening a parent shows its steps, each with a real 44px tick', async ({ page }) => {
  await bootIntoTrip(page, { tasks: TASKS });
  await openTasksScreen(page);

  await page.locator('.wp-listrow-open', { hasText: 'יציאה לשדה' }).click();

  const steps = page.locator('.tsk-kids .note-item');
  await expect(steps).toHaveCount(5);
  await expect(page.getByText('צק-אין אונליין')).toBeVisible();

  // **The touch floor, measured rather than promised** (ADR-0017). `.tsk-tick-sec` holds a
  // 44px target inside a 20px paint through a negative margin — the recipe that shipped
  // unpainted once, so its box is asserted here rather than assumed from the class name.
  const tick = steps.first().getByRole('button').first();
  const box = await tick.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  // And the way in to a checklist is in the foot, on a row that already has one.
  await expect(page.getByRole('button', { name: t.tasks.subtasks.add })).toBeVisible();
});

test('a task with no steps still offers the way in to its first', async ({ page }) => {
  await bootIntoTrip(page, { tasks: [TASKS[1]] });
  await openTasksScreen(page);

  await page.locator('.wp-listrow-open', { hasText: 'להחליף כסף' }).click();

  // If this only appeared on tasks that already had steps, nothing could ever get its first.
  const add = page.getByRole('button', { name: t.tasks.subtasks.add });
  await expect(add).toBeVisible();
  await add.click();
  // …and it reveals the composer rather than opening a form.
  await expect(page.locator('.tsk-kid-compose input')).toBeFocused();
});
