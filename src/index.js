import './styles/main.css';
import { store } from './store.js';
import { initGrist, onRecord, onOptionsChange, listTables, getCurrentRecord, getSelectedTableId, getTableStructure } from './grist-api.js';
import { PageManager, PAGE_GAP } from './page-manager.js';
import { BlockManager } from './block-manager.js';
import { createToolbar } from './toolbar.js';
import { createEditorPanel } from './editor.js';
import { setupPrintStyles, printDashboard } from './print.js';
import { createEl, debounce } from './utils.js';
import { renderTextBlock } from './block-types/text-block.js';
import { renderTableBlock } from './block-types/table-block.js';
import { renderChartBlock } from './block-types/chart-block.js';
import { renderImageBlock } from './block-types/image-block.js';

let appEl = null;
let pagesContainer = null;
let blockManager = null;
let pageManager = null;
let blockRenderers = new Map();
let isInitialized = false;

function getBlockRenderer(type) {
  switch (type) {
    case 'text': return renderTextBlock;
    case 'table': return renderTableBlock;
    case 'chart': return renderChartBlock;
    case 'image': return renderImageBlock;
    default: return null;
  }
}

async function renderBlock(block, pageEl) {
  const existing = blockRenderers.get(block.id);
  if (existing) {
    existing.destroy();
    blockRenderers.delete(block.id);
  }

  let blockEl = pageEl.querySelector(`[data-block-id="${block.id}"]`);
  if (!blockEl) {
    blockEl = createEl('div', 'dc-block');
    blockEl.dataset.blockId = block.id;
    blockEl.style.left = `${block.x}px`;
    blockEl.style.top = `${block.y}px`;
    blockEl.style.width = `${block.width}px`;
    blockEl.style.height = `${block.height}px`;

    const toolbar = createEl('div', 'dc-block-toolbar');
    const editBtn = createEl('button', 'dc-block-edit-btn', '✏️');
    editBtn.title = 'Éditer (clic) ou double-clic sur le bloc';
    const deleteBtn = createEl('button', 'dc-block-delete-btn', '✕');
    deleteBtn.title = 'Supprimer';
    toolbar.appendChild(editBtn);
    toolbar.appendChild(deleteBtn);
    blockEl.appendChild(toolbar);

    const resizeHandle = createEl('div', 'dc-block-resize-handle');
    blockEl.appendChild(resizeHandle);

    const contentEl = createEl('div', 'dc-block-content');
    blockEl.appendChild(contentEl);

    pageEl.appendChild(blockEl);

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBlockEditor(block.id);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Supprimer ce bloc ?')) {
        store.removeBlock(block.id);
      }
    });

    blockEl.addEventListener('click', (e) => {
      if (!store.editMode) return;
      e.stopPropagation();
      store.selectBlock(block.id);
    });

    blockEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openBlockEditor(block.id);
    });

    if (blockManager) {
      blockManager.registerBlock(block.id, blockEl);
    }
  } else {
    blockEl.style.left = `${block.x}px`;
    blockEl.style.top = `${block.y}px`;
    blockEl.style.width = `${block.width}px`;
    blockEl.style.height = `${block.height}px`;
  }

  blockEl.classList.toggle('dc-selected', store.selectedBlockId === block.id);
  blockEl.classList.toggle('dc-hidden', store.previewMode);
  blockEl.querySelector('.dc-block-toolbar').style.display = store.editMode ? 'flex' : 'none';
  blockEl.querySelector('.dc-block-resize-handle').style.display = store.editMode ? 'block' : 'none';

  const renderer = getBlockRenderer(block.type);
  if (renderer) {
    const contentEl = blockEl.querySelector('.dc-block-content');
    const instance = await renderer(block, contentEl, store);
    blockRenderers.set(block.id, instance);
  }
}

async function renderPage(page, pageIndex) {
  const dims = store.getPageDimensions();

  let pageEl = pagesContainer.querySelector(`[data-page-id="${page.id}"]`);
  if (!pageEl) {
    pageEl = createEl('div', 'dc-page');
    pageEl.dataset.pageId = page.id;
    pageEl.style.width = `${dims.width}px`;
    pageEl.style.height = `${dims.height}px`;

    const indicator = createEl('div', 'dc-page-indicator', `Page ${pageIndex + 1}`);
    pageEl.appendChild(indicator);

    pagesContainer.appendChild(pageEl);
  }

  pageEl.style.width = `${dims.width}px`;
  pageEl.style.height = `${dims.height}px`;

  pageEl.querySelector('.dc-page-indicator').textContent = `Page ${pageIndex + 1}`;

  const existingBlockIds = new Set(
    Array.from(pageEl.querySelectorAll('.dc-block')).map(el => el.dataset.blockId)
  );

  for (const block of page.blocks) {
    await renderBlock(block, pageEl);
    existingBlockIds.delete(block.id);
  }

  for (const orphanId of existingBlockIds) {
    const orphanEl = pageEl.querySelector(`[data-block-id="${orphanId}"]`);
    if (orphanEl) {
      if (blockManager) blockManager.unregisterBlock(orphanId);
      const renderer = blockRenderers.get(orphanId);
      if (renderer) {
        renderer.destroy();
        blockRenderers.delete(orphanId);
      }
      orphanEl.remove();
    }
  }

  const emptyState = pageEl.querySelector('.dc-empty-state');
  if (page.blocks.length === 0 && !emptyState) {
    const empty = createEl('div', 'dc-empty-state');
    empty.innerHTML = '<span class="dc-empty-icon">📄</span><br>Page vide<br><small>Cliquez sur "Éditer" puis ajoutez des blocs</small>';
    pageEl.appendChild(empty);
  } else if (page.blocks.length > 0 && emptyState) {
    emptyState.remove();
  }
}

