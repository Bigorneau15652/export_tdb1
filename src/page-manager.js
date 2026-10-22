import { rectsOverlap, clamp, generateId } from './utils.js';

const PAGE_GAP = 30;
const MIN_BLOCK_SIZE = 60;

class PageManager {
  constructor(store) {
    this.store = store;
  }

  getPageRect(pageIndex) {
    const dims = this.store.getPageDimensions();
    const yOffset = pageIndex * (dims.height + PAGE_GAP);
    return {
      x: 0,
      y: yOffset,
      width: dims.width,
      height: dims.height,
      pageIndex,
    };
  }

  findFreePosition(pageId, width, height, excludeBlockId = null) {
    const page = this.store.config.pages.find(p => p.id === pageId);
    if (!page) return { x: 40, y: 40 };

    const dims = this.store.getPageDimensions();
    const margin = 20;

    const blocks = page.blocks.filter(b => b.id !== excludeBlockId);

    for (let y = margin; y + height <= dims.height - margin; y += 20) {
      for (let x = margin; x + width <= dims.width - margin; x += 20) {
        const candidate = { x, y, width, height };
        const hasCollision = blocks.some(b =>
          rectsOverlap(candidate, { x: b.x, y: b.y, width: b.width, height: b.height })
        );
        if (!hasCollision) return { x, y };
      }
    }

    return { x: margin, y: margin };
  }

  checkCollision(blockId, x, y, width, height) {
    const page = this.store.findBlockPage(blockId);
    if (!page) return null;

    const candidate = { x, y, width, height };
    const other = page.blocks.find(b => b.id !== blockId);

    for (const b of page.blocks) {
      if (b.id === blockId) continue;
      if (rectsOverlap(candidate, { x: b.x, y: b.y, width: b.width, height: b.height })) {
        return b;
      }
    }
    return null;
  }

  constrainToPage(blockId, x, y, width, height) {
    const dims = this.store.getPageDimensions();
    const clampedX = clamp(x, 0, Math.max(0, dims.width - width));
    const clampedY = clamp(y, 0, Math.max(0, dims.height - height));
    const clampedW = clamp(width, MIN_BLOCK_SIZE, dims.width);
    const clampedH = clamp(height, MIN_BLOCK_SIZE, dims.height);
    return { x: clampedX, y: clampedY, width: clampedW, height: clampedH };
  }

  getPageForY(absoluteY) {
    const dims = this.store.getPageDimensions();
    const pageHeight = dims.height + PAGE_GAP;
    const pageIndex = Math.floor(absoluteY / pageHeight);
    return Math.min(pageIndex, this.store.config.pages.length - 1);
  }

  getAbsoluteY(pageIndex, localY) {
    return pageIndex * (this.store.getPageDimensions().height + PAGE_GAP) + localY;
  }

  getLocalY(pageIndex, absoluteY) {
    return absoluteY - pageIndex * (this.store.getPageDimensions().height + PAGE_GAP);
  }

  shouldCreateNewPage(pageId, blockBottom) {
    const dims = this.store.getPageDimensions();
    return blockBottom > dims.height - 20;
  }
}

export { PageManager, PAGE_GAP, MIN_BLOCK_SIZE };
