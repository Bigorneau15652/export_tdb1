import interact from 'interactjs';
import { PageManager, MIN_BLOCK_SIZE } from './page-manager.js';
import { clamp } from './utils.js';

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
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: 'parent',
            endOnly: true,
          }),
        ],
        listeners: {
          start(event) {
            el.classList.add('dragging');
          },
          move(event) {
            const block = self.store.findBlock(blockId);
            if (!block) return;

            let newX = block.x + event.dx;
            let newY = block.y + event.dy;

            const constrained = self.pageManager.constrainToPage(
              blockId, newX, newY, block.width, block.height
            );

            el.style.left = `${constrained.x}px`;
            el.style.top = `${constrained.y}px`;

            block.x = constrained.x;
            block.y = constrained.y;
          },
          end(event) {
            el.classList.remove('dragging');
            self.store.saveDebounced();
          },
        },
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        modifiers: [
          interact.modifiers.aspectRatio({
            ratio: 'preserve',
            modifiers: [
              interact.modifiers.restrictSize({
                min: { width: MIN_BLOCK_SIZE, height: MIN_BLOCK_SIZE },
                max: { width: dims.width, height: dims.height },
              }),
            ],
          }),
          interact.modifiers.restrictSize({
            min: { width: MIN_BLOCK_SIZE, height: MIN_BLOCK_SIZE },
            max: { width: dims.width, height: dims.height },
          }),
        ],
        listeners: {
          start(event) {
            el.classList.add('resizing');
          },
          move(event) {
            const block = self.store.findBlock(blockId);
            if (!block) return;

            let newWidth = event.rect.width;
            let newHeight = event.rect.height;
            let newX = block.x + (event.deltaRect.left || 0);
            let newY = block.y + (event.deltaRect.top || 0);

            if (event.shiftKey) {
              const ratio = block.width / block.height;
              if (Math.abs(event.deltaRect.right) > Math.abs(event.deltaRect.bottom)) {
                newHeight = newWidth / ratio;
              } else {
                newWidth = newHeight * ratio;
              }
            }

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
            self.store.saveDebounced();
          },
        },
      });

    this.interactables.set(blockId, interactable);
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
