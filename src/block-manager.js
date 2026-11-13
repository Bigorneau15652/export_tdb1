import interact from 'interactjs';
import { PageManager, MIN_BLOCK_SIZE } from './page-manager.js';

class BlockManager {
  constructor(store, containerEl) {
    this.store = store;
    this.container = containerEl;
    this.pageManager = new PageManager(store);
    this.blockElements = new Map();
    this.interactables = new Map();
    this.onBlockChange = null;
  }

  setOnBlockChange(callback) {
    this.onBlockChange = callback;
  }

  registerBlock(blockId, el) {
    this.blockElements.set(blockId, el);
    this.setupInteract(blockId, el);
  }

  unregisterBlock(blockId) {
    const interactable = this.interactables.get(blockId);
    if (interactable) {
      interactable.unset();
      this.interactables.delete(blockId);
    }
    this.blockElements.delete(blockId);
  }

  setupInteract(blockId, el) {
    const self = this;
    const dims = this.store.getPageDimensions();

    const interactable = interact(el)
      .draggable({
        // The block is carried by the mouse over the whole list of pages (it is not held inside
        // its own page), and the window scrolls when the mouse reaches its top or bottom edge.
        autoScroll: { margin: 60, speed: 600 },
        listeners: {
          start(event) {
            el.classList.add('dragging');
            self.container.classList.add('dc-is-dragging');
            const rect = el.getBoundingClientRect();
            self.drag = {
              blockId,
              grabX: event.clientX - rect.left,
              grabY: event.clientY - rect.top,
              pointerX: event.clientX,
              pointerY: event.clientY,
            };
            // The page scrolls while the mouse stays still: the block must follow the mouse.
            self.onScroll = () => self.placeDraggedBlock(el);
            window.addEventListener('scroll', self.onScroll, true);
          },
          move(event) {
            if (!self.drag) return;
            self.drag.pointerX = event.clientX;
            self.drag.pointerY = event.clientY;
            self.placeDraggedBlock(el);
          },
          end(event) {
            window.removeEventListener('scroll', self.onScroll, true);
            self.onScroll = null;
            el.classList.remove('dragging');
            self.container.classList.remove('dc-is-dragging');
            self.dropDraggedBlock(blockId, el);
            self.drag = null;
          },
        },
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: MIN_BLOCK_SIZE, height: MIN_BLOCK_SIZE },
            max: { width: dims.width, height: dims.height },
          }),
        ],
        listeners: {
          start(event) {
            el.classList.add('resizing');
            event.target.dataset.originalRatio = String(
              self.store.findBlock(blockId)?.width / self.store.findBlock(blockId)?.height || 1
            );
          },
          move(event) {
            const block = self.store.findBlock(blockId);
            if (!block) return;

            let newWidth = event.rect.width;
            let newHeight = event.rect.height;
            let newX = block.x + (event.deltaRect.left || 0);
            let newY = block.y + (event.deltaRect.top || 0);

            if (event.shiftKey) {
              const ratio = parseFloat(event.target.dataset.originalRatio) || (block.width / block.height);
              const deltaW = Math.abs(event.deltaRect.right || 0) + Math.abs(event.deltaRect.left || 0);
              const deltaH = Math.abs(event.deltaRect.bottom || 0) + Math.abs(event.deltaRect.top || 0);
              if (deltaW >= deltaH) {
                newHeight = newWidth / ratio;
              } else {
                newWidth = newHeight * ratio;
              }
            }

            newWidth = Math.max(MIN_BLOCK_SIZE, Math.min(newWidth, dims.width));
            newHeight = Math.max(MIN_BLOCK_SIZE, Math.min(newHeight, dims.height));

            const constrained = self.pageManager.constrainToPage(
              blockId, newX, newY, newWidth, newHeight
            );

            el.style.width = `${constrained.width}px`;
            el.style.height = `${constrained.height}px`;
            el.style.left = `${constrained.x}px`;
            el.style.top = `${constrained.y}px`;

            block.x = constrained.x;
            block.y = constrained.y;
            block.width = constrained.width;
            block.height = constrained.height;

            el.dispatchEvent(new CustomEvent('blockresize', {
              detail: { width: constrained.width, height: constrained.height },
            }));
          },
          end(event) {
            el.classList.remove('resizing');
            delete event.target.dataset.originalRatio;
            self.store.saveDebounced();
          },
        },
      });

    this.interactables.set(blockId, interactable);
  }

  // Where the dragged block is, in the coordinates of the page that holds its element, so that it
  // follows the mouse wherever that is (over another page or in the gap between pages).
  placeDraggedBlock(el) {
    const pageEl = el.closest('.dc-page');
    if (!this.drag || !pageEl) return;
    const pageRect = pageEl.getBoundingClientRect();
    el.style.left = `${this.drag.pointerX - this.drag.grabX - pageRect.left}px`;
    el.style.top = `${this.drag.pointerY - this.drag.grabY - pageRect.top}px`;
  }

  // The page under the middle of a block: the one that contains that point, or else the nearest
  // one (a block dropped between two pages or beside them goes to the closest page).
  pageUnder(rect) {
    const centerY = rect.top + rect.height / 2;
    let best = null;
    let bestDistance = Infinity;
    for (const pageEl of this.container.querySelectorAll('.dc-page')) {
      const pageRect = pageEl.getBoundingClientRect();
      const distance = centerY < pageRect.top ? pageRect.top - centerY : centerY > pageRect.bottom ? centerY - pageRect.bottom : 0;
      if (distance < bestDistance) {
        best = pageEl;
        bestDistance = distance;
      }
    }
    return best;
  }

  // Drops the block: on the page under it, at the place where it was released or, when that
  // place is taken, at the nearest free place.
  dropDraggedBlock(blockId, el) {
    const rect = el.getBoundingClientRect();
    const targetEl = this.pageUnder(rect);
    const block = this.store.findBlock(blockId);
    if (!targetEl || !block) return;
    const targetRect = targetEl.getBoundingClientRect();
    const wanted = { x: rect.left - targetRect.left, y: rect.top - targetRect.top };
    const changed = this.store.dropBlock(blockId, targetEl.dataset.pageId, wanted);
    // The old element is replaced by a new one in the new page: it is hidden right away.
    if (changed && this.store.findBlockPage(blockId).id !== el.closest('.dc-page')?.dataset.pageId) {
      el.style.visibility = 'hidden';
    }
    // Same page, or nothing to change: the element goes to the place kept by the store.
    if (!changed || this.store.findBlockPage(blockId).id === el.closest('.dc-page')?.dataset.pageId) {
      el.style.left = `${block.x}px`;
      el.style.top = `${block.y}px`;
    }
  }

  updateInteractBounds() {
    const dims = this.store.getPageDimensions();
    for (const [blockId, interactable] of this.interactables) {
      interactable.resizable({
        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: MIN_BLOCK_SIZE, height: MIN_BLOCK_SIZE },
            max: { width: dims.width, height: dims.height },
          }),
        ],
      });
    }
  }

  destroy() {
    for (const interactable of this.interactables.values()) {
      interactable.unset();
    }
    this.interactables.clear();
    this.blockElements.clear();
  }
}

export { BlockManager };
