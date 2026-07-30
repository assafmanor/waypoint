import { chromium } from '@playwright/test';
const SC = '/tmp/claude-0/-home-user-waypoint/14ddace6-964d-5e34-a3a1-64a83959aa5c/scratchpad';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const p = await b.newPage({ viewport: { width: 1220, height: 1200 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('file:///home/user/waypoint/mockups/map-make-a-place-v1.html');
await p.waitForTimeout(600);
const m = await p.evaluate(() => {
  const panel = document.querySelector('.icon-panel');
  const card = panel.closest('.map-placecard');
  const cs = getComputedStyle(panel);
  const cr = card.getBoundingClientRect(),
    pr = panel.getBoundingClientRect();
  // does the panel take part in the card's flow?
  const before = cr.height;
  panel.style.display = 'none';
  const after = card.getBoundingClientRect().height;
  panel.style.display = '';
  return {
    panelPosition: cs.position,
    floats: Math.abs(before - after) < 0.5,
    cardH: Math.round(before),
    panelBelowCard: pr.top > cr.top,
  };
});
console.log(m);
const sec = await p.locator('h2:has-text("§C")').locator('xpath=following-sibling::div[1]');
await sec
  .locator('.mk-phone')
  .first()
  .screenshot({ path: `${SC}/c-form.png` });
console.log('errors:', errs.length ? errs : 'none');
await b.close();
