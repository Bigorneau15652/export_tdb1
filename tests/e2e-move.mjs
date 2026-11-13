// Browser check of dragging a block with the mouse from one page to another. Build first
// (`npm run build`), then: PLAYWRIGHT_PATH=/path/to/playwright node tests/e2e-move.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || `playwright`);
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), `..`, `dist`);
const out = process.env.OUT_DIR || `/tmp`;
const types = { '.html': `text/html`, '.js': `text/javascript`, '.css': `text/css` };
const server = http.createServer((req, res) => {
  const file = path.join(dist, req.url === `/` ? `index.html` : req.url.split(`?`)[0]);
  if (!file.startsWith(dist) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader(`content-type`, types[path.extname(file)] || `application/octet-stream`);
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(8769, resolve));

const failures = [];
const check = (name, ok, detail) => { console.log(`${ok ? `ok  ` : `FAIL`} ${name}${ok ? `` : ` -> ${detail}`}`); if (!ok) failures.push(name); };

const block = (id, text, x, y) => ({ id, type: `text`, x, y, width: 300, height: 80, config: { markdown: text } });
const layout = { format: `grist-dashboard-composer`, version: 1, config: {
  pageFormat: `A4`, pageOrientation: `landscape`,
  pages: [
    { id: `page-1`, blocks: [block(`blk-a`, `Block A`, 60, 60), block(`blk-c`, `Block C`, 60, 300)] },
    { id: `page-2`, blocks: [block(`blk-b`, `Block B`, 60, 60)] },
    { id: `page-3`, blocks: [] }
  ] } };

const browser = await chromium.launch();

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on(`pageerror`, (e) => errors.push(String(e)));
  await page.route(`**/*`, (route) => (route.request().url().startsWith(`http://localhost:8769`) ? route.continue() : route.abort()));
  await page.goto(`http://localhost:8769/index.html`);
  await page.waitForSelector(`.dc-toolbar`);
  await page.getByRole(`button`, { name: `Exporter / Importer` }).click();
  await page.locator(`.dc-io-text`).fill(JSON.stringify(layout));
  await page.getByRole(`button`, { name: `Vérifier l'import` }).click();
  await page.getByRole(`button`, { name: `Remplacer la mise en page actuelle` }).click();
  await page.waitForTimeout(500);
  return { page, errors };
}

const inPage = (page, n) => page.locator(`.dc-page`).nth(n).locator(`.dc-block`).evaluateAll((els) => els.map((el) => el.dataset.blockId));
const rectOf = (page, id) => page.locator(`[data-block-id="${id}"]`).boundingBox();
const pageRect = (page, n) => page.locator(`.dc-page`).nth(n).boundingBox();

// Carries a block with the mouse by its middle, to a point of the screen.
async function carry(page, id, toX, toY, steps = 12) {
  const box = await rectOf(page, id);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps });
  return box;
}
const release = async (page) => { await page.mouse.up(); await page.waitForTimeout(500); };

