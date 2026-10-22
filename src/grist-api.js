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
  console.log('[grist-api] grist.getTable:', typeof g.getTable);
  console.log('[grist-api] grist.selectedTable:', g.selectedTable?.constructor?.name || typeof g.selectedTable);

  try {
    await g.ready({
      requiredAccess: 'full',
      allowSelectBy: true,
    });
  } catch (e) {
    console.error('[grist-api] grist.ready() error:', e);
    try {
      await g.ready();
    } catch (e2) {
      console.error('[grist-api] grist.ready() fallback error:', e2);
    }
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
      try {
        await _recordCallback(record, mappings);
      } catch (e) {
        console.error('[grist-api] record callback error:', e);
      }
    }
  });

  g.onOptions((options) => {
    if (_optionsCallback) _optionsCallback(options);
  });

  return true;
}

export function onRecord(callback) {
  _recordCallback = callback;
}

export function onOptionsChange(callback) {
  _optionsCallback = callback;
}

export function getCurrentRecord() {
  return _currentRecord;
}

export function getCurrentMappings() {
  return _currentMappings;
}

export function isGristReady() {
  return _isReady;
}

export async function getOptions() {
  const g = getGrist();
  if (!g) return {};
  try {
    const opts = await g.getOptions();
    if (opts === null || opts === undefined) return {};
    if (typeof opts !== 'object') return {};
    return opts;
  } catch (e) {
    console.error('[grist-api] getOptions error:', e);
    return {};
  }
}

export async function setOption(key, value) {
  const g = getGrist();
  if (!g) return;
  try {
    await g.setOption(key, value);
  } catch (e) {
    console.error('[grist-api] setOption error:', e);
  }
}

export async function listTables() {
  const g = getGrist();
  if (!g || !g.docApi) {
    console.log('[grist-api] listTables: no docApi');
    return [];
  }
  try {
    const tables = await g.docApi.listTables();
    console.log('[grist-api] listTables:', tables?.length || 0, tables);
    return tables || [];
  } catch (e) {
    console.error('[grist-api] listTables error:', e);
    try {
      const result = await g.docApi.executeSQL({
        sql: 'SELECT id FROM _grist_Tables ORDER BY id'
      });
      const tables = (result.records || []).map(r => r.fields.id);
      console.log('[grist-api] listTables via SQL:', tables.length);
      return tables;
    } catch (e2) {
      console.error('[grist-api] listTables SQL fallback error:', e2);
      return [];
    }
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

      if (typeof table === 'string') {
        console.log('[grist-api] getTable() string:', table);
        _linkedTableIdCache = table;
        return table;
      }

      if (table && typeof table === 'object') {
        const proto = Object.getPrototypeOf(table);
        console.log('[grist-api] table proto methods:', proto ? Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor').join(', ') : 'none');
        console.log('[grist-api] table own props:', Object.keys(table));

        for (const key of ['tableId', '_tableId', 'id', 'tableName', 'name']) {
          if (table[key] !== undefined && table[key] !== null && typeof table[key] === 'string') {
            console.log(`[grist-api] Found via getTable().${key}:`, table[key]);
            _linkedTableIdCache = table[key];
            return table[key];
          }
        }

        if (typeof table.fetch === 'function') {
          console.log('[grist-api] Trying table.fetch()...');
          try {
            const data = await table.fetch();
            console.log('[grist-api] table.fetch() keys:', data ? Object.keys(data) : 'null');
            if (data?.tableId) {
              console.log('[grist-api] Found tableId via fetch():', data.tableId);
              _linkedTableIdCache = data.tableId;
              return data.tableId;
            }
            if (data?.colInfo) {
              console.log('[grist-api] table.fetch() colInfo columns:', Object.keys(data.colInfo).length);
            }
          } catch (e) {
            console.log('[grist-api] table.fetch() error:', e.message);
          }
        }
      }
    } catch (e) {
      console.log('[grist-api] getTable() error:', e.message);
    }
  } else {
    console.log('[grist-api] g.getTable is not a function');
  }

  if (g.selectedTable) {
    try {
      const st = g.selectedTable;
      console.log('[grist-api] selectedTable:', typeof st, st?.constructor?.name);
      if (typeof st === 'string') {
        _linkedTableIdCache = st;
        return st;
      }
      if (st && typeof st === 'object') {
        for (const key of ['tableId', '_tableId', 'id']) {
          if (st[key] && typeof st[key] === 'string') {
            console.log(`[grist-api] Found via selectedTable.${key}:`, st[key]);
            _linkedTableIdCache = st[key];
            return st[key];
          }
        }
        if (typeof st.fetch === 'function') {
          console.log('[grist-api] Trying selectedTable.fetch()...');
          try {
            const data = await st.fetch();
            if (data?.tableId) {
              console.log('[grist-api] Found tableId via selectedTable.fetch():', data.tableId);
              _linkedTableIdCache = data.tableId;
              return data.tableId;
            }
          } catch (e) {
            console.log('[grist-api] selectedTable.fetch() error:', e.message);
          }
        }
      }
    } catch (e) {
      console.log('[grist-api] selectedTable error:', e.message);
    }
  }

  console.log('[grist-api] Trying record-based detection...');
  try {
    let record = _currentRecord;
    if (!record && typeof g.fetchSelectedRecord === 'function') {
      record = await g.fetchSelectedRecord();
    }
    console.log('[grist-api] record:', record ? `id=${record.id}` : 'null');

    if (record?.id && g.docApi) {
      const tables = await listTables();
      const userTables = tables.filter(t => !t.startsWith('_grist_'));
      console.log('[grist-api] Searching in', userTables.length, 'tables');

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
      if (found) {
        console.log('[grist-api] Found via record matching:', found);
        _linkedTableIdCache = found;
        return found;
      }
    }
  } catch (e) {
    console.log('[grist-api] Record matching error:', e.message);
  }

  console.log('[grist-api] === getLinkedTableId: NULL ===');
  return null;
}

