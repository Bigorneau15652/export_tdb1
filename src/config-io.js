// Export and import of the page layout (pages, blocks and their settings) as a JSON text.
// The data of the Grist tables is never exported: only how the dashboard is composed.
// Everything that is read back is checked field by field (types, lists, sizes): a field that is
// not known is dropped and reported, so that an imported text can never inject anything into the
// widget. Nothing here touches the page.
import { PAGE_FORMATS } from './page-formats.js';
import { PALETTES } from './palettes.js';
import { generateId } from './utils.js';

export const FORMAT_ID = `grist-dashboard-composer`;
export const FORMAT_VERSION = 1;

export const BLOCK_TYPES = [`text`, `table`, `chart`, `image`];
export const CHART_TYPES = [
  `barGrouped`, `line`, `hBarStacked`, `barStacked`, `bar3D`, `hBar3D`,
  `areaStacked`, `pie`, `pie3D`, `doughnut`, `scatter`, `treemap`
];
export const FILTER_OPS = [
  `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startswith`, `endswith`, `isempty`, `isnotempty`
];
export const AGGREGATIONS = [`sum`, `avg`, `min`, `max`, `count`];

const MAX_TEXT_LENGTH = 200000;
const MAX_NAME_LENGTH = 200;
const MAX_PAGES = 30;
const MAX_BLOCKS_PER_PAGE = 100;
const MAX_LIST = 60;
const MAX_FILTERS = 20;
const MAX_SORTS = 5;
const MAX_POSITION = 10000;
const MIN_SIZE = 20;
const MAX_IMPORT_LENGTH = 2000000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// A text of at most max characters, or the fallback when the value is not a text.
function text(value, max, fallback = ``) {
  return typeof value === `string` ? value.slice(0, max) : fallback;
}

// A name of a table or a column: a text, or null when empty.
function name(value) {
  const result = text(value, MAX_NAME_LENGTH);
  return result === `` ? null : result;
}

function flag(value, fallback) {
  return typeof value === `boolean` ? value : fallback;
}

function oneOf(value, list, fallback) {
  return list.includes(value) ? value : fallback;
}

