// Checks of the helpers that follow the active row, group rows and read multi-line cells.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeValue, filterByActive, groupRecords, cellLines, formatGristDate } from '../src/grouping.js';
import { parseImport } from '../src/config-io.js';

const rec = (id, fields) => ({ id, fields: { id, ...fields } });

test(`the active row gives its id or a column, flat or in fields`, () => {
  assert.equal(activeValue({ id: 7, Name: `A` }, `id`), 7);
  assert.equal(activeValue({ id: 7, Name: `A` }, `Name`), `A`);
  assert.equal(activeValue({ id: 7, fields: { Name: `B` } }, `Name`), `B`);
  assert.equal(activeValue(null, `id`), undefined);
  assert.equal(activeValue({ id: 0 }, `id`), 0);
});

test(`following the active row keeps the rows that point to it`, () => {
  const rows = [rec(1, { Parent: 7 }), rec(2, { Parent: 8 }), rec(3, { Parent: [`L`, 7, 9] }), rec(4, { Parent: `7` })];
  assert.deepEqual(filterByActive(rows, `Parent`, 7).map((r) => r.id), [1, 3, 4]);
});

test(`without an active row nothing is shown`, () => {
  const rows = [rec(1, { Parent: 7 })];
  assert.deepEqual(filterByActive(rows, `Parent`, null), []);
  assert.deepEqual(filterByActive(rows, `Parent`, undefined), []);
});

test(`grouping sums, counts and keeps the order of first appearance`, () => {
  const rows = [
    rec(1, { Kind: `B`, Area: 10 }), rec(2, { Kind: `A`, Area: 5 }),
    rec(3, { Kind: `B`, Area: 2.5 }), rec(4, { Kind: `A`, Area: null })
  ];
  const grouped = groupRecords(rows, `Kind`, [{ id: `Kind` }, { id: `Area` }, { id: `id`, func: `count` }]);
  assert.deepEqual(grouped.map((r) => r.fields), [
    { Kind: `B`, Area: 12.5, id: 2 },
    { Kind: `A`, Area: 5, id: 2 }
  ]);
  const averaged = groupRecords(rows, `Kind`, [{ id: `Kind` }, { id: `Area` }], `avg`);
  assert.equal(averaged[0].fields.Area, 6.25);
});

test(`grouping an empty list gives an empty list`, () => {
  assert.deepEqual(groupRecords([], `Kind`, [{ id: `Kind` }]), []);
});

test(`a cell with several lines gives its lines, the first one first`, () => {
  assert.deepEqual(cellLines(`https://a/1.jpg\r\nhttps://a/2.jpg\n\n  `), [`https://a/1.jpg`, `https://a/2.jpg`]);
  assert.deepEqual(cellLines(null), []);
  assert.deepEqual(cellLines(42), []);
});

test(`a Grist date is shown as DD/MM/YYYY whatever the time zone`, () => {
  assert.equal(formatGristDate(1736294400), `08/01/2025`);
  assert.equal(formatGristDate([`d`, 1736294400]), `08/01/2025`);
  assert.equal(formatGristDate(`text`), null);
  assert.equal(formatGristDate(null), null);
});

test(`the new settings are kept by an import, and bad ones are dropped`, () => {
  const layout = { pages: [{ id: `p`, blocks: [
    { id: `t`, type: `table`, config: {
      sourceTable: `Floors`, columns: [{ id: `Name` }, { id: `Day`, format: `date` }, { id: `n`, func: `count` }, { id: `x`, format: `evil`, func: `evil` }],
      dynamicFilter: true, dynamicFilterColumn: `Parent`, dynamicSourceColumn: `id`, groupBy: `Name`, groupFunc: `avg`
    } },
    { id: `c`, type: `chart`, config: { sourceTable: `Rooms`, xColumn: `Kind`, yColumns: [`Area`], dynamicFilter: true, dynamicFilterColumn: `Parent`, dynamicSourceColumn: `id`, groupFunc: `sum` } },
    { id: `i`, type: `image`, config: { sourceTable: `Buildings`, imageColumn: `Photo`, captionColumn: `Photo_text` } }
  ] }] };
  const [table, chart, image] = parseImport(JSON.stringify(layout)).config.pages[0].blocks;
  assert.deepEqual(table.config.columns, [
    { id: `Name`, label: `Name` }, { id: `Day`, label: `Day`, format: `date` },
    { id: `n`, label: `n`, func: `count` }, { id: `x`, label: `x` }
  ]);
  const plain = parseImport(JSON.stringify({ pages: [{ blocks: [{ type: `table`, config: { columns: [{ id: `Year`, format: `plain` }] } }] }] }));
  assert.equal(plain.config.pages[0].blocks[0].config.columns[0].format, `plain`);
  assert.equal(table.config.dynamicSourceColumn, `id`);
  assert.equal(table.config.groupBy, `Name`);
  assert.equal(table.config.groupFunc, `avg`);
  assert.equal(chart.config.groupFunc, `sum`);
  assert.equal(chart.config.dynamicSourceColumn, `id`);
  assert.equal(image.config.captionColumn, `Photo_text`);
});
