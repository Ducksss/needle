// Captures the console states listed in frontend/README.md into docs/screenshots/.
// Needs the dev server (npm run dev) and Google Chrome. Usage: npm run screenshots
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.NEEDLE_URL ?? 'http://localhost:5173/';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.NEEDLE_CHROME ?? 'chrome' });

async function open(width, height = 1000, scale = 1) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto(BASE);
  await page.waitForSelector('.qrow');
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const shot = (page, name, opts = {}) => page.screenshot({ path: OUT + name, ...opts }).then(() => console.log('screenshots: ' + name));

async function setRun(page, run) {
  await page.$eval(
    '#replay-run',
    (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    run,
  );
  // Let the playhead's slide transition finish.
  await page.waitForTimeout(700);
}

/** Page-coordinate box of the elements matched by each selector, merged. */
async function pageBox(page, selectors, pad = 8) {
  const boxes = await page.evaluate(
    (sels) =>
      sels.flatMap((sel) =>
        Array.from(document.querySelectorAll(sel))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ x: r.left + scrollX, y: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY })),
      ),
    selectors,
  );
  const x = Math.max(0, Math.min(...boxes.map((v) => v.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((v) => v.y)) - pad);
  return { x, y, width: Math.max(...boxes.map((v) => v.r)) + pad - x, height: Math.max(...boxes.map((v) => v.b)) + pad - y };
}

/** Hovers an element and captures it together with its open hover card. */
async function hoverShot(page, selector, name) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await el.hover();
  await page.waitForTimeout(150);
  await el.evaluate((n) => (n.closest('.tw') ?? n).setAttribute('data-shot', ''));
  const clip = await pageBox(page, ['[data-shot]', '[data-shot] > .tt'], 14);
  await page.evaluate(() => document.querySelectorAll('[data-shot]').forEach((n) => n.removeAttribute('data-shot')));
  await shot(page, name, { fullPage: true, clip });
}

let page = await open(1440);
const sw1440 = await page.evaluate(() => document.documentElement.scrollWidth);
console.log(`screenshots: width 1440: page scrollWidth ${sw1440}${sw1440 > 1440 ? ' (horizontal scroll)' : ''}`);
await shot(page, '01-default-run.png', { fullPage: true });

await page.getByRole('button', { name: /^Watch/ }).click();
await page.locator('.qrow').first().click();
await shot(page, '02-watch-event.png', { fullPage: true });

await page.getByRole('button', { name: /^Passed/ }).click();
await page.locator('.qrow').first().click();
await shot(page, '03-passed-event.png', { fullPage: true });

await page.getByRole('button', { name: /^Decide/ }).click();
const runs = Number(await page.$eval('#replay-run', (el) => el.max));
await setRun(page, runs);
await page.waitForTimeout(100);
await shot(page, '04-last-run.png', { fullPage: true });
await page.close();

page = await open(1440, 1000);
await page.getByRole('button', { name: 'Review and approve' }).click();
await page.waitForSelector('[role="dialog"]');
await shot(page, '05-approval-modal.png');
await page.close();

page = await open(1440, 1000, 2);
const w24Run = Number(process.env.NEEDLE_W24_RUN ?? 31);
await setRun(page, w24Run);
await page.waitForTimeout(100);
await shot(page, '06-next-24h.png', { fullPage: true, clip: await pageBox(page, ['section[aria-label="Next 24 h warnings"]']) });
await shot(page, '06b-next-24h-band.png', { fullPage: true, clip: await pageBox(page, ['section[aria-label="Replay timeline"]']) });
await page.close();

page = await open(1440, 1000, 2);
await hoverShot(page, '.kpi >> nth=1', '07-hover-kpi.png');
await hoverShot(page, '.legend .tw >> nth=4', '08-hover-legend.png');
await hoverShot(page, '.ev-btn[aria-pressed="true"]', '09-hover-timeline-bar.png');
await hoverShot(page, '.w24-count >> nth=1', '09b-hover-24h-count.png');
await hoverShot(page, '.badge', '09c-hover-badge.png');
await page.close();

for (const [width, height] of [
  [1024, 900],
  [375, 812],
]) {
  page = await open(width, height);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`screenshots: width ${width}: page scrollWidth ${sw}${sw > width ? ' (horizontal scroll)' : ''}`);
  await shot(page, `10-width-${width}.png`, { fullPage: true });
  await page.close();
}

// QA cases: #8783 approved at run 23 (B1), and #12126 at run 10 (M1).
page = await open(1440, 1000);
await setRun(page, 22);
await page.locator('.ev-btn', { hasText: '#8783' }).click();
await page.getByRole('button', { name: 'Review and approve' }).click();
await page.getByRole('button', { name: 'Approve and queue upload' }).click();
// Let the lapse chip fade so the shot shows the settled run.
await page.waitForTimeout(2800);
await page.mouse.move(5, 5);
await shot(page, '18-approved-8783-run23.png', { fullPage: true });
await setRun(page, 9);
// #12126 sits in whichever queue tab its state puts it in at this run.
for (const tab of ['Decide', 'Watch', 'Passed']) {
  await page.getByRole('button', { name: new RegExp('^' + tab) }).click();
  const row = page.locator('.qrow', { hasText: '#12126' });
  if (await row.count()) {
    await row.first().click();
    break;
  }
}
// Let the lapse chip fade so the shot shows the settled run.
await page.waitForTimeout(2800);
await page.mouse.move(5, 5);
await shot(page, '19-12126-run10.png', { fullPage: true });
await page.close();

