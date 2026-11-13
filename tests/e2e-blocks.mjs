// Browser check of the blocks that follow the active row, group rows and show an image with its
// caption, with a mocked Grist and neutral sample tables. Build first (`npm run build`), then:
//   PLAYWRIGHT_PATH=/path/to/playwright node tests/e2e-blocks.mjs
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
await new Promise((resolve) => server.listen(8767, resolve));

const failures = [];
const check = (name, ok, detail) => { console.log(`${ok ? `ok  ` : `FAIL`} ${name}${ok ? `` : ` -> ${detail}`}`); if (!ok) failures.push(name); };

// Sample tables (columnar, as Grist returns them): two buildings, their floors and rooms.
const TABLES = {
  Buildings: {
    id: [1, 2], Name: [`Building A`, `Building B`], Day: [1736294400, 1740000000], Year: [1965, 1990],
    Photo: [`https://img.test/a1.png\nhttps://img.test/a2.png`, `https://img.test/b1.png`],
    PhotoText: [`Front view\nBack view`, `Main entrance`]
  },
  Floors: {
    id: [1, 2, 3, 4], Building: [1, 1, 2, 1], Level: [`1`, `2`, `1`, `3`], Area: [100, 200, 50, 300]
  },
  Rooms: {
    id: [1, 2, 3, 4, 5, 6], Building: [1, 1, 1, 2, 1, 2], Kind: [`Office`, `Class`, `Office`, `Office`, `Class`, `Class`],
    Area: [10, 20, 5.5, 99, 30, 77]
  }
};

const layout = {
  pageFormat: `A4`, pageOrientation: `landscape`,
  pages: [{ id: `page-1`, blocks: [
    { id: `b-info`, type: `table`, x: 20, y: 20, width: 500, height: 80, config: {
      sourceTable: `Buildings`, columns: [{ id: `Name`, label: `Name` }, { id: `Day`, label: `Day`, format: `date` }, { id: `Year`, label: `Year`, format: `plain` }],
      dynamicFilter: true, dynamicFilterColumn: `id`, dynamicSourceColumn: `id`, footerFunc: null } },
    { id: `b-floors`, type: `table`, x: 20, y: 120, width: 400, height: 150, config: {
      sourceTable: `Floors`, columns: [{ id: `Level`, label: `Level` }, { id: `Area`, label: `Area` }],
      dynamicFilter: true, dynamicFilterColumn: `Building`, dynamicSourceColumn: `id`, footerFunc: `sum`, footerLabel: `Total` } },
    { id: `b-kinds`, type: `table`, x: 450, y: 120, width: 400, height: 150, config: {
      sourceTable: `Rooms`, columns: [{ id: `Kind`, label: `Kind` }, { id: `Area`, label: `Area` }, { id: `id`, label: `Count`, func: `count` }],
      dynamicFilter: true, dynamicFilterColumn: `Building`, dynamicSourceColumn: `id`, groupBy: `Kind`, groupFunc: `sum`, footerFunc: `sum`, footerLabel: `Total` } },
    { id: `b-chart`, type: `chart`, x: 20, y: 300, width: 400, height: 250, config: {
      sourceTable: `Rooms`, chartType: `doughnut`, xColumn: `Kind`, yColumns: [`Area`], groupFunc: `sum`,
      dynamicFilter: true, dynamicFilterColumn: `Building`, dynamicSourceColumn: `id` } },
    { id: `b-photo`, type: `image`, x: 450, y: 300, width: 300, height: 250, config: {
      sourceTable: `Buildings`, imageColumn: `Photo`, captionColumn: `PhotoText` } }
  ] }]
};