async function renderAll() {
  if (!pagesContainer) return;

  const dims = store.getPageDimensions();

  for (let i = 0; i < store.config.pages.length; i++) {
    await renderPage(store.config.pages[i], i);
  }

  const existingPages = Array.from(pagesContainer.querySelectorAll('.dc-page'));
  for (const pageEl of existingPages) {
    const pageId = pageEl.dataset.pageId;
    if (!store.config.pages.find(p => p.id === pageId)) {
      pageEl.remove();
    }
  }

  updatePageVisibility();
}

function updatePageVisibility() {
  const pageEls = pagesContainer.querySelectorAll('.dc-page');
  pageEls.forEach(el => {
    el.classList.toggle('dc-hidden', store.previewMode && false);
  });
}

function openBlockEditor(blockId) {
  const block = store.findBlock(blockId);
  if (!block) return;

  const existing = document.querySelector('.dc-editor-overlay');
  if (existing) existing.remove();

  const panel = createEditorPanel(block, store, (reopen) => {
    if (reopen) {
      renderAll();
    }
  });
  document.body.appendChild(panel);
}

async function addBlock(type) {
  const activePage = store.config.pages[store.config.pages.length - 1];
  if (!activePage) return;

  const pos = pageManager.findFreePosition(activePage.id, 400, 200);
  const block = store.addBlock(activePage.id, type, pos.x, pos.y);

  if (block) {
    await renderAll();
    openBlockEditor(block.id);
  }
}

function onFormatChange() {
  if (blockManager) blockManager.updateInteractBounds();
  renderAll();
  setupPrintStyles(store);
}

async function init() {
  appEl = document.getElementById('app');
  if (!appEl) {
    console.error('[dashboard-composer] #app element not found');
    return;
  }

  appEl.innerHTML = '';

  const toolbar = createToolbar(store, {
    onAddBlock: addBlock,
    onPrint: printDashboard,
    onFormatChange,
  });
  appEl.appendChild(toolbar);

  pagesContainer = createEl('div', 'dc-pages-container');
  appEl.appendChild(pagesContainer);

  pageManager = new PageManager(store);
  blockManager = new BlockManager(store, pagesContainer);

  const isGrist = await initGrist();

  await store.init();

  if (isGrist) {
    try {
      let tables = await listTables();
      const selectedTableId = await getSelectedTableId();

      if (selectedTableId) {
        store.setSelectedTableId(selectedTableId);
        if (!tables || tables.length === 0 || !tables.includes(selectedTableId)) {
          tables = tables || [];
          if (!tables.includes(selectedTableId)) tables.unshift(selectedTableId);
        }
        try {
          const structure = await getTableStructure(selectedTableId);
          store.setTableStructure(selectedTableId, structure);
        } catch (e) {
          console.error('[index] Error loading selected table structure:', e);
        }
      }

      store.setTables(tables || []);
      console.log('[dashboard-composer] Tables loaded:', tables);
      console.log('[dashboard-composer] Selected table:', selectedTableId);
    } catch (e) {
      console.error('[dashboard-composer] Error loading tables:', e);
    }
  }

  setupPrintStyles(store);

  store.subscribe(debounce((state) => {
    renderAll();
    if (state.previewMode) {
      toolbar.classList.add('dc-hidden');
    } else {
      toolbar.classList.remove('dc-hidden');
    }
  }, 50));

  if (isGrist) {
    onRecord(async (record, mappings) => {
      store.setCurrentRecord(record);
      const selectedTableId = await getSelectedTableId();
      if (selectedTableId) {
        store.setSelectedTableId(selectedTableId);
      }
      refreshAllBlocks();
    });

    onOptionsChange((options) => {
      store.init();
    });
  } else {
    console.warn('[dashboard-composer] Running in dev mode (no Grist context)');
    store.setTables(['Sites', 'Batiments', 'Niveaux', 'Locaux', 'Surfaces_fonctionnelles']);
    store.setTableStructure('Batiments', [
      { id: 'numero', label: 'Numéro', type: 'Text' },
      { id: 'appellation', label: 'Appellation', type: 'Text' },
      { id: 'nom_batiment', label: 'Nom du bâtiment', type: 'Text' },
      { id: 'annee_construction', label: 'Année de construction', type: 'Int' },
      { id: 'SUN', label: 'SUN', type: 'Numeric' },
      { id: 'SUB', label: 'SUB', type: 'Numeric' },
      { id: 'SDP', label: 'SDP', type: 'Numeric' },
    ]);
    store.setTableStructure('Niveaux', [
      { id: 'niveau', label: 'Niveau', type: 'Text' },
      { id: 'SUN', label: 'SUN', type: 'Numeric' },
      { id: 'SUB', label: 'SUB', type: 'Numeric' },
      { id: 'SDP', label: 'SDP', type: 'Numeric' },
      { id: 'SHOB', label: 'SHOB', type: 'Numeric' },
      { id: 'SCE', label: 'SCE', type: 'Numeric' },
    ]);
  }

  await renderAll();
  isInitialized = true;
}

async function refreshAllBlocks() {
  for (const [blockId, renderer] of blockRenderers) {
    if (renderer && typeof renderer.update === 'function') {
      await renderer.update();
    }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.querySelector('.dc-editor-overlay');
    if (overlay) overlay.remove();
    store.selectBlock(null);
  }
  if (e.key === 'Delete' && store.selectedBlockId && store.editMode) {
    if (confirm('Supprimer ce bloc ?')) {
      store.removeBlock(store.selectedBlockId);
    }
  }
});

document.addEventListener('DOMContentLoaded', init);
