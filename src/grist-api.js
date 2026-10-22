import { debounce, escapeSqlValue, escapeSqlIdentifier } from './utils.js';

let _currentRecord = null;
let _currentMappings = null;
let _structureCache = {};
let _linkedColumnsCache = null;
let _linkedTableIdCache = null;
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
    console.log('[grist-api] listTables:', tables?.length, tables);
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
            console.log('[grist-api] table.fetch() result keys:', data ? Object.keys(data) : 'null');
            if (data?.tableId) { _linkedTableIdCache = data.tableId; return data.tableId; }
          } catch (e) { console.log('[grist-api] table.fetch() error:', e.message); }
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
          const res = await g.docApi.executeSQL({
            sql: `SELECT id FROM ${escapeSqlIdentifier(tableId)} WHERE id = ${record.id} LIMIT 1`
          });
          if (res?.records?.length > 0) return tableId;
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

  console.log('[grist-api] ===== getTableStructure START:', tableId, '=====');

  const columns = [];

  console.log('[grist-api] Method 1: docApi.fetchTable()');
  try {
    const data = await g.docApi.fetchTable(tableId);
    console.log('[grist-api] fetchTable result type:', typeof data);
    console.log('[grist-api] fetchTable keys:', data ? Object.keys(data) : 'null');
    console.log('[grist-api] fetchTable raw (first 2000 chars):', JSON.stringify(data).slice(0, 2000));

    if (data?.colInfo && typeof data.colInfo === 'object') {
      console.log('[grist-api] colInfo keys:', Object.keys(data.colInfo).length);
      for (const [id, col] of Object.entries(data.colInfo)) {
        columns.push({
          id: id,
          label: col.label || id,
          type: col.type || 'Any',
        });
      }
      console.log('[grist-api] Method 1 SUCCESS:', columns.length, 'columns from colInfo');
    } else if (data?.fields && typeof data.fields === 'object') {
      console.log('[grist-api] fields keys:', Object.keys(data.fields).length);
      for (const [id, col] of Object.entries(data.fields)) {
        columns.push({
          id: id,
          label: col?.label || id,
          type: col?.type || 'Any',
        });
      }
      console.log('[grist-api] Method 1 SUCCESS:', columns.length, 'columns from fields');
    } else if (data?.records?.length > 0) {
      const firstRec = data.records[0];
      console.log('[grist-api] first record keys:', Object.keys(firstRec));
      console.log('[grist-api] first record.fields keys:', firstRec.fields ? Object.keys(firstRec.fields).length : 'no fields');
      if (firstRec.fields) {
        for (const id of Object.keys(firstRec.fields)) {
          columns.push({ id, label: id, type: 'Any' });
        }
        console.log('[grist-api] Method 1 SUCCESS:', columns.length, 'columns from record.fields');
      }
    } else {
      console.log('[grist-api] Method 1: no colInfo, no fields, records:', data?.records?.length || 0);
    }
  } catch (e) {
    console.log('[grist-api] Method 1 FAILED:', e.message);
  }

  if (columns.length === 0) {
    console.log('[grist-api] Method 2: SQL on _grist_Tables_column');
    try {
      const sql = `SELECT id, label, type, parentPos FROM _grist_Tables_column WHERE tableRef = (SELECT id FROM _grist_Tables WHERE id = ${escapeSqlValue(tableId)}) ORDER BY parentPos`;
      console.log('[grist-api] SQL:', sql);
      const result = await g.docApi.executeSQL({ sql });
      console.log('[grist-api] SQL result records:', result?.records?.length || 0);
      console.log('[grist-api] SQL result raw (first 1000 chars):', JSON.stringify(result).slice(0, 1000));
      if (result?.records?.length > 0) {
        for (const r of result.records) {
          columns.push({
            id: r.fields.id,
            label: r.fields.label || r.fields.id,
            type: r.fields.type || 'Any',
          });
        }
        console.log('[grist-api] Method 2 SUCCESS:', columns.length, 'columns');
      }
    } catch (e) {
      console.log('[grist-api] Method 2 FAILED:', e.message);
    }
  }

  if (columns.length === 0) {
    console.log('[grist-api] Method 3: SQL SELECT * LIMIT 1');
    try {
      const result = await g.docApi.executeSQL({
        sql: `SELECT * FROM ${escapeSqlIdentifier(tableId)} LIMIT 1`
      });
      console.log('[grist-api] SELECT * result records:', result?.records?.length || 0);
      console.log('[grist-api] SELECT * raw (first 2000 chars):', JSON.stringify(result).slice(0, 2000));
      if (result?.records?.length > 0) {
        const fields = result.records[0].fields || {};
        console.log('[grist-api] SELECT * fields keys:', Object.keys(fields));
        for (const id of Object.keys(fields)) {
          columns.push({ id, label: id, type: 'Any' });
        }
        console.log('[grist-api] Method 3 SUCCESS:', columns.length, 'columns');
      }
    } catch (e) {
      console.log('[grist-api] Method 3 FAILED:', e.message);
    }
  }

  if (columns.length === 0) {
    console.log('[grist-api] Method 4: SQL SELECT * LIMIT 0 (columns only via sqlite pragma)');
    try {
      const result = await g.docApi.executeSQL({
        sql: `SELECT * FROM ${escapeSqlIdentifier(tableId)} LIMIT 0`
      });
      console.log('[grist-api] LIMIT 0 result:', JSON.stringify(result).slice(0, 1000));
      if (result?.fields) {
        for (const [id, col] of Object.entries(result.fields)) {
          columns.push({ id, label: col?.label || id, type: col?.type || 'Any' });
        }
      }
    } catch (e) {
      console.log('[grist-api] Method 4 FAILED:', e.message);
    }
  }

  if (columns.length > 0) {
    _structureCache[tableId] = columns;
  }
  console.log('[grist-api] ===== getTableStructure END:', columns.length, 'columns for', tableId, '=====');
  return columns;
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