function number(value, min, max, fallback) {
  const parsed = typeof value === `number` ? value : Number(value);
  if (value === null || value === undefined || value === `` || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function list(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

// A column of a table block: { id, label }. A bare text is accepted for { id: text, label: text }.
function column(value) {
  if (typeof value === `string`) {
    const id = name(value);
    return id ? { id, label: id } : null;
  }
  if (!value || typeof value !== `object`) return null;
  const id = name(value.id);
  if (!id) return null;
  return { id, label: text(value.label, MAX_NAME_LENGTH) || id };
}

function filter(value) {
  if (!value || typeof value !== `object`) return null;
  const columnId = name(value.column);
  if (!columnId || !FILTER_OPS.includes(value.op)) return null;
  const raw = value.value;
  const asText = typeof raw === `number` || typeof raw === `boolean` ? String(raw) : text(raw, MAX_NAME_LENGTH);
  return { column: columnId, op: value.op, value: asText };
}

function sort(value) {
  if (!value || typeof value !== `object`) return null;
  const columnId = name(value.column);
  return columnId ? { column: columnId, dir: value.dir === `desc` ? `desc` : `asc` } : null;
}

function compact(items, read) {
  return items.map(read).filter(Boolean);
}

// The settings of each type of block: only the known fields are kept, each one checked.
const BLOCK_CONFIG = {
  text(config) {
    return {
      markdown: text(config.markdown, MAX_TEXT_LENGTH),
      linkedTable: name(config.linkedTable),
      linkedColumn: name(config.linkedColumn),
      useLinkedTable: flag(config.useLinkedTable, true)
    };
  },
  table(config) {
    return {
      useLinkedTable: flag(config.useLinkedTable, true),
      sourceTable: name(config.sourceTable),
      columns: compact(list(config.columns, MAX_LIST), column),
      filters: compact(list(config.filters, MAX_FILTERS), filter),
      sorts: compact(list(config.sorts, MAX_SORTS), sort),
      dynamicFilter: flag(config.dynamicFilter, false),
      dynamicFilterColumn: name(config.dynamicFilterColumn),
      tableName: text(config.tableName, MAX_NAME_LENGTH),
      footerFunc: oneOf(config.footerFunc, AGGREGATIONS, null),
      footerLabel: text(config.footerLabel, MAX_NAME_LENGTH, `Total`),
      rowAggregation: flag(config.rowAggregation, false),
      rowAggregationFunc: oneOf(config.rowAggregationFunc, AGGREGATIONS, `sum`)
    };
  },
  chart(config) {
    return {
      useLinkedTable: flag(config.useLinkedTable, true),
      sourceTable: name(config.sourceTable),
      chartType: oneOf(config.chartType, CHART_TYPES, `barGrouped`),
      xColumn: name(config.xColumn),
      yColumns: compact(list(config.yColumns, MAX_LIST), name),
      palette: oneOf(config.palette, Object.keys(PALETTES), `palette-1`),
      filters: compact(list(config.filters, MAX_FILTERS), filter),
      sorts: compact(list(config.sorts, MAX_SORTS), sort),
      chartTitle: text(config.chartTitle, MAX_NAME_LENGTH)
    };
  },
  image(config) {
    return {
      useLinkedTable: flag(config.useLinkedTable, true),
      sourceTable: name(config.sourceTable),
      imageColumn: name(config.imageColumn),
      imageIndex: Math.round(number(config.imageIndex, 0, 99, 0)),
      caption: text(config.caption, MAX_NAME_LENGTH)
    };
  }
};

// Identifiers become part of the page, so only plain ones are kept; a missing, odd or repeated
// identifier is replaced by a new one.
function freshId(value, prefix, used) {
  let id = typeof value === `string` && ID_PATTERN.test(value) ? value : ``;
  if (!id || used.has(id)) id = generateId(prefix);
  used.add(id);
  return id;
}

function readBlock(raw, index, used, notes, pageNumber) {
  const label = `page ${pageNumber}, bloc ${index + 1}`;
  if (!raw || typeof raw !== `object`) {
    notes.push(`Ignoré (${label}) : ce n'est pas un bloc.`);
    return null;
  }
  if (!BLOCK_TYPES.includes(raw.type)) {
    notes.push(`Ignoré (${label}) : type de bloc inconnu « ${text(raw.type, 40, `?`)} ». Types possibles : ${BLOCK_TYPES.join(`, `)}.`);
    return null;
  }
  const config = raw.config && typeof raw.config === `object` ? raw.config : {};
  return {
    id: freshId(raw.id, `blk`, used),
    type: raw.type,
    x: Math.round(number(raw.x, 0, MAX_POSITION, 40)),
    y: Math.round(number(raw.y, 0, MAX_POSITION, 40)),
    width: Math.round(number(raw.width, MIN_SIZE, MAX_POSITION, 300)),
    height: Math.round(number(raw.height, MIN_SIZE, MAX_POSITION, 200)),
    config: BLOCK_CONFIG[raw.type](config)
  };
}

// Reads a layout and returns { config, notes }: config is complete and valid, notes lists in
// French what was dropped or replaced.
export function sanitizeConfig(raw, notes = []) {
  const source = raw && typeof raw === `object` ? raw : {};
  const used = new Set();
  const pageFormat = oneOf(source.pageFormat, Object.keys(PAGE_FORMATS), `A4`);
  if (source.pageFormat !== undefined && source.pageFormat !== pageFormat) {
    notes.push(`Format de page « ${text(source.pageFormat, 40, `?`)} » inconnu : A4 utilisé. Formats possibles : ${Object.keys(PAGE_FORMATS).join(`, `)}.`);
  }
  const pages = [];
  const rawPages = list(source.pages, MAX_PAGES);
  if (Array.isArray(source.pages) && source.pages.length > MAX_PAGES) {
    notes.push(`Seules les ${MAX_PAGES} premières pages sont importées.`);
  }
  rawPages.forEach((rawPage, pageIndex) => {
    if (!rawPage || typeof rawPage !== `object`) {
      notes.push(`Ignoré (page ${pageIndex + 1}) : ce n'est pas une page.`);
      return;
    }
    const rawBlocks = list(rawPage.blocks, MAX_BLOCKS_PER_PAGE);
    if (Array.isArray(rawPage.blocks) && rawPage.blocks.length > MAX_BLOCKS_PER_PAGE) {
      notes.push(`Page ${pageIndex + 1} : seuls les ${MAX_BLOCKS_PER_PAGE} premiers blocs sont importés.`);
    }
    const id = freshId(rawPage.id, `page`, used);
    const blocks = rawBlocks.map((block, index) => readBlock(block, index, used, notes, pageIndex + 1)).filter(Boolean);
    pages.push({ id, blocks });
  });
  if (!pages.length) pages.push({ id: freshId(`page-1`, `page`, used), blocks: [] });
  return {
    config: {
      pageFormat,
      pageOrientation: source.pageOrientation === `landscape` ? `landscape` : `portrait`,
      pages
    },
    notes
  };
}

// The text to save: a small header (format and version), then the layout.
export function buildExport(config) {
  const { config: clean } = sanitizeConfig(config);
  return JSON.stringify({ format: FORMAT_ID, version: FORMAT_VERSION, config: clean }, null, 2);
}

// Reads a text pasted or loaded by the user. Returns { config, notes } or { error }.
// A layout without header (the raw setting saved by the widget) is accepted as well.
export function parseImport(input) {
  if (typeof input !== `string` || !input.trim()) return { error: `Le texte est vide.` };
  if (input.length > MAX_IMPORT_LENGTH) return { error: `Le texte est trop long (plus de ${MAX_IMPORT_LENGTH} caractères).` };
  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    return { error: `Ce texte n'est pas du JSON valide : ${text(e && e.message, 200, `erreur de lecture`)}.` };
  }
  if (!data || typeof data !== `object` || Array.isArray(data)) return { error: `Le JSON doit être un objet.` };
  const notes = [];
  let layout = data;
  if (data.format !== undefined || data.config !== undefined) {
    if (data.format !== FORMAT_ID) return { error: `Le champ format doit valoir « ${FORMAT_ID} ».` };
    if (!Number.isFinite(data.version) || data.version > FORMAT_VERSION) {
      return { error: `Version ${text(String(data.version), 20, `?`)} non prise en charge (version maximale : ${FORMAT_VERSION}).` };
    }
    layout = data.config;
  }
  if (!layout || typeof layout !== `object` || !Array.isArray(layout.pages)) {
    return { error: `La mise en page doit contenir une liste pages.` };
  }
  return sanitizeConfig(layout, notes);
}

// A readable summary of a layout, for the message shown before an import is applied.
export function describeConfig(config) {
  const blocks = config.pages.reduce((total, page) => total + page.blocks.length, 0);
  const pages = config.pages.length;
  return `${pages} page${pages > 1 ? `s` : ``}, ${blocks} bloc${blocks > 1 ? `s` : ``}, format ${config.pageFormat} ${config.pageOrientation === `landscape` ? `paysage` : `portrait`}.`;
}