export async function getLinkedTableColumns() {
  if (_linkedColumnsCache) return _linkedColumnsCache;

  const g = getGrist();
  if (!g) return [];

  console.log('[grist-api] === getLinkedTableColumns ===');

  if (typeof g.getTable === 'function') {
    try {
      const table = g.getTable();
      if (table && typeof table.fetch === 'function') {
        const data = await table.fetch();
        if (data?.colInfo) {
          const cols = Object.entries(data.colInfo).map(([id, col]) => ({
            id,
            label: col.label || id,
            type: col.type || 'Any',
          }));
          if (cols.length > 0) {
            console.log('[grist-api] Columns via getTable().fetch().colInfo:', cols.length);
            _linkedColumnsCache = cols;
            return cols;
          }
        }
        if (data?.records?.length > 0?.fields) {
          const cols = Object.keys(data.records[0].fields).map(id => ({ id, label: id, type: 'Any' }));
          console.log('[grist-api] Columns via getTable().fetch() records:', cols.length);
          _linkedColumnsCache = cols;
          return cols;
        }
      }
    } catch (e) {
      console.log('[grist-api] getTable().fetch() error:', e.message);
    }
  }

  if (g.selectedTable && typeof g.selectedTable.fetch === 'function') {
    try {
      const data = await g.selectedTable.fetch();
      if (data?.colInfo) {
        const cols = Object.entries(data.colInfo).map(([id, col]) => ({
          id,
          label: col.label || id,
          type: col.type || 'Any',
        }));
        if (cols.length > 0) {
          console.log('[grist-api] Columns via selectedTable.fetch().colInfo:', cols.length);
          _linkedColumnsCache = cols;
          return cols;
        }
      }
    } catch (e) {
      console.log('[grist-api] selectedTable.fetch() error:', e.message);
    }
  }

  const tableId = await getLinkedTableId();
  if (tableId) {
    const cols = await getTableStructure(tableId);
    if (cols.length > 0) {
      _linkedColumnsCache = cols;
      return cols;
    }
  }

  console.log('[grist-api] === getLinkedTableColumns: EMPTY ===');
  return [];
}