const MOCK = `
(() => {
  const handlers = {};
  const tables = ${JSON.stringify(TABLES)};
  window.grist = {
    ready() { return Promise.resolve(); },
    onRecord(fn) { handlers.record = fn; },
    onOptions(fn) { handlers.options = fn; },
    getOptions() { return Promise.resolve({ dashboardConfig: ${JSON.stringify(JSON.stringify(layout))} }); },
    setOption() { return Promise.resolve(); },
    selectedTable: { getTableId: () => Promise.resolve('Buildings') },
    docApi: {
      listTables: () => Promise.resolve(Object.keys(tables)),
      fetchTable: (id) => Promise.resolve(JSON.parse(JSON.stringify(tables[id])))
    }
  };
  window.__select = (id) => {
    const i = tables.Buildings.id.indexOf(id);
    const record = { id };
    for (const key of Object.keys(tables.Buildings)) record[key] = tables.Buildings[key][i];
    return handlers.record && handlers.record(record, {});
  };
})();`;

const PNG = Buffer.from(`iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`, `base64`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const errors = [];
page.on(`pageerror`, (e) => errors.push(String(e)));
await page.route(`**/*`, (route) => {
  const url = route.request().url();
  if (url.startsWith(`http://localhost:8767`)) return route.continue();
  if (url.endsWith(`grist-plugin-api.js`)) return route.fulfill({ contentType: `text/javascript`, body: MOCK });
  if (url.startsWith(`https://img.test/`)) return route.fulfill({ contentType: `image/png`, body: PNG });
  return route.abort();
});
await page.goto(`http://localhost:8767/index.html`);
await page.waitForSelector(`.dc-page`);
await page.evaluate(() => window.__select(1));
await page.waitForTimeout(1200);

const textOf = (id) => page.locator(`[data-block-id="${id}"]`).innerText();
let info = await textOf(`b-info`);
check(`building A: only its row, the date is a date, the year has no separator`, /Building A/.test(info) && !/Building B/.test(info) && /08\/01\/2025/.test(info) && /1965/.test(info), info);
let floors = await textOf(`b-floors`);
check(`building A: its 3 floors and their total`, /100/.test(floors) && /200/.test(floors) && /300/.test(floors) && !/\b50\b/.test(floors) && /600/.test(floors), floors);
let kinds = await textOf(`b-kinds`);
check(`building A: rooms grouped by kind with sums and counts`, /Office\s+15,5\s+2/.test(kinds.replace(/\n/g, ` `)) && /Class\s+50\s+2/.test(kinds.replace(/\n/g, ` `)), kinds);
check(`building A: the total of the groups`, /Total\s+65,5/.test(kinds.replace(/\n/g, ` `)), kinds);
check(`the chart is drawn`, await page.locator(`[data-block-id="b-chart"] canvas`).count() > 0);
check(`the image is the first of the cell`, (await page.locator(`[data-block-id="b-photo"] img`).getAttribute(`src`)) === `https://img.test/a1.png`);
check(`the caption is the first line`, (await textOf(`b-photo`)).includes(`Front view`) && !(await textOf(`b-photo`)).includes(`Back view`), await textOf(`b-photo`));
await page.screenshot({ path: path.join(out, `blocks-building-a.png`) });

await page.evaluate(() => window.__select(2));
await page.waitForTimeout(1200);
info = await textOf(`b-info`);
check(`building B: the blocks follow the active row`, /Building B/.test(info) && !/Building A/.test(info), info);
floors = await textOf(`b-floors`);
check(`building B: its single floor`, /\b50\b/.test(floors) && !/\b300\b/.test(floors), floors);
kinds = await textOf(`b-kinds`);
check(`building B: its groups`, /Office\s+99\s+1/.test(kinds.replace(/\n/g, ` `)) && /Class\s+77\s+1/.test(kinds.replace(/\n/g, ` `)), kinds);
check(`building B: its image and caption`, (await page.locator(`[data-block-id="b-photo"] img`).getAttribute(`src`)) === `https://img.test/b1.png` && (await textOf(`b-photo`)).includes(`Main entrance`));

check(`no page error`, errors.length === 0, errors.join(` | `));
await browser.close();
server.close();
if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log(`\nall checks passed`);