// Timeline forecast at Run 16 (Day 6): rings at each open event's closest approach and the dotted line reach Day 7 to 8.
page = await open(1440, 1000, 2);
await setRun(page, 15);
await page.mouse.move(5, 5);
await shot(page, '20-timeline-forecast-run16.png', { fullPage: true, clip: await pageBox(page, ['section[aria-label="Replay timeline"]']) });
// Keyboard focus opens the same card as hover.
await page.locator('.fc-ring-host').first().focus();
await page.waitForTimeout(200);
await shot(page, '20b-timeline-forecast-hover.png', { fullPage: true, clip: await pageBox(page, ['.fc-ring-host:focus', '.fc-ring-host:focus > .tt'], 30) });
await page.close();

// Forecast card: #37 at run 5 (Pc 5.0e-4, 2.91 km, 5d 22h out), a Watch event and a passed event.
page = await open(1440, 1000, 2);
const ws = ['section[aria-label="Workspace"] .ws-head', 'section[aria-label="Forecast at closest approach"]'];
await page.locator('.qrow', { hasText: '#37' }).click();
await page.waitForTimeout(100);
await shot(page, '16-forecast-card-37.png', { fullPage: true, clip: await pageBox(page, ws) });
await page.getByRole('button', { name: /^Watch/ }).click();
await page.locator('.qrow', { hasText: '#7678' }).click();
await page.waitForTimeout(100);
await shot(page, '16b-forecast-card-watch.png', { fullPage: true, clip: await pageBox(page, ws) });
await page.getByRole('button', { name: /^Passed/ }).click();
await page.locator('.qrow').first().click();
await page.waitForTimeout(100);
await shot(page, '16c-forecast-card-passed.png', { fullPage: true, clip: await pageBox(page, ws) });
await page.close();

// Forecast: the robust option panel at the default run, and a 1 to 2 km Watch event 2 to 3 days out.
page = await open(1440, 1000, 2);
await shot(page, '14-options-robust.png', { fullPage: true, clip: await pageBox(page, ['section[aria-label="Workspace"] [role="radiogroup"]', 'section[aria-label="Workspace"] .actions']) });
await page.getByRole('button', { name: /^Watch/ }).click();
await page.locator('.qrow', { hasText: '#' + (process.env.NEEDLE_FORECAST_EVENT ?? '7678') }).click();
await page.waitForTimeout(100);
await shot(page, '13-forecast-watch-event.png', { fullPage: true, clip: await pageBox(page, ['section[aria-label="Workspace"]', 'section[aria-label="Queue"]']) });
await page.locator('.fan-label').hover();
await page.waitForTimeout(150);
await shot(page, '13b-forecast-hover.png', { fullPage: true, clip: await pageBox(page, ['.fan-wrap', '.fan-row', '.fan-label > .tt'], 14) });
await page.close();

// Time-lapse: frames about 0, 200 and 500 ms after a step, then during and after a long slider jump.
// The viewport fits the whole console so each frame is one quick capture.
page = await open(1440, 1760, 1);
await page.waitForTimeout(800);
const t0 = Date.now();
await page.getByRole('button', { name: 'Next screening run' }).click();
for (const ms of [0, 200, 500]) {
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  await shot(page, `15-lapse-step-${ms}ms.png`);
}
await page.waitForTimeout(1500);
await page.mouse.move(5, 5);
const runsMax = Number(await page.$eval('#replay-run', (el) => el.max));
await page.$eval(
  '#replay-run',
  (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  Math.round(runsMax * 0.6),
);
await page.waitForTimeout(250);
await shot(page, '15-lapse-jump-250ms.png');
await page.waitForTimeout(1200);
await shot(page, '15-lapse-jump-settled.png');
await page.close();

// The globe spins and pulses: three frames one second apart, then the reduced-motion view.
page = await open(1440, 1000, 2);
const globe = ['section[aria-label="Orbit context"]'];
await page.locator(globe[0]).scrollIntoViewIfNeeded();
for (const n of [1, 2, 3]) {
  await shot(page, `12-globe-frame-${n}.png`, { fullPage: true, clip: await pageBox(page, globe) });
  await page.waitForTimeout(1000);
}
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForTimeout(200);
await shot(page, '12-globe-reduced-motion.png', { fullPage: true, clip: await pageBox(page, globe) });
await page.close();

// Pc outlook on the Pc chart at Run 5: #6341 (Pc at or above 1e-4), its ceiling card, and a Watch event at the floor.
page = await open(1440, 1000, 2);
const hist = ['figure.ws-cell:has(> .fan-wrap)'];
const pcChart = async () => {
  const b = await pageBox(page, hist);
  return { ...b, height: Math.min(b.height, 260) };
};
await page.mouse.move(5, 5);
await shot(page, '21-pc-forecast-6341.png', { fullPage: true, clip: await pcChart() });
await hoverShot(page, '.pc-ceil-tag', '21b-pc-forecast-ceiling-hover.png');
await page.getByRole('button', { name: /^Watch/ }).click();
await page.locator('.qrow', { hasText: '#7546' }).click();
await page.waitForTimeout(300);
await page.mouse.move(5, 5);
await shot(page, '21c-pc-forecast-floor-7546.png', { fullPage: true, clip: await pcChart() });
await page.close();

page = await open(375, 812, 2);
await shot(page, '11-width-375-top.png');
await page.locator('section[aria-label="Replay timeline"]').scrollIntoViewIfNeeded();
await shot(page, '11-width-375-timeline.png');
await page.close();

await browser.close();
