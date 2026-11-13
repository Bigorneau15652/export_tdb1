// Browser check of the move of a block to another page. Build first (`npm run build`), then:
//   PLAYWRIGHT_PATH=/path/to/playwright node tests/e2e-move.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || `playwright`);
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), `..`, `dist`);
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
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const errors = [];
page.on(`pageerror`, (e) => errors.push(String(e)));
await page.route(`**/*`, (route) => (route.request().url().startsWith(`http://localhost:8769`) ? route.continue() : route.abort()));
await page.goto(`http://localhost:8769/index.html`);
await page.waitForSelector(`.dc-toolbar`);

// Load the sample layout through the import window.
await page.getByRole(`button`, { name: `Exporter / Importer` }).click();
await page.locator(`.dc-io-text`).fill(JSON.stringify(layout));
await page.getByRole(`button`, { name: `Vérifier l'import` }).click();
await page.getByRole(`button`, { name: `Remplacer la mise en page actuelle` }).click();
await page.getByRole(`button`, { name: /Éditer/ }).click();
await page.waitForTimeout(500);

const inPage = (n) => page.locator(`.dc-page`).nth(n).locator(`.dc-block`).evaluateAll((els) => els.map((el) => el.dataset.blockId));
check(`start: A and C on page 1, B on page 2`, JSON.stringify(await inPage(0)) === `["blk-a","blk-c"]` && JSON.stringify(await inPage(1)) === `["blk-b"]`);

const blockEl = (id) => page.locator(`[data-block-id="${id}"]`);
const clickToolbar = async (id, cls) => {
  await blockEl(id).hover();
  await blockEl(id).locator(`.${cls}`).click();
  await page.waitForTimeout(400);
};

await clickToolbar(`blk-a`, `dc-block-down-btn`);
check(`the down button moves A to page 2`, JSON.stringify(await inPage(0)) === `["blk-c"]` && (await inPage(1)).includes(`blk-a`), JSON.stringify([await inPage(0), await inPage(1)]));
check(`the moved block is drawn once, with its text`, (await page.locator(`[data-block-id="blk-a"]`).count()) === 1 && /Block A/.test(await blockEl(`blk-a`).innerText()));

await clickToolbar(`blk-a`, `dc-block-up-btn`);
check(`the up button brings A back to page 1`, (await inPage(0)).includes(`blk-a`) && !(await inPage(1)).includes(`blk-a`));
check(`still drawn once after going up`, (await page.locator(`[data-block-id="blk-a"]`).count()) === 1);

// The moved block can still be dragged.
await blockEl(`blk-a`).scrollIntoViewIfNeeded();
const before = await blockEl(`blk-a`).boundingBox();
await page.mouse.move(before.x + 40, before.y + 40);
await page.mouse.down();
await page.mouse.move(before.x + 140, before.y + 90, { steps: 6 });
await page.mouse.up();
const after = await blockEl(`blk-a`).boundingBox();
check(`the block moved back to page 1 can still be dragged`, Math.abs(after.x - before.x - 100) < 6 && Math.abs(after.y - before.y - 50) < 6, JSON.stringify([before, after]));

// The editor window moves a block to any page.
await blockEl(`blk-b`).dblclick();
await page.locator(`.dc-editor-panel select`).nth(1).selectOption(`page-3`);
await page.waitForTimeout(500);
check(`the page choice of the editor moves B to page 3`, (await inPage(2)).includes(`blk-b`) && !(await inPage(1)).includes(`blk-b`), JSON.stringify([await inPage(1), await inPage(2)]));
await page.locator(`.dc-editor-panel select`).nth(1).selectOption(`page-1`);
await page.waitForTimeout(500);
check(`and back to page 1`, (await inPage(0)).includes(`blk-b`) && (await page.locator(`[data-block-id="blk-b"]`).count()) === 1);
await page.getByRole(`button`, { name: /Terminé/ }).click();

// No block lies on another one after the moves.
const boxes = await page.locator(`.dc-page`).first().locator(`.dc-block`).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
let overlap = false;
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const a = boxes[i]; const b = boxes[j];
  if (!(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)) overlap = true;
}
check(`no block overlaps another on page 1`, !overlap, JSON.stringify(boxes));
check(`no page error`, errors.length === 0, errors.join(` | `));
await browser.close();
server.close();
if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log(`\nall checks passed`);
