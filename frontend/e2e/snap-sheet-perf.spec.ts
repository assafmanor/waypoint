// **THE SHEET DRAG'S MAIN-THREAD COST, COUNTED** (ADR-0122 §4's 2026-09-15 amendment §6).
//
// An instrument, not a gate: it prints Chromium's own counters (`Performance.getMetrics`) for
// three 60-move gestures and asserts nothing, because a threshold on a shared CI runner is a
// flake generator. Run it by hand when touching the drag:
//
//     E2E_PERF=1 pnpm --filter @waypoint/frontend e2e e2e/snap-sheet-perf.spec.ts --workers=1
//
// What it read on 2026-09-15, before and after the drag stopped going through React state:
//
//     sheet drag (list at its bottom)   script 69ms → 14ms   task 158ms → 70ms   layouts 59 → 59
//     list pan, then hand-off           script 26ms →  7ms   task  56ms → 36ms
//     pure list pan (the browser's)     script  5ms →  6ms   layouts 0 → 0
//
// The layouts did not move and are not meant to: one height write per frame is one layout per
// frame, and that is the drag. What the counters cannot show is the other half of that change —
// a non-passive `touchmove` listener makes the browser wait on the main thread before every
// scroll frame, and the list phase now listens passively, so the pan is the compositor's alone.
//
// Same harness as `snap-sheet-drag.spec.ts` (the real component, dev server only).
import { test, type CDPSession, type Page } from '@playwright/test';
import { dispatchTouch } from './touch';

test.skip(process.env.E2E_PERF !== '1', 'an instrument, run by hand with E2E_PERF=1');

const PANE = 600;
const HALF = Math.round(PANE * 0.56);
const X = 195;
const MOVES = 60;

async function mount(page: Page, view: 'half' | 'full', contentPx = 4000) {
  await page.setViewportSize({ width: 390, height: PANE + 40 });
  await page.goto(`/e2e/snap-sheet-harness.html?view=${view}&content=${contentPx}`);
  await page.waitForSelector('.wp-snapsheet');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return cdp;
}

type Counters = { layout: number; style: number; scriptMs: number; taskMs: number };
async function counters(cdp: CDPSession): Promise<Counters> {
  const { metrics } = (await cdp.send('Performance.getMetrics')) as {
    metrics: { name: string; value: number }[];
  };
  const read = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
  return {
    layout: read('LayoutCount'),
    style: read('RecalcStyleCount'),
    scriptMs: read('ScriptDuration') * 1000,
    taskMs: read('TaskDuration') * 1000,
  };
}
const delta = (a: Counters, b: Counters): Counters => ({
  layout: b.layout - a.layout,
  style: b.style - a.style,
  scriptMs: Math.round(b.scriptMs - a.scriptMs),
  taskMs: Math.round(b.taskMs - a.taskMs),
});

/** One finger, one move per frame, as a real 60Hz gesture arrives. */
async function drag(cdp: CDPSession, y: number, dy: number) {
  const t0 = Date.now() / 1000;
  await dispatchTouch(cdp, 'touchStart', [{ x: X, y }], t0);
  for (let i = 1; i <= MOVES; i++) {
    await dispatchTouch(cdp, 'touchMove', [{ x: X, y: y + (dy * i) / MOVES }], t0 + i * 0.016);
  }
  await dispatchTouch(cdp, 'touchEnd', [], t0 + (MOVES + 1) * 0.016);
}

async function measure(cdp: CDPSession, label: string, gesture: () => Promise<void>) {
  const before = await counters(cdp);
  await gesture();
  console.log(label, JSON.stringify(delta(before, await counters(cdp))));
}

test('sheet drag, the list already at its bottom', async ({ page }) => {
  const cdp = await mount(page, 'half');
  await page.evaluate(() => {
    (document.querySelector('.wp-snapsheet-body') as HTMLElement).scrollTop = 99999;
  });
  await measure(cdp, 'SHEET_DRAG', () => drag(cdp, PANE - HALF + 120, -200));
});

test('list pan, then the hand-off to the sheet', async ({ page }) => {
  const cdp = await mount(page, 'half', HALF - 52 + 150);
  await measure(cdp, 'HANDOFF_DRAG', () => drag(cdp, PANE - HALF + 120, -320));
});

test('pure list pan, the browser’s own', async ({ page }) => {
  const cdp = await mount(page, 'full');
  await measure(cdp, 'LIST_PAN', () => drag(cdp, 200, -300));
});
