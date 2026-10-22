import { deepClone, generateId, debounce } from './utils.js';
import { setOption, getOptions } from './grist-api.js';
import { PAGE_FORMATS, getPageDimensions } from './page-formats.js';

const OPTION_KEY = 'dashboardConfig';

const defaultConfig = {
  pageFormat: 'A4',
  pageOrientation: 'portrait',
  pages: [
    {
      id: 'page-1',
      blocks: [],
    },
  ],
};

class Store {
  constructor() {
    this.config = deepClone(defaultConfig);
    this.currentRecord = null;
    this.selectedTableId = null;
    this.listeners = new Set();
    this.selectedBlockId = null;
    this.editMode = false;
    this.previewMode = false;
    this.tables = [];
    this.tableStructures = {};
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.getState()));
  }

  getState() {
    return {
      config: this.config,
      currentRecord: this.currentRecord,
      selectedTableId: this.selectedTableId,
      selectedBlockId: this.selectedBlockId,
      editMode: this.editMode,
      previewMode: this.previewMode,
      tables: this.tables,
      tableStructures: this.tableStructures,
    };
  }

  async init() {
    const options = await getOptions();
    console.log('[store] init options:', options, typeof options);
    if (options && options[OPTION_KEY]) {
      try {
        const saved = typeof options[OPTION_KEY] === 'string'
          ? JSON.parse(options[OPTION_KEY])
          : options[OPTION_KEY];
        this.config = { ...deepClone(defaultConfig), ...saved };
      } catch (e) {
        console.error('[store] Failed to parse saved config:', e);
      }
    }
    this.notify();
  }

  async save() {
    await setOption(OPTION_KEY, JSON.stringify(this.config));
  }

  async saveDebounced() {
    if (!this._saveDebounced) {
      this._saveDebounced = debounce(() => this.save(), 500);
    }
    this._saveDebounced();
  }

  setCurrentRecord(record) {
    this.currentRecord = record;
    this.notify();
  }

  setSelectedTableId(tableId) {
    this.selectedTableId = tableId;
    this.notify();
  }

  setTables(tables) {
    this.tables = tables;
    this.notify();
  }

  setTableStructure(tableId, structure) {
    this.tableStructures[tableId] = structure;
    this.notify();
  }

  getPageDimensions() {
    return getPageDimensions(this.config.pageFormat, this.config.pageOrientation);
  }

  async setPageFormat(format) {
    this.config.pageFormat = format;
    await this.save();
    this.notify();
  }

  async setPageOrientation(orientation) {
    this.config.pageOrientation = orientation;
    await this.save();
    this.notify();
  }

  addPage() {
    const pageId = generateId('page');
    this.config.pages.push({ id: pageId, blocks: [] });
    this.notify();
    return pageId;
  }

  removePage(pageId) {
    const idx = this.config.pages.findIndex(p => p.id === pageId);
    if (idx > 0) {
      this.config.pages.splice(idx, 1);
      if (this.selectedBlockId) {
        const stillExists = this.config.pages.some(p =>
          p.blocks.some(b => b.id === this.selectedBlockId)
        );
        if (!stillExists) this.selectedBlockId = null;
      }
      this.notify();
    }
  }

  addBlock(pageId, type, x = 40, y = 40) {
    const page = this.config.pages.find(p => p.id === pageId);
    if (!page) return null;

    const block = {
      id: generateId('blk'),
      type,
      x,
      y,
      width: this.getDefaultBlockWidth(type),
      height: this.getDefaultBlockHeight(type),
      config: this.getDefaultBlockConfig(type),
    };

    page.blocks.push(block);
    this.selectedBlockId = block.id;
    this.notify();
    this.saveDebounced();
    return block;
  }

  getDefaultBlockWidth(type) {
    const dims = this.getPageDimensions();
    switch (type) {
      case 'text': return Math.floor(dims.width * 0.9);
      case 'table': return Math.floor(dims.width * 0.9);
      case 'chart': return Math.floor(dims.width * 0.55);
      case 'image': return Math.floor(dims.width * 0.4);
      default: return 300;
    }
  }

  getDefaultBlockHeight(type) {
    switch (type) {
      case 'text': return 120;
      case 'table': return 250;
      case 'chart': return 300;
      case 'image': return 250;
      default: return 200;
    }
  }

  getDefaultBlockConfig(type) {
    switch (type) {
      case 'text':
        return { markdown: '', linkedTable: null, linkedColumn: null };
      case 'table':
        return {
          sourceTable: null,
          columns: [],
          filters: [],
          sorts: [],
          tableName: '',
          footerFunc: 'sum',
          footerLabel: 'Total',
          rowAggregation: false,
          rowAggregationFunc: 'sum',
        };
      case 'chart':
        return {
          sourceTable: null,
          chartType: 'bar',
          xColumn: null,
          yColumns: [],
          palette: 'palette-1',
          filters: [],
          sorts: [],
          chartTitle: '',
        };
      case 'image':
        return {
          sourceTable: null,
          imageColumn: null,
          imageIndex: 0,
          caption: '',
        };
      default:
        return {};
    }
  }

  updateBlock(blockId, updates) {
    const block = this.findBlock(blockId);
    if (!block) return;
    Object.assign(block, updates);
    this.notify();
    this.saveDebounced();
  }

  updateBlockConfig(blockId, configUpdates) {
    const block = this.findBlock(blockId);
    if (!block) return;
    Object.assign(block.config, configUpdates);
    this.notify();
    this.saveDebounced();
  }

  removeBlock(blockId) {
    for (const page of this.config.pages) {
      const idx = page.blocks.findIndex(b => b.id === blockId);
      if (idx >= 0) {
        page.blocks.splice(idx, 1);
        if (this.selectedBlockId === blockId) this.selectedBlockId = null;
        this.notify();
        this.saveDebounced();
        return;
      }
    }
  }

  moveBlock(blockId, x, y) {
    const block = this.findBlock(blockId);
    if (!block) return;
    block.x = Math.round(x);
    block.y = Math.round(y);
    this.notify();
    this.saveDebounced();
  }

  resizeBlock(blockId, width, height) {
    const block = this.findBlock(blockId);
    if (!block) return;
    block.width = Math.round(width);
    block.height = Math.round(height);
    this.notify();
    this.saveDebounced();
  }

  changeBlockType(blockId, newType) {
    const block = this.findBlock(blockId);
    if (!block) return;
    block.type = newType;
    block.config = this.getDefaultBlockConfig(newType);
    this.notify();
    this.saveDebounced();
  }

  findBlock(blockId) {
    for (const page of this.config.pages) {
      const block = page.blocks.find(b => b.id === blockId);
      if (block) return block;
    }
    return null;
  }

  findBlockPage(blockId) {
    for (const page of this.config.pages) {
      if (page.blocks.some(b => b.id === blockId)) return page;
    }
    return null;
  }

  selectBlock(blockId) {
    this.selectedBlockId = blockId;
    this.notify();
  }

  setEditMode(enabled) {
    this.editMode = enabled;
    if (!enabled) this.selectedBlockId = null;
    this.notify();
  }

  setPreviewMode(enabled) {
    this.previewMode = enabled;
    if (enabled) {
      this.editMode = false;
      this.selectedBlockId = null;
    }
    this.notify();
  }

  getAllBlocks() {
    return this.config.pages.flatMap(p => p.blocks);
  }

  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  async importConfig(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      this.config = { ...deepClone(defaultConfig), ...imported };
      await this.save();
      this.notify();
      return true;
    } catch (e) {
      console.error('[store] Import failed:', e);
      return false;
    }
  }
}

export const store = new Store();
