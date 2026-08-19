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
//  3. the lead IS a press, and it answers for the whole checklist (§3, reversed 2026-08-19).
//     It was first drawn as a read, on the argument that a derived completion has nothing to
//     press; the owner's reply is that a checklist has an obvious bulk verb and the ring is
//     where a hand reaches for it.
//
// And a fourth, which is geometry and therefore lives only here: a step's text starts at the
// same x as its parent's TITLE. The first build indented the checklist by a number written as
// "14px of card inset + the 44px lead" and landed 7px short of anything, which is what the
// owner saw as a stray tab.
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

  // 1 — the lead is a CONTROL, and its name says both what a press does and where the
  // checklist stands, because the arc is the only other place that says the latter.
  const lead = parentRow.locator('.wp-listrow-lead');
  const ring = lead.getByRole('button');
  await expect(ring).toHaveAttribute('aria-label', t.tasks.subtasks.tickAll('יציאה לשדה', 2, 5));
  await expect(ring).toHaveAttribute('aria-pressed', 'false');
  // …and the ordinary task beside it still has its own, unchanged.
  await expect(plainRow.locator('.wp-listrow-lead button')).toHaveCount(1);

  // 2 — the arc is really drawn. `conic-gradient` on the `::after`, masked to a band: a class
  // that resolved to nothing would report `none` here, which is precisely how a tick once
  // shipped unpainted.
  const arc = await ring.evaluate((el) => {
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

/** The harness mocks the snapshot, not the writes — so without this a PATCH fails and the
 *  optimistic tick rolls straight back, which the first run of the spec below watched happen
 *  (2/5 → 3/5 → 2/5). Echoing the write is also what makes the reconcile real rather than
 *  skipped: an assertion against an optimistic row that the server then rejects is an
 *  assertion about nothing. */
const STAMP = '2026-08-19T09:00:00.000Z';
/** **Absent, not `null`** — the shape `toTaskDto` sends, which is not the shape the row holds.
 *  `taskSchema`'s optionals are `.optional()` and not `.nullable()`, so `settledAt: null` fails
 *  the client's parse and the write rolls back exactly as a 404 would: a mock echoing the
 *  DATABASE rather than the DTO tests nothing and looks like a product bug. */
const stamped = (row: Record<string, unknown>, settling: boolean) => ({
  ...row,
  ...(settling ? { settledAt: STAMP, settledBy: 'u1' } : {}),
  updatedAt: STAMP,
  updatedBy: 'u1',
});

async function acceptTaskWrites(page: Page) {
  await page.route(
    (u) => /\/trips\/t1\/tasks\/[^/]+$/.test(u.pathname),
    async (route) => {
      // **Match by METHOD too.** A DELETE hits this same path and carries no body, so reading
      // `postDataJSON().status` threw inside the handler — the request then never resolved and
      // the assertion downstream reported `undefined` rather than a failure anyone could read.
      if (route.request().method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
      const id = route.request().url().split('/').pop()!;
      const patch = route.request().postDataJSON() as Record<string, unknown>;
      const before = TASKS.find((x) => x.id === id)!;
      // Reopening drops the settlement rather than nulling it, same as the DTO.
      const { settledAt: _a, settledBy: _b, ...rest } = { ...before, ...patch };
      await route.fulfill({ json: stamped(rest, patch.status === 'done') });
    },
  );
  await page.route(
    (u) => u.pathname === '/trips/t1/tasks',
    async (route) => {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: stamped(
          {
            tripId: TRIP_ID,
            dueHasTime: false,
            important: false,
            status: 'open',
            createdBy: 'u1',
            createdAt: STAMP,
            ...input,
          },
          false,
        ),
      });
    },
  );
}

test('a press on the ring settles the whole checklist', async ({ page }) => {
  await bootIntoTrip(page, { tasks: TASKS });
  await acceptTaskWrites(page);
  await openTasksScreen(page);

  const parentRow = page.locator('.wp-listrow', { hasText: 'יציאה לשדה' });
  await parentRow.locator('.wp-listrow-lead button').click();

  // One press wrote several rows, so it is confirmed once and undoable once. Asserted FIRST
  // because it is the transient half: the toast retires itself after `TOAST_DURATION_MS`.
  //
  // **THREE, not five.** Two of this parent's steps were already settled, and the toast
  // reports what the press WROTE rather than what the checklist now totals — which is the
  // same number the undo will put back. The first draft of this line asserted 5 and the
  // browser said 3, which is the distinction worth keeping.
  await expect(page.locator('.toast')).toContainText(t.tasks.subtasks.allTicked(3));
  await expect(page.locator('.toast .undo')).toBeVisible();

  // Every step is settled, so the parent's DERIVED status is done and the count says so. The
  // steps are the rows that were written; the parent's own row was not, which is what keeps a
  // stored `done` from ever going stale.
  await expect(parentRow.locator('.tsk-count')).toHaveText(/5\/5/);
  await expect(parentRow.locator('.wp-listrow-lead button')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test("a step's text starts where its parent's title does", async ({ page }) => {
  await bootIntoTrip(page, { tasks: TASKS });
  await openTasksScreen(page);
  await page.locator('.wp-listrow-open', { hasText: 'יציאה לשדה' }).click();
  await expect(page.locator('.tsk-kids .note-item').first()).toBeVisible();

  // **The indent has to land on something, and jsdom cannot see that it does.** Measured in
  // the running app at 390 before the fix: title at x=319, step tick painting to x=312 — an
  // arbitrary 7px. The step's TEXT is what carries the meaning, so that is what is aligned;
  // the ticks then step outboard toward the ring, which is the hierarchy.
  const edges = await page.evaluate(() => {
    const title = document.querySelector('.wp-listrow .tsk-title-txt')?.getBoundingClientRect();
    const stepText = document.querySelector('.tsk-kids .note-item-b')?.getBoundingClientRect();
    return { title: title?.right ?? 0, step: stepText?.right ?? 0 };
  });
  expect(Math.abs(edges.title - edges.step)).toBeLessThanOrEqual(1);
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

// **THE EDITOR OFFERS THE COMPOSER ON A TASK THAT ALREADY HAS STEPS** (ADR-0196 §12; owner,
// 2026-08-19: _"task editing doesn't have the option to add or remove sub tasks"_).
//
// The field was documented from the start as opening by itself once there are steps, and it
// passed only the reveal flag — whose control lives in the EMPTY branch. So a task with a
// checklist rendered a read-only list and there was no control anywhere to bring the box back.
// Nothing could fail: the sheet has no component spec, and the class-name and paint tests read
// CSS rather than which props a host passes.
test('the editor can add to a checklist that already exists', async ({ page }) => {
  await bootIntoTrip(page, { tasks: TASKS });
  await acceptTaskWrites(page);
  await openTasksScreen(page);

  await page.locator('.wp-listrow-open', { hasText: 'יציאה לשדה' }).click();
  await page.getByRole('button', { name: t.tasks.manage.edit }).click();

  const sheet = page.locator('.task-sheet');
  await expect(sheet).toBeVisible();
  // The five steps are there to read…
  await expect(sheet.locator('.tsk-kids .note-item')).toHaveCount(6); // 5 steps + the composer
  // …and the box to add a sixth is there without pressing anything.
  const box = sheet.getByLabel(t.tasks.subtasks.add);
  await expect(box).toBeVisible();

  // It must NOT have taken the caret: the box is showing because the field is a list, not
  // because anyone asked for it, and stealing focus here opens the phone's keyboard on every
  // edit of a task with a checklist.
  await expect(box).not.toBeFocused();

  // **A title no fixture already carries.** The first draft typed `לשלם על החניה`, which is
  // one of the five steps above — the assertion then matched two elements and read for a
  // while like a double write. A fixture that collides with the value under test is a bug
  // report about the app that is really a bug in the spec.
  await box.fill('לסגור את הדלת');
  await box.press('Enter');
  await expect(sheet.getByText('לסגור את הדלת')).toBeVisible();
  // The box clears and stays for the next one: a checklist is written in a burst.
  await expect(box).toHaveValue('');
  await expect(sheet.locator('.tsk-kids .note-item')).toHaveCount(7);
});

// **THE TWO CONTROLS BESIDE THE BOX, PRESSED WITH WORDS STILL IN IT** (owner, 2026-08-19:
// _"removing a sub task doesn't always work, if there's text … assigning a sub task ui doesn't
// work most of the time … instead of opening the options it just opens another sub task"_).
//
// One bug with two faces, and only a real browser has the focus order that produces it: the
// box commits on blur, and a tap on either control blurs it first. jsdom fires no focus at all
// on `fireEvent.click`, so the unit suite can pin the guards and not the gesture.
/** Reduced motion, so the composer's own scroll is not a moving target. Committing a step
 *  scrolls the box back into view with `behavior: 'smooth'` (ADR-0196 §13), and a control that
 *  is still travelling never satisfies Playwright's scroll-into-view — not even under `force`,
 *  which skips the actionability checks but still scrolls. The app reads `prefersReducedMotion`
 *  for exactly this, so asking the browser for it makes the scroll instant rather than mocking
 *  anything. `force` itself is here for the reason the row's own press uses it in this file:
 *  the reveal list never reports two identical frames. */
async function openStepsOf(page: Page, title: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bootIntoTrip(page, { tasks: TASKS });
  await acceptTaskWrites(page);
  await openTasksScreen(page);
  await page.locator('.wp-listrow-open', { hasText: title }).click();
}

test('the assignee chip opens the picker rather than writing the words in the box', async ({
  page,
}) => {
  await openStepsOf(page, 'יציאה לשדה');
  const writes: string[] = [];
  page.on('request', (r) => r.method() !== 'GET' && writes.push(r.method()));

  await page.getByRole('button', { name: t.tasks.subtasks.add }).click();
  const box = page.getByLabel(t.tasks.subtasks.add);
  await box.fill('לסגור את הדלת');
  await page.getByLabel(t.tasks.subtasks.assign).click({ force: true });

  // The picker is what opens. Before the fix the box blurred into the press, committed, and a
  // whole new step appeared instead — the owner's "it just opens another sub task".
  await expect(page.locator('.modal-card')).toBeVisible();
  expect(writes).toEqual([]);
  // …and the words are still in the box, waiting for the assignee to be chosen.
  await expect(box).toHaveValue('לסגור את הדלת');
});

test('✕ removes the step even with words in the box, and writes no rename', async ({ page }) => {
  await openStepsOf(page, 'יציאה לשדה');
  const writes: string[] = [];
  page.on('request', (r) => r.method() !== 'GET' && writes.push(r.method()));

  // Tapping a step's words returns it to the composer, which is where `✕` lives.
  await page.getByText('צק-אין אונליין').click({ force: true });
  await page.getByLabel(t.tasks.subtasks.add).fill('צק-אין אונליין ועוד משהו');
  await page.getByLabel(t.tasks.subtasks.remove).click({ force: true });

  // The step is gone — before the fix the pending words committed first, `reset()` returned the
  // row to a read row, and the `✕` unmounted before the click could land on it.
  await expect(page.getByText('צק-אין אונליין')).toHaveCount(0);
  // Four left and NO composer: removing ran `reset()`, which closes the editor, and on this
  // surface the composer only shows while the foot's `＋` has revealed it.
  await expect(page.locator('.tsk-kids .note-item')).toHaveCount(4);
  // One DELETE and nothing else — the rename it was about to write never happened.
  expect(writes).toEqual(['DELETE']);
});
