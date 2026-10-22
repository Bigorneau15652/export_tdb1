import { debounce, escapeSqlValue, escapeSqlIdentifier } from './utils.js';

let _currentRecord = null;
let _currentMappings = null;
let _tableCache = {};
let _structureCache = {};
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

  console.log('[grist-api] grist object found:', Object.keys(g));
  console.log('[grist-api] grist.docApi:', !!g.docApi);

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
    console.log('[grist-api] onRecord received:', record ? 'record present' : 'null');
    _currentRecord = record;
    _currentMappings = mappings;
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
  if (!g || !g.docApi) return [];
  try {
    return await g.docApi.listTables();
  } catch (e) {
    console.error('[grist-api] listTables error:', e);
    return [];
  }
}

export async function getTableStructure(tableId) {
  if (!tableId) return [];
  if (_structureCache[tableId]) return _structureCache[tableId];

  const g = getGrist();
  if (!g || !g.docApi) return [];

  console.log('[grist-api] getTableStructure for:', tableId);

  const columns = [];

  try {
    const sql = `SELECT id, label, type, parentPos FROM _grist_Tables_column WHERE tableRef = (SELECT id FROM _grist_Tables WHERE id = ${escapeSqlValue(tableId)}) ORDER BY parentPos`;
    const result = await g.docApi.executeSQL({ sql });
    if (result && result.records && result.records.length > 0) {
      for (const r of result.records) {
        columns.push({
          id: r.fields.id,
          label: r.fields.label || r.fields.id,
          type: r.fields.type || 'Any',
        });
      }
      console.log('[grist-api] SQL _grist_Tables_column:', columns.length, 'columns');
    }
  } catch (e) {
    console.log('[grist-api] SQL _grist_Tables_column failed:', e.message);
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
        console.log('[grist-api] fetchTable colInfo/fields:', columns.length, 'columns');
      } else if (data.records && data.records.length > 0 && data.records[0].fields) {
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
      if (result && result.records && result.records.length > 0) {
        const fields = result.records[0].fields || {};
        for (const id of Object.keys(fields)) {
          columns.push({ id, label: id, type: 'Any' });
        }
        console.log('[grist-api] SQL SELECT * columns:', columns.length);
      }
    } catch (e) {
      console.log('[grist-api] SQL SELECT * failed:', e.message);
    }
  }

  if (columns.length > 0) {
    _structureCache[tableId] = columns;
  }
  console.log('[grist-api] getTableStructure final:', columns.length, 'columns for', tableId);
  return columns;
}

export async function getSelectedTableId() {
  const g = getGrist();
  if (!g) return null;

  console.log('[grist-api] getSelectedTableId: start');

  if (_currentRecord && g.docApi) {
    try {
      const tables = await g.docApi.listTables();
      console.log('[grist-api] Checking', tables.length, 'tables for record id', _currentRecord.id);
      for (const tableId of tables) {
        try {
          const data = await g.docApi.fetchTable(tableId, { limit: 200 });
          if (data.records) {
            const found = data.records.some(r => r.id === _currentRecord.id);
            if (found) {
              console.log('[grist-api] Found record in table:', tableId);
              return tableId;
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      console.log('[grist-api] table matching error:', e.message);
    }
  }

  try {
    if (g.getTable) {
      const table = await g.getTable();
      if (table) {
        if (typeof table === 'string') return table;
        if (table.tableId) return table.tableId;
        if (table._tableId) return table._tableId;
        if (table.id && typeof table.id === 'string') return table.id;
      }
    }
  } catch (e) {}

  try {
    if (g.selectedTable) {
      const st = g.selectedTable;
      if (typeof st === 'string') return st;
      if (st.tableId) return st.tableId;
      if (st._tableId) return st._tableId;
    }
  } catch (e) {}

  try {
    if (g.viewApi && g.viewApi.fetchSelectedTable) {
      const data = await g.viewApi.fetchSelectedTable();
      if (data && data.records && data.records.length > 0 && _currentRecord) {
        const tables = await g.docApi.listTables();
        for (const tableId of tables) {
          try {
            const t = await g.docApi.fetchTable(tableId, { limit: 200 });
            if (t.records && t.records.some(r => r.id === _currentRecord.id)) {
              return tableId;
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  console.log('[grist-api] getSelectedTableId: returning null');
  return null;
}

export async function getSelectedTableColumns() {
  const g = getGrist();
  if (!g) return [];
  try {
    const table = await g.getTable();
    if (table && table.columns) {
      return table.columns.map(col => ({
        id: col.id,
        label: col.label || col.id,
        type: col.type || 'Any',
      }));
    }
  } catch (e) {
    console.error('[grist-api] getSelectedTableColumns error:', e);
  }
  return [];
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

    if (filters && filters.length > 0) {
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

    if (sorts && sorts.length > 0) {
      const orderClauses = sorts
        .filter(s => s.column)
        .map(s => `${escapeSqlIdentifier(s.column)} ${(s.dir || 'asc').toUpperCase()}`);
      if (orderClauses.length > 0) {
        sql += ` ORDER BY ${orderClauses.join(', ')}`;
      }
    }

    if (limit && limit > 0) {
      sql += ` LIMIT ${parseInt(limit, 10)}`;
    }

    const result = await g.docApi.executeSQL({ sql });
    return {
      records: result.records || [],
      fields: result.fields || {},
    };
  } catch (e) {
    console.error('[grist-api] fetchTableData SQL error, fallback to fetchTable:', e.message);
    try {
      const data = await g.docApi.fetchTable(tableId);
      let records = data.records || [];

      if (filters && filters.length > 0) {
        records = records.filter(rec => {
          return filters.every(f => {
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
          });
        });
      }

      if (sorts && sorts.length > 0) {
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

      if (limit && limit > 0) {
        records = records.slice(0, limit);
      }

      let selectedRecords = records;
      if (columns && columns.length > 0) {
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
  _tableCache = {};
  _structureCache = {};
}

export const debouncedFetchTableData = debounce(fetchTableData, 300);
