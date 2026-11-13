// Checks of the drop of a block on a page, the same one or another: its place is kept when it is
// free, otherwise the nearest free place is taken (the logic of the store, without a page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/store.js';
import { rectsOverlap } from '../src/utils.js';

const block = (id, x, y, width = 200, height = 100) => ({ id, type: `text`, x, y, width, height, config: {} });

function setup() {
  store.config = {
    pageFormat: `A4`, pageOrientation: `landscape`,
    pages: [
      { id: `p1`, blocks: [block(`a`, 100, 100), block(`b`, 400, 100)] },
      { id: `p2`, blocks: [block(`c`, 100, 100, 300, 150)] }
    ]
  };
  store.saveDebounced = () => {};
}

const find = (id) => store.config.pages.flatMap((p) => p.blocks).find((b) => b.id === id);
const overlapsAny = (page) => page.blocks.some((x, i) => page.blocks.some((y, j) => i < j && rectsOverlap(x, y)));

test(`a block dropped on a free place of another page goes there, at that place`, () => {
  setup();
  assert.equal(store.dropBlock(`b`, `p2`, { x: 600, y: 300 }), true);
  assert.deepEqual(store.config.pages[0].blocks.map((b) => b.id), [`a`]);
  assert.deepEqual([find(`b`).x, find(`b`).y], [600, 300]);
  assert.equal(store.findBlockPage(`b`).id, `p2`);
});

test(`a block dropped on another block takes the nearest free place`, () => {
  setup();
  store.dropBlock(`a`, `p2`, { x: 150, y: 120 });
  assert.equal(store.findBlockPage(`a`).id, `p2`);
  assert.equal(overlapsAny(store.config.pages[1]), false);
  const moved = find(`a`);
  assert.ok(Math.hypot(moved.x - 150, moved.y - 120) < 300, `the shift stays small: ${moved.x}, ${moved.y}`);
});

test(`a block dropped on another block of its own page is shifted too`, () => {
  setup();
  store.dropBlock(`a`, `p1`, { x: 390, y: 110 });
  assert.equal(store.findBlockPage(`a`).id, `p1`);
  assert.equal(overlapsAny(store.config.pages[0]), false);
});

test(`a block dropped partly outside the page is brought back inside`, () => {
  setup();
  store.dropBlock(`a`, `p2`, { x: -50, y: 5000 });
  const moved = find(`a`);
  assert.ok(moved.x >= 0 && moved.y >= 0 && moved.y + moved.height <= 794);
});

test(`a drop that changes nothing, on an unknown page or for an unknown block, is refused`, () => {
  setup();
  assert.equal(store.dropBlock(`a`, `p1`, { x: 100, y: 100 }), false);
  assert.equal(store.dropBlock(`a`, `nope`, { x: 0, y: 0 }), false);
  assert.equal(store.dropBlock(`nope`, `p1`, { x: 0, y: 0 }), false);
});

test(`when the page has no room the block stays where it was dropped`, () => {
  setup();
  store.config.pages[1].blocks = [block(`wall`, 0, 0, 1123, 794)];
  assert.equal(store.dropBlock(`a`, `p2`, { x: 300, y: 300 }), true);
  assert.equal(store.findBlockPage(`a`).id, `p2`);
});
