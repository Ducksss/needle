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
await shot(page, '06-next-24h.png', { fullPage: true, clip: await pageBox(page, ['section[aria-label="Next 24 h warnings"]', 'section[aria-label="Replay timeline"]']) });
await page.close();

page = await open(1440, 1000, 2);
await hoverShot(page, '.kpi >> nth=1', '07-hover-kpi.png');
await hoverShot(page, '.legend .tw >> nth=4', '08-hover-legend.png');
await hoverShot(page, '.ev-btn[aria-pressed="true"]', '09-hover-timeline-bar.png');
await hoverShot(page, '.w24-count >> nth=1', '09b-hover-24h-count.png');
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

page = await open(375, 812, 2);
await shot(page, '11-width-375-top.png');
await page.locator('section[aria-label="Replay timeline"]').scrollIntoViewIfNeeded();
await shot(page, '11-width-375-timeline.png');
await page.close();

await browser.close();