export async function fetchTableData(tableId, options = {}) {
  const { columns, filters, sorts, limit } = options;
  const g = getGrist();
  if (!g || !tableId) return { records: [], fields: {} };

  console.log('[grist-api] fetchTableData:', tableId, 'columns:', columns?.length, 'filters:', filters?.length, 'limit:', limit);

  try {
    let sql = `SELECT * FROM ${escapeSqlIdentifier(tableId)}`;

    if (filters?.length > 0) {
      const whereClauses = filters
        .filter(f => f.column && f.op && f.value !== undefined && f.value !== '')
        .map(f => {
          const col = escapeSqlIdentifier(f.column);
          const val = escapeSqlValue(f.value);
          switch (f.op) {
            case 'eq': return `${col} = ${val}`;
            case 'neq': return `${col} != ${val}`;
            case 'gt': return `${col} > ${val}`;
            case 'gte': return `${col} >= ${val}`;
            case 'lt': return `${col} < ${val}`;
            case 'lte': return `${col} <= ${val}`;
            case 'contains': return `${col} LIKE '%' || ${val} || '%'`;
            case 'startswith': return `${col} LIKE ${val} || '%'`;
            case 'endswith': return `${col} LIKE '%' || ${val}`;
            case 'isempty': return `(${col} IS NULL OR ${col} = '')`;
            case 'isnotempty': return `(${col} IS NOT NULL AND ${col} != '')`;
            default: return null;
          }
        })
        .filter(Boolean);
      if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (sorts?.length > 0) {
      const orderClauses = sorts
        .filter(s => s.column)
        .map(s => `${escapeSqlIdentifier(s.column)} ${(s.dir || 'asc').toUpperCase()}`);
      if (orderClauses.length > 0) sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }

    if (limit > 0) sql += ` LIMIT ${parseInt(limit, 10)}`;

    console.log('[grist-api] SQL:', sql.slice(0, 500));
    const result = await g.docApi.executeSQL({ sql });
    console.log('[grist-api] SQL result records:', result?.records?.length || 0);
    return { records: result.records || [], fields: result.fields || {} };
  } catch (e) {
    console.error('[grist-api] fetchTableData SQL error:', e.message);
    console.log('[grist-api] Fallback to fetchTable...');
    try {
      const data = await g.docApi.fetchTable(tableId);
      let records = data.records || [];

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

      let selectedRecords = records;
      if (columns?.length > 0) {
        selectedRecords = records.map(rec => ({
          ...rec,
          fields: Object.fromEntries(
            Object.entries(rec.fields).filter(([k]) => columns.includes(k))
          ),
        }));
      }

      return { records: selectedRecords, fields: data.colInfo || data.fields || {} };
    } catch (e2) {
      console.error('[grist-api] fetchTable fallback error:', e2);
      return { records: [], fields: {} };
    }
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
}

export const debouncedFetchTableData = debounce(fetchTableData, 300);
