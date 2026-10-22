import { debounce } from './utils.js';

let _currentRecord = null;
let _currentMappings = null;
let _structureCache = {};
let _linkedColumnsCache = null;
let _linkedTableIdCache = null;
let _dataCache = {};
let _isReady = false;
let _recordCallback = null;
let _optionsCallback = null;

function getGrist() {
  if (typeof window !== 'undefined' && window.grist) return window.grist;
  if (typeof grist !== 'undefined') return grist;
  return null;
}

export function isGristAvailable() {
  return getGrist() !== null;
}

export async function initGrist() {
  const g = getGrist();
  if (!g) {
    console.warn('[grist-api] Running outside Grist context (dev mode)');
    return false;
  }

  console.log('[grist-api] grist keys:', Object.keys(g).join(', '));

  try {
    await g.ready({
      requiredAccess: 'full',
      allowSelectBy: true,
    });
  } catch (e) {
    console.error('[grist-api] grist.ready() error:', e);
    try { await g.ready(); } catch (e2) { console.error('[grist-api] ready fallback error:', e2); }
  }

  _isReady = true;
  console.log('[grist-api] Grist widget ready');

  g.onRecord(async (record, mappings) => {
    console.log('[grist-api] onRecord:', record ? `id=${record.id}` : 'null');
    _currentRecord = record;
    _currentMappings = mappings;
    _linkedColumnsCache = null;
    _linkedTableIdCache = null;
    if (_recordCallback) {
      try { await _recordCallback(record, mappings); } catch (e) { console.error('[grist-api] callback error:', e); }
    }
  });

  g.onOptions((options) => { if (_optionsCallback) _optionsCallback(options); });

  return true;
}

export function onRecord(callback) { _recordCallback = callback; }
export function onOptionsChange(callback) { _optionsCallback = callback; }
export function getCurrentRecord() { return _currentRecord; }
export function getCurrentMappings() { return _currentMappings; }
export function isGristReady() { return _isReady; }

export async function getOptions() {
  const g = getGrist();
  if (!g) return {};
  try {
    const opts = await g.getOptions();
    if (opts == null) return {};
    if (typeof opts !== 'object') return {};
    return opts;
  } catch (e) { console.error('[grist-api] getOptions error:', e); return {}; }
}

export async function setOption(key, value) {
  const g = getGrist();
  if (!g) return;
  try { await g.setOption(key, value); } catch (e) { console.error('[grist-api] setOption error:', e); }
}

export async function listTables() {
  const g = getGrist();
  if (!g?.docApi) return [];
  try {
    const tables = await g.docApi.listTables();
    console.log('[grist-api] listTables:', tables?.length || 0);
    return tables || [];
  } catch (e) {
    console.error('[grist-api] listTables error:', e);
    return [];
  }
}

export async function getLinkedTableId() {
  if (_linkedTableIdCache) return _linkedTableIdCache;
  const g = getGrist();
  if (!g) return null;

  console.log('[grist-api] === getLinkedTableId ===');

  if (typeof g.getTable === 'function') {
    try {
      const table = g.getTable();
      console.log('[grist-api] getTable():', typeof table, table?.constructor?.name);
      if (typeof table === 'string') { _linkedTableIdCache = table; return table; }
      if (table && typeof table === 'object') {
        for (const key of ['tableId', '_tableId', 'id', 'tableName', 'name']) {
          if (typeof table[key] === 'string' && table[key]) {
            console.log(`[grist-api] Found via getTable().${key}:`, table[key]);
            _linkedTableIdCache = table[key];
            return table[key];
          }
        }
        if (typeof table.fetch === 'function') {
          try {
            const data = await table.fetch();
            if (data?.tableId) { _linkedTableIdCache = data.tableId; return data.tableId; }
          } catch (e) {}
        }
      }
    } catch (e) { console.log('[grist-api] getTable() error:', e.message); }
  }

  if (g.selectedTable) {
    try {
      const st = g.selectedTable;
      if (typeof st === 'string') { _linkedTableIdCache = st; return st; }
      if (st && typeof st === 'object') {
        for (const key of ['tableId', '_tableId', 'id']) {
          if (typeof st[key] === 'string' && st[key]) {
            _linkedTableIdCache = st[key]; return st[key];
          }
        }
      }
    } catch (e) {}
  }

  try {
    let record = _currentRecord;
    if (!record && typeof g.fetchSelectedRecord === 'function') {
      record = await g.fetchSelectedRecord();
    }
    if (record?.id && g.docApi) {
      const tables = await listTables();
      const userTables = tables.filter(t => !t.startsWith('_grist_'));
      const results = await Promise.all(userTables.map(async (tableId) => {
        try {
          const data = await g.docApi.fetchTable(tableId);
          if (data?.id && Array.isArray(data.id) && data.id.includes(record.id)) {
            return tableId;
          }
        } catch (e) {}
        return null;
      }));
      const found = results.find(r => r !== null);
      if (found) { console.log('[grist-api] Found via record matching:', found); _linkedTableIdCache = found; return found; }
    }
  } catch (e) { console.log('[grist-api] Record matching error:', e.message); }

  console.log('[grist-api] getLinkedTableId: NULL');
  return null;
}