// ---- Tall window: the three pages are all on the screen.
{
  const { page, errors } = await open({ width: 1300, height: 2800 });
  check(`start: A and C on page 1, B on page 2`, JSON.stringify(await inPage(page, 0)) === `["blk-a","blk-c"]` && JSON.stringify(await inPage(page, 1)) === `["blk-b"]`);

  // 1. A free place of page 2.
  const p2 = await pageRect(page, 1);
  const start = await rectOf(page, `blk-a`);
  await carry(page, `blk-a`, p2.x + 700 + start.width / 2, p2.y + 400 + start.height / 2);
  const during = await rectOf(page, `blk-a`);
  check(`while carried, the block is visible over page 2 (not cut by its page)`, during.y > p2.y && (await page.locator(`[data-block-id="blk-a"]`).isVisible()), JSON.stringify(during));
  await release(page);
  check(`dropped on page 2: A is in page 2, no longer in page 1`, (await inPage(page, 1)).includes(`blk-a`) && !(await inPage(page, 0)).includes(`blk-a`), JSON.stringify([await inPage(page, 0), await inPage(page, 1)]));
  let a = await rectOf(page, `blk-a`);
  check(`A is where it was released`, Math.abs(a.x - (p2.x + 700)) < 12 && Math.abs(a.y - (p2.y + 400)) < 12, JSON.stringify({ a, p2 }));
  check(`A is drawn once`, (await page.locator(`[data-block-id="blk-a"]`).count()) === 1);

  // 2. On top of block B: shifted to a free place, no overlap.
  const b = await rectOf(page, `blk-b`);
  await carry(page, `blk-a`, b.x + b.width / 2 + 20, b.y + b.height / 2 + 10);
  await release(page);
  const a2 = await rectOf(page, `blk-a`);
  const b2 = await rectOf(page, `blk-b`);
  const overlap = !(a2.x + a2.width <= b2.x || b2.x + b2.width <= a2.x || a2.y + a2.height <= b2.y || b2.y + b2.height <= a2.y);
  check(`dropped on block B: A is shifted, no overlap`, !overlap && (await inPage(page, 1)).includes(`blk-a`), JSON.stringify({ a2, b2 }));
  check(`and not far from where it was dropped`, Math.hypot(a2.x - b.x, a2.y - b.y) < 400, JSON.stringify({ a2, b }));

  // 3. Back to page 1, then the block can be carried again.
  const p1 = await pageRect(page, 0);
  await carry(page, `blk-a`, p1.x + 800, p1.y + 500);
  await release(page);
  check(`dragged back up to page 1`, (await inPage(page, 0)).includes(`blk-a`) && (await page.locator(`[data-block-id="blk-a"]`).count()) === 1);
  const p1b = await pageRect(page, 0);
  const before = await rectOf(page, `blk-a`);
  await carry(page, `blk-a`, before.x + before.width / 2 - 100, before.y + before.height / 2 + 50, 6);
  await release(page);
  const after = await rectOf(page, `blk-a`);
  check(`a block that changed page can be moved again`, Math.abs(after.x - (before.x - 100)) < 12 && Math.abs(after.y - (before.y + 50)) < 12, JSON.stringify({ before, after }));

  // 4. In the gap between two pages: the nearest page.
  const gapY = (p1b.y + p1b.height + (await pageRect(page, 1)).y) / 2;
  const mid = await rectOf(page, `blk-a`);
  await carry(page, `blk-a`, p1b.x + 300, gapY);
  await release(page);
  const where = (await inPage(page, 0)).includes(`blk-a`) ? 0 : (await inPage(page, 1)).includes(`blk-a`) ? 1 : -1;
  check(`dropped between two pages: A goes to one of them`, where >= 0, `where=${where}`);

  // 5. Dropped on a block of its own page: shifted.
  const c = await rectOf(page, `blk-c`);
  const own = (await inPage(page, 0)).includes(`blk-a`) ? `blk-a` : `blk-b`;
  await carry(page, own, c.x + c.width / 2, c.y + c.height / 2);
  await release(page);
  const o = await rectOf(page, own);
  const c2 = await rectOf(page, `blk-c`);
  const ov = !(o.x + o.width <= c2.x || c2.x + c2.width <= o.x || o.y + o.height <= c2.y || c2.y + c2.height <= o.y);
  check(`dropped on a block of the same page: shifted, no overlap`, !ov, JSON.stringify({ o, c2 }));
  await page.screenshot({ path: path.join(out, `move-tall.png`), fullPage: true });
  check(`no page error`, errors.length === 0, errors.join(` | `));
  await page.close();
}

// ---- Normal window: the window scrolls by itself when the mouse reaches its bottom edge.
{
  const { page, errors } = await open({ width: 1300, height: 900 });
  const start = await rectOf(page, `blk-a`);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(700, 880, { steps: 10 });
  await page.mouse.move(700, 890, { steps: 4 });
  await page.waitForTimeout(1800);
  const scrolled = await page.evaluate(() => window.scrollY);
  check(`the window scrolls by itself near the bottom edge`, scrolled > 200, String(scrolled));
  const carried = await rectOf(page, `blk-a`);
  check(`the carried block follows the mouse while the window scrolls`, Math.abs(carried.y + carried.height / 2 - 890) < 80, JSON.stringify(carried));
  await page.mouse.up();
  await page.waitForTimeout(500);
  check(`released after the scroll: A is on a lower page`, !(await inPage(page, 0)).includes(`blk-a`), JSON.stringify([await inPage(page, 0), await inPage(page, 1), await inPage(page, 2)]));
  check(`no page error while scrolling`, errors.length === 0, errors.join(` | `));
  await page.close();
}

await browser.close();
server.close();
if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log(`\nall checks passed`);
