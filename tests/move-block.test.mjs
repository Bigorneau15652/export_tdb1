// Checks of the move of a block to another page (the logic of the store, without a page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/store.js';

function setup() {
  store.config = {
    pageFormat: `A4`, pageOrientation: `landscape`,
    pages: [
      { id: `p1`, blocks: [
        { id: `a`, type: `text`, x: 100, y: 100, width: 200, height: 100, config: {} },
        { id: `b`, type: `text`, x: 400, y: 100, width: 200, height: 100, config: {} }
      ] },
      { id: `p2`, blocks: [{ id: `c`, type: `text`, x: 100, y: 100, width: 300, height: 150, config: {} }] }
    ]
  };
  store.saveDebounced = () => {};
}

test(`a block moves to the other page and keeps its place when it is free`, () => {
  setup();
  assert.equal(store.moveBlockToPage(`b`, `p2`), true);
  assert.deepEqual(store.config.pages[0].blocks.map((b) => b.id), [`a`]);
  const moved = store.config.pages[1].blocks.find((b) => b.id === `b`);
  assert.deepEqual([moved.x, moved.y], [400, 100]);
  assert.equal(store.findBlockPage(`b`).id, `p2`);
});

test(`a block that would overlap another takes a free place`, () => {
  setup();
  store.moveBlockToPage(`a`, `p2`);
  const moved = store.config.pages[1].blocks.find((b) => b.id === `a`);
  const other = store.config.pages[1].blocks.find((b) => b.id === `c`);
  const overlap = !(moved.x + moved.width <= other.x || other.x + other.width <= moved.x || moved.y + moved.height <= other.y || other.y + other.height <= moved.y);
  assert.equal(overlap, false);
});

test(`moving to the same page, to an unknown page or an unknown block changes nothing`, () => {
  setup();
  assert.equal(store.moveBlockToPage(`a`, `p1`), false);
  assert.equal(store.moveBlockToPage(`a`, `nope`), false);
  assert.equal(store.moveBlockToPage(`nope`, `p2`), false);
  assert.equal(store.config.pages[0].blocks.length, 2);
  assert.equal(store.config.pages[1].blocks.length, 1);
});

test(`a block can go back to the first page`, () => {
  setup();
  store.moveBlockToPage(`c`, `p1`);
  assert.deepEqual(store.config.pages[1].blocks, []);
  assert.equal(store.config.pages[0].blocks.length, 3);
});
