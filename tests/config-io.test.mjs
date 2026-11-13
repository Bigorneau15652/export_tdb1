// Checks of the export / import code: run with `npm test` (Node 22 or later).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, parseImport, sanitizeConfig, FORMAT_ID } from '../src/config-io.js';

const sample = {
  pageFormat: `A4`,
  pageOrientation: `landscape`,
  pages: [{
    id: `page-1`,
    blocks: [
      { id: `b1`, type: `text`, x: 10, y: 20, width: 300, height: 80, config: { markdown: `# Titre` } },
      {
        id: `b2`, type: `table`, x: 10, y: 120, width: 500, height: 200,
        config: {
          sourceTable: `Table1`, columns: [`A`, { id: `B`, label: `Colonne B` }],
          filters: [{ column: `A`, op: `eq`, value: 5 }], dynamicFilter: true, dynamicFilterColumn: `id`, footerFunc: `sum`
        }
      }
    ]
  }]
};

test(`export then import gives the same layout`, () => {
  const first = parseImport(buildExport(sample));
  assert.equal(first.error, undefined);
  const second = parseImport(buildExport(first.config));
  assert.deepEqual(second.config, first.config);
  assert.equal(JSON.parse(buildExport(sample)).format, FORMAT_ID);
});

test(`a text column list accepts plain names and keeps labels`, () => {
  const { config } = parseImport(JSON.stringify(sample));
  const table = config.pages[0].blocks[1].config;
  assert.deepEqual(table.columns, [{ id: `A`, label: `A` }, { id: `B`, label: `Colonne B` }]);
  assert.deepEqual(table.filters, [{ column: `A`, op: `eq`, value: `5` }]);
});

test(`unknown block types and unknown fields are dropped and reported`, () => {
  const bad = { pages: [{ id: `p`, blocks: [{ type: `script`, config: {} }, { type: `text`, config: { markdown: `x`, onclick: `alert(1)` } }] }] };
  const result = parseImport(JSON.stringify(bad));
  assert.equal(result.config.pages[0].blocks.length, 1);
  assert.equal(result.notes.length, 1);
  assert.equal(`onclick` in result.config.pages[0].blocks[0].config, false);
});

test(`identifiers that are not plain are replaced, repeated ones too`, () => {
  const bad = { pages: [{ id: `<img onerror=1>`, blocks: [{ id: `a`, type: `text` }, { id: `a`, type: `text` }] }] };
  const { config } = parseImport(JSON.stringify(bad));
  assert.match(config.pages[0].id, /^page-/);
  const ids = config.pages[0].blocks.map((b) => b.id);
  assert.notEqual(ids[0], ids[1]);
});

test(`sizes and positions are kept in range`, () => {
  const bad = { pages: [{ id: `p`, blocks: [{ type: `text`, x: -50, y: 1e9, width: 0, height: `abc` }] }] };
  const block = parseImport(JSON.stringify(bad)).config.pages[0].blocks[0];
  assert.equal(block.x, 0);
  assert.equal(block.y, 10000);
  assert.equal(block.width, 20);
  assert.equal(block.height, 200);
});

test(`wrong input gives an error, not an exception`, () => {
  for (const input of [``, `not json`, `[]`, `{}`, `{"format":"other","config":{}}`, `{"format":"${FORMAT_ID}","version":99,"config":{"pages":[]}}`]) {
    assert.ok(parseImport(input).error, input);
  }
  assert.ok(parseImport(null).error);
});

test(`an empty page list still gives one page`, () => {
  assert.equal(sanitizeConfig({ pages: [] }).config.pages.length, 1);
});

test(`a layout without header (the saved setting) is accepted`, () => {
  assert.equal(parseImport(JSON.stringify(sample)).error, undefined);
});