export async function fetchLinkedTableData(options = {}) {
  const { columns, filters, sorts, limit } = options;
  const g = getGrist();
  if (!g) return { records: [], fields: {} };

  const tableId = await getLinkedTableId();
  if (tableId) {
    console.log('[grist-api] fetchLinkedTableData via tableId:', tableId);
    return fetchTableData(tableId, options);
  }

  if (typeof g.getTable === 'function') {
    try {
      const table = g.getTable();
      if (table && typeof table.fetch === 'function') {
        let data = await table.fetch();
        if (data?.records) {
          let records = data.records;

          if (columns?.length > 0) {
            records = records.map(rec => ({
              ...rec,
              fields: Object.fromEntries(
                Object.entries(rec.fields || {}).filter(([k]) => columns.includes(k))
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

          return { records, fields: data.colInfo || data.fields || {} };
        }
      }
    } catch (e) {
      console.log('[grist-api] fetchLinkedTableData getTable().fetch() error:', e.message);
    }
  }

  return { records: [], fields: {} };
}

export async function getTableStructure(tableId) {
  if (!tableId) return [];
  if (_structureCache[tableId]) return _structureCache[tableId];

  const g = getGrist();
  if (!g || !g.docApi) return [];

  console.log('[grist-api] getTableStructure:', tableId);

  const columns = [];

  try {
    const sql = `SELECT id, label, type, parentPos FROM _grist_Tables_column WHERE tableRef = (SELECT id FROM _grist_Tables WHERE id = ${escapeSqlValue(tableId)}) ORDER BY parentPos`;
    const result = await g.docApi.executeSQL({ sql });
    if (result?.records?.length > 0) {
      for (const r of result.records) {
        columns.push({
          id: r.fields.id,
          label: r.fields.label || r.fields.id,
          type: r.fields.type || 'Any',
        });
      }
      console.log('[grist-api] SQL metadata:', columns.length, 'columns');
    }
  } catch (e) {
    console.log('[grist-api] SQL metadata failed:', e.message);
  }

  if (columns.length === 0) {
    try {
      const data = await g.docApi.fetchTable(tableId);
      console.log('[grist-api] fetchTable keys:', Object.keys(data || {}));
      const colInfo = data.colInfo || data.fields;
      if (colInfo && typeof colInfo === 'object') {
        for (const [id, col] of Object.entries(colInfo)) {
          columns.push({
            id,
            label: col.label || id,
            type: col.type || 'Any',
          });
        }
        console.log('[grist-api] fetchTable colInfo:', columns.length, 'columns');
      } else if (data?.records?.length > 0?.fields) {
        for (const id of Object.keys(data.records[0].fields)) {
          columns.push({ id, label: id, type: 'Any' });
        }
        console.log('[grist-api] fetchTable record fields:', columns.length, 'columns');
      }
    } catch (e) {
      console.log('[grist-api] fetchTable failed:', e.message);
    }
  }

  if (columns.length === 0) {
    try {
      const result = await g.docApi.executeSQL({
        sql: `SELECT * FROM ${escapeSqlIdentifier(tableId)} LIMIT 1`
      });
      if (result?.records?.length > 0) {
        const fields = result.records[0].fields || {};
        for (const id of Object.keys(fields)) {
          columns.push({ id, label: id, type: 'Any' });
        }
        console.log('[grist-api] SQL SELECT *:', columns.length, 'columns');
      }
    } catch (e) {
      console.log('[grist-api] SQL SELECT * failed:', e.message);
    }
  }

  if (columns.length > 0) {
    _structureCache[tableId] = columns;
  }
  console.log('[grist-api] getTableStructure result:', columns.length, 'columns for', tableId);
  return columns;
}

export async function getSelectedTableId() {
  return getLinkedTableId();
}

export async function getSelectedTableColumns() {
  return getLinkedTableColumns();
}

export async function getCurrentRecordFields() {
  const g = getGrist();
  if (!g || !_currentRecord) return null;
  return _currentRecord.fields || _currentRecord;
}

export async function fetchTableData(tableId, options = {}) {
  const { columns, filters, sorts, limit } = options;
  const g = getGrist();
  if (!g || !tableId) return { records: [], fields: {} };

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
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
    }

    if (sorts?.length > 0) {
      const orderClauses = sorts
        .filter(s => s.column)
        .map(s => `${escapeSqlIdentifier(s.column)} ${(s.dir || 'asc').toUpperCase()}`);
      if (orderClauses.length > 0) {
        sql += ` ORDER BY ${orderClauses.join(', ')}`;
      }
    }

    if (limit > 0) {
      sql += ` LIMIT ${parseInt(limit, 10)}`;
    }

    const result = await g.docApi.executeSQL({ sql });
    return {
      records: result.records || [],
      fields: result.fields || {},
    };
  } catch (e) {
    console.error('[grist-api] fetchTableData SQL error, fallback:', e.message);
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

export function clearCaches() {
  _structureCache = {};
  _linkedColumnsCache = null;
  _linkedTableIdCache = null;
}

export const debouncedFetchTableData = debounce(fetchTableData, 300);
