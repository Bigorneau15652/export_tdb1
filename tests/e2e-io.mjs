// Browser check of the export / import window. Build first (`npm run build`), then run:
//   PLAYWRIGHT_PATH=/path/to/playwright node tests/e2e-io.mjs
// It serves dist/ itself and runs the widget outside Grist (no network needed).
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
await new Promise((resolve) => server.listen(8766, resolve));

const failures = [];
const check = (name, ok, detail) => { console.log(`${ok ? `ok  ` : `FAIL`} ${name}${ok ? `` : ` -> ${detail}`}`); if (!ok) failures.push(name); };

const layout = {
  format: `grist-dashboard-composer`, version: 1,
  config: {
    pageFormat: `A4`, pageOrientation: `landscape`,
    pages: [
      { id: `page-1`, blocks: [{ id: `titre`, type: `text`, x: 40, y: 40, width: 600, height: 60, config: { markdown: `# Tableau de bord importe` } }] },
      { id: `page-2`, blocks: [{ id: `note`, type: `text`, x: 40, y: 40, width: 600, height: 60, config: { markdown: `Deuxieme page` } }, { type: `inconnu` }] }
    ]
  }
};

const browser = await chromium.launch();
for (const [label, options] of [[`desktop`, {}], [`narrow dark`, { viewport: { width: 340, height: 700 }, colorScheme: `dark` }]]) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on(`pageerror`, (e) => errors.push(String(e)));
  await page.route(`**/*`, (route) => (route.request().url().startsWith(`http://localhost:8766`) ? route.continue() : route.abort()));
  await page.goto(`http://localhost:8766/index.html`);
  await page.waitForSelector(`.dc-toolbar`);
  await page.getByRole(`button`, { name: `Exporter / Importer` }).click();
  check(`${label}: the window opens`, await page.locator(`.dc-io-panel`).isVisible());

  await page.getByRole(`button`, { name: `Exporter`, exact: true }).click();
  const exported = JSON.parse(await page.locator(`.dc-io-text`).inputValue());
  check(`${label}: export has the header and one page`, exported.format === `grist-dashboard-composer` && exported.config.pages.length === 1);

  await page.locator(`.dc-io-text`).fill(`{ pas du json`);
  await page.getByRole(`button`, { name: `Vérifier l'import` }).click();
  check(`${label}: invalid text gives a readable error`, /Import impossible/.test(await page.locator(`.dc-io-message`).textContent()));
  check(`${label}: nothing can be applied after an error`, await page.getByRole(`button`, { name: `Remplacer la mise en page actuelle` }).isHidden());

  await page.locator(`.dc-io-text`).fill(JSON.stringify(layout));
  await page.getByRole(`button`, { name: `Vérifier l'import` }).click();
  const report = await page.locator(`.dc-io-message`).textContent();
  check(`${label}: the check reports the dropped block`, /2 pages, 2 blocs/.test(report) && /type de bloc inconnu/.test(report), report);
  const box = await page.locator(`.dc-io-message`).boundingBox();
  check(`${label}: the message is fully visible`, box && box.height > 20 && box.x >= 0 && box.x + box.width <= (options.viewport ? options.viewport.width : 1280) + 1, JSON.stringify(box));
  await page.screenshot({ path: path.join(out, `io-${label.replace(` `, `-`)}.png`) });

  await page.getByRole(`button`, { name: `Remplacer la mise en page actuelle` }).click();
  await page.waitForTimeout(400);
  check(`${label}: the window closes after the import`, await page.locator(`.dc-io-panel`).count() === 0);
  check(`${label}: two pages are drawn`, await page.locator(`.dc-page`).count() === 2);
  check(`${label}: the imported text block is shown`, /Tableau de bord importe/.test(await page.locator(`.dc-page`).first().textContent()));
  const landscape = await page.locator(`.dc-page`).first().evaluate((el) => el.offsetWidth > el.offsetHeight);
  check(`${label}: the landscape format is applied`, landscape);
  check(`${label}: the toolbar follows the layout`, (await page.locator(`.dc-toolbar select`).first().inputValue()) === `A4`);
  check(`${label}: no page error`, errors.length === 0, errors.join(` | `));
  await page.close();
}
await browser.close();
server.close();
if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log(`\nall checks passed`);
