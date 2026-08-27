import { chromium } from '@playwright/test';
const OUT =
  '/tmp/claude-0/-home-user-waypoint/a2981261-6a80-5c52-9a63-246359e23632/scratchpad/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
await page.addInitScript(
  (now) => localStorage.setItem('waypoint:dev-now', String(now)),
  Date.UTC(2026, 7, 27, 16, 25),
);
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
console.log(
  'TILE:',
  await page.evaluate(() => {
    const el = document.querySelector('.wp-board-countdown');
    return [
      el.querySelector('.t')?.textContent,
      ...[...el.querySelectorAll('.u')].map((u) => u.textContent),
    ].join(' / ');
  }),
);
await page.screenshot({ path: `${OUT}/tile-after.png` });
await page.goto('http://localhost:5173/?tab=days&day=2026-08-27', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
console.log(
  'ROW :',
  await page.evaluate(() =>
    [...document.querySelectorAll('.day-trv-meta')]
      .map((m) => m.textContent)
      .filter(Boolean)
      .join(' | '),
  ),
);
await page.screenshot({ path: `${OUT}/row-after.png` });
await browser.close();