export async function getTableStructure(tableId) {
  if (!tableId) return [];
  if (_structureCache[tableId]) return _structureCache[tableId];

  const g = getGrist();
  if (!g?.docApi) return [];

  console.log('[grist-api] getTableStructure:', tableId);

  try {
    const data = await g.docApi.fetchTable(tableId);
    console.log('[grist-api] fetchTable keys:', Object.keys(data || {}));

    const columns = [];
    const keys = Object.keys(data || {});

    for (const colId of keys) {
      const val = data[colId];
      columns.push({
        id: colId,
        label: colId,
        type: Array.isArray(val) ? 'Any' : typeof val,
      });
    }

    console.log('[grist-api] getTableStructure:', columns.length, 'columns:', columns.map(c => c.id).join(', '));
    _structureCache[tableId] = columns;
    _dataCache[tableId] = data;
    return columns;
  } catch (e) {
    console.error('[grist-api] getTableStructure error:', e.message);
    return [];
  }
}

export async function getLinkedTableColumns() {
  if (_linkedColumnsCache) return _linkedColumnsCache;
  const tableId = await getLinkedTableId();
  if (tableId) {
    const cols = await getTableStructure(tableId);
    _linkedColumnsCache = cols;
    return cols;
  }
  return [];
}

export async function getSelectedTableId() { return getLinkedTableId(); }
export async function getSelectedTableColumns() { return getLinkedTableColumns(); }

export async function getCurrentRecordFields() {
  if (!_currentRecord) return null;
  return _currentRecord.fields || _currentRecord;
}

function columnarToRecords(data) {
  if (!data || typeof data !== 'object') return [];

  const colKeys = Object.keys(data);
  if (colKeys.length === 0) return [];

  const idCol = data.id;
  if (!Array.isArray(idCol)) return [];

  const numRows = idCol.length;
  const records = [];

  for (let i = 0; i < numRows; i++) {
    const fields = {};
    for (const colId of colKeys) {
      const colData = data[colId];
      fields[colId] = Array.isArray(colData) ? colData[i] : colData;
    }
    records.push({
      id: idCol[i],
      fields: fields,
    });
  }

  return records;
}

export async function fetchTableData(tableId, options = {}) {
  const { columns, filters, sorts, limit } = options;
  const g = getGrist();
  if (!g?.docApi || !tableId) return { records: [], fields: {} };

  console.log('[grist-api] fetchTableData:', tableId);

  try {
    let data = _dataCache[tableId];
    if (!data) {
      data = await g.docApi.fetchTable(tableId);
      _dataCache[tableId] = data;
    }

    let records = columnarToRecords(data);
    console.log('[grist-api] fetchTableData:', records.length, 'records from columnar data');

    if (columns?.length > 0) {
      records = records.map(rec => ({
        ...rec,
        fields: Object.fromEntries(
          Object.entries(rec.fields).filter(([k]) => columns.includes(k))
        ),
      }));
    }

    if (filters?.length > 0) {
      records = records.filter(rec => filters.every(f => {
        const val = rec.fields[f.column];
        const fval = f.value;
        switch (f.op) {
          case 'eq': return String(val) === String(fval);
          case 'neq': return String(val) !== String(fval);
          case 'gt': return parseFloat(val) > parseFloat(fval);
          case 'gte': return parseFloat(val) >= parseFloat(fval);
          case 'lt': return parseFloat(val) < parseFloat(fval);
          case 'lte': return parseFloat(val) <= parseFloat(fval);
          case 'contains': return String(val || '').toLowerCase().includes(String(fval).toLowerCase());
          case 'startswith': return String(val || '').toLowerCase().startsWith(String(fval).toLowerCase());
          case 'endswith': return String(val || '').toLowerCase().endsWith(String(fval).toLowerCase());
          case 'isempty': return val === null || val === undefined || val === '';
          case 'isnotempty': return val !== null && val !== undefined && val !== '';
          default: return true;
        }
      }));
    }

    if (sorts?.length > 0) {
      records.sort((a, b) => {
        for (const s of sorts) {
          const av = a.fields[s.column];
          const bv = b.fields[s.column];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }

    if (limit > 0) records = records.slice(0, limit);

    const fields = {};
    for (const colId of Object.keys(data || {})) {
      fields[colId] = { label: colId, type: 'Any' };
    }

    return { records, fields };
  } catch (e) {
    console.error('[grist-api] fetchTableData error:', e.message);
    return { records: [], fields: {} };
  }
}

export async function fetchLinkedTableData(options = {}) {
  const tableId = await getLinkedTableId();
  if (tableId) return fetchTableData(tableId, options);
  return { records: [], fields: {} };
}

export function clearCaches() {
  _structureCache = {};
  _linkedColumnsCache = null;
  _linkedTableIdCache = null;
  _dataCache = {};
}

export const debouncedFetchTableData = debounce(fetchTableData, 300);
