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
  if (!!getGrist()) return grist;
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
  console.log('[grist-api] grist.selectedTable:', g.selectedTable);

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
    console.log('[grist-api] onRecord received:', record ? 'record present' : 'null', 'mappings:', mappings);
    _currentRecord = record;
    _currentMappings = mappings;

    try {
      const selectedTableId = await getSelectedTableId();
      console.log('[grist-api] onRecord: selectedTableId =', selectedTableId);
    } catch (e) {
      console.error('[grist-api] onRecord getSelectedTableId error:', e);
    }

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
    console.log('[grist-api] getOptions result:', opts, typeof opts);
    if (opts === null || opts === undefined) return {};
    if (typeof opts !== 'object') return {};
    return opts;
  } catch (e) {
    console.error('[grist-api] getOptions error:', e);
    return {};
  }
}

export async function setOption(key, value) {
  if (!getGrist()) return;
  try {
    await getGrist().setOption(key, value);
  } catch (e) {
    console.error('[grist-api] setOption error:', e);
  }
}

export async function listTables() {
  if (!getGrist()) return [];
  try {
    return await getGrist().docApi.listTables();
  } catch (e) {
    console.error('[grist-api] listTables error:', e);
    return [];
  }
}

export async function getTableStructure(tableId) {
  if (!tableId) return [];
  if (_structureCache[tableId]) return _structureCache[tableId];

  const g = getGrist();
  if (!g) return [];

  console.log('[grist-api] getTableStructure for:', tableId);

  try {
    const sql = `SELECT col.id as colId, col.label, col.type, col.parentPos
                 FROM _grist_Tables_column col
                 JOIN _grist_Tables tbl ON col.tableRef = tbl.id
                 WHERE tbl.id = ${escapeSqlValue(tableId)}
                 ORDER BY col.parentPos`;
    console.log('[grist-api] SQL:', sql);
    const result = await g.docApi.executeSQL({ sql });
    console.log('[grist-api] SQL result:', result);
    const columns = result.records
      ? result.records.map(r => ({
          id: r.fields.colId,
          label: r.fields.label,
          type: r.fields.type || 'Any',
          parentPos: r.fields.parentPos,
        }))
      : [];
    console.log('[grist-api] Columns from SQL:', columns.length);
    if (columns.length > 0) {
      _structureCache[tableId] = columns;
      return columns;
    }
  } catch (e) {
    console.error('[grist-api] getTableStructure SQL error:', e.message);
  }

  try {
    console.log('[grist-api] Trying fetchTable fallback for:', tableId);
    const data = await g.docApi.fetchTable(tableId);
    console.log('[grist-api] fetchTable result type:', typeof data);
    console.log('[grist-api] fetchTable result keys:', data ? Object.keys(data) : 'null');

    if (data && data.colInfo) {
      console.log('[grist-api] Found colInfo:', Object.keys(data.colInfo));
      const columns = Object.entries(data.colInfo).map(([id, col]) => ({
        id,
        label: col.label || id,
        type: col.type || 'Any',
      }));
      console.log('[grist-api] Columns from colInfo:', columns.length);
      _structureCache[tableId] = columns;
      return columns;
    }

    if (data && data.fields && Object.keys(data.fields).length > 0) {
      const columns = Object.entries(data.fields).map(([id, field]) => ({
        id,
        label: field.label || id,
        type: field.type || 'Any',
      }));
      console.log('[grist-api] Columns from fields:', columns.length);
      _structureCache[tableId] = columns;
      return columns;
    }

    if (data && data.records && data.records.length > 0) {
      const sample = data.records[0].fields || {};
      const columns = Object.keys(sample).map(id => ({
        id,
        label: id,
        type: 'Any',
      }));
      console.log('[grist-api] Columns from first record:', columns.length);
      _structureCache[tableId] = columns;
      return columns;
    }

    console.log('[grist-api] fetchTable returned no usable data. Full result:', JSON.stringify(data).substring(0, 500));
  } catch (e2) {
    console.error('[grist-api] fetchTable fallback error:', e2.message, e2.stack);
  }

  try {
    console.log('[grist-api] Trying SQL with colInfo...');
    const sqlResult = await g.docApi.executeSQL({
      sql: `SELECT * FROM ${escapeSqlIdentifier(tableId)} LIMIT 1`
    });
    console.log('[grist-api] SQL SELECT * result:', sqlResult);
    if (sqlResult && sqlResult.fields) {
      const columns = Object.entries(sqlResult.fields).map(([id, field]) => ({
        id,
        label: field.label || id,
        type: field.type || 'Any',
      }));
      console.log('[grist-api] Columns from SQL fields:', columns.length);
      _structureCache[tableId] = columns;
      return columns;
    }
    if (sqlResult && sqlResult.records && sqlResult.records.length > 0) {
      const sample = sqlResult.records[0].fields || {};
      const columns = Object.keys(sample).map(id => ({
        id,
        label: id,
        type: 'Any',
      }));
      console.log('[grist-api] Columns from SQL record:', columns.length);
      _structureCache[tableId] = columns;
      return columns;
    }
  } catch (e3) {
    console.error('[grist-api] SQL fallback error:', e3.message);
  }

  try {
    console.log('[grist-api] Trying fetchTable with colInfo option...');
    const data = await g.docApi.fetchTable(tableId, { colInfo: true });
    console.log('[grist-api] fetchTable colInfo result keys:', data ? Object.keys(data) : 'null');
    if (data && data.colInfo) {
      const columns = Object.entries(data.colInfo).map(([id, col]) => ({
        id,
        label: col.label || id,
        type: col.type || 'Any',
      }));
      console.log('[grist-api] Columns from fetchTable colInfo:', columns.length);
      _structureCache[tableId] = columns;
      return columns;
    }
  } catch (e4) {
    console.error('[grist-api] fetchTable colInfo error:', e4.message);
  }

  console.log('[grist-api] All methods failed, returning empty array');
  return [];
}

export async function getSelectedTableId() {
  const g = getGrist();
  if (!g) return null;
  try {
    console.log('[grist-api] getSelectedTableId: checking sources...');

    const extractTableId = (t) => {
      if (!t) return null;
      if (typeof t === 'string') return t;
      if (t.tableId) return t.tableId;
      if (t._tableId) return t._tableId;
      if (t.id && typeof t.id === 'string') return t.id;
      if (t._table && t._table.tableId) return t._table.tableId;
      return null;
    };

    if (_currentRecord) {
      try {
        const tables = await g.docApi.listTables();
        console.log('[grist-api] listTables for matching:', tables);
        for (const tableId of tables || []) {
          try {
            const data = await g.docApi.fetchTable(tableId, { limit: 100 });
            if (data.records) {
              const match = data.records.find(r => r.id === _currentRecord.id);
              if (match) {
                console.log('[grist-api] Found matching record in table:', tableId, 'record id:', _currentRecord.id);
                return tableId;
              }
            }
          } catch (e) {}
        }
      } catch (e) {
        console.log('[grist-api] table matching error:', e.message);
      }
    }

    if (g.selectedTable) {
      console.log('[grist-api] g.selectedTable type:', typeof g.selectedTable);
      console.log('[grist-api] g.selectedTable constructor:', g.selectedTable.constructor?.name);
      const id = extractTableId(g.selectedTable);
      if (id) {
        console.log('[grist-api] Extracted from selectedTable:', id);
        return id;
      }
      console.log('[grist-api] selectedTable keys:', Object.keys(g.selectedTable));
      const proto = Object.getPrototypeOf(g.selectedTable);
      if (proto) {
        console.log('[grist-api] selectedTable proto keys:', Object.getOwnPropertyNames(proto));
      }
      const allProps = [];
      for (const key in g.selectedTable) {
        allProps.push(key);
      }
      console.log('[grist-api] selectedTable all props:', allProps);
    }

    if (g.getTable) {
      try {
        const table = await g.getTable();
        console.log('[grist-api] getTable() type:', typeof table);
        console.log('[grist-api] getTable() constructor:', table?.constructor?.name);
        const id = extractTableId(table);
        if (id) {
          console.log('[grist-api] Extracted from getTable():', id);
          return id;
        }
        if (table) {
          console.log('[grist-api] getTable() keys:', Object.keys(table));
          const proto = Object.getPrototypeOf(table);
          if (proto) {
            console.log('[grist-api] getTable() proto keys:', Object.getOwnPropertyNames(proto));
          }
        }
      } catch (e) {
        console.log('[grist-api] getTable() error:', e.message);
      }
    }

    if (g.raw) {
      console.log('[grist-api] g.raw keys:', Object.keys(g.raw));
      const id = extractTableId(g.raw.selectedTable);
      if (id) {
        console.log('[grist-api] Extracted from raw.selectedTable:', id);
        return id;
      }
    }

    if (g.viewApi) {
      console.log('[grist-api] g.viewApi keys:', Object.keys(g.viewApi));
      if (g.viewApi.getSelectedTable) {
        try {
          const t = await g.viewApi.getSelectedTable();
          const id = extractTableId(t);
          if (id) {
            console.log('[grist-api] Extracted from viewApi:', id);
            return id;
          }
        } catch (e) {
          console.log('[grist-api] viewApi.getSelectedTable error:', e.message);
        }
      }
    }

    if (g.sectionApi) {
      console.log('[grist-api] g.sectionApi keys:', Object.keys(g.sectionApi));
    }

    try {
      const docInfo = await g.docApi.getDocInfo?.();
      console.log('[grist-api] docInfo:', docInfo);
    } catch (e) {}

  } catch (e) {
    console.error('[grist-api] getSelectedTableId error:', e);
  }
  console.log('[grist-api] getSelectedTableId: returning null');
  return null;
}

export async function getSelectedTableColumns() {
  if (!getGrist()) return [];
  try {
    const table = await getGrist().getTable();
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
  if (!getGrist() || !_currentRecord) return null;
  return _currentRecord.fields || _currentRecord;
}

export async function listAllTablesWithStructure() {
  if (!getGrist()) return [];
  try {
    const tableIds = await getGrist().docApi.listTables();
    const result = [];
    for (const tableId of tableIds) {
      const structure = await getTableStructure(tableId);
      result.push({
        id: tableId,
        label: tableId,
        columns: structure,
      });
    }
    return result;
  } catch (e) {
    console.error('[grist-api] listAllTablesWithStructure error:', e);
    return [];
  }
}

export function findLinkedTables(record, tableStructures) {
  const linked = new Set();
  if (!record || !record.fields) return [];
  for (const [tableId, structure] of Object.entries(tableStructures)) {
    for (const col of structure) {
      if (col.type && col.type.startsWith('Ref:') && record.fields[col.id]) {
        linked.add(col.type.substring(4));
      }
      if (col.type && col.type.startsWith('RefList:') && record.fields[col.id]) {
        linked.add(col.type.substring(8));
      }
    }
  }
  return Array.from(linked);
}

export async function fetchTableData(tableId, options = {}) {
  const { columns, filters, sorts, limit } = options;

  if (!getGrist()) return { records: [], fields: {} };

  if (!tableId) return { records: [], fields: {} };

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

    const result = await getGrist().docApi.executeSQL({ sql });
    return {
      records: result.records || [],
      fields: result.fields || {},
    };
  } catch (e) {
    console.error('[grist-api] fetchTableData SQL error, fallback to fetchTable:', e);
    try {
      const data = await getGrist().docApi.fetchTable(tableId);
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

      return { records: selectedRecords, fields: data.fields || {} };
    } catch (e2) {
      console.error('[grist-api] fetchTable fallback error:', e2);
      return { records: [], fields: {} };
    }
  }
}

export async function getSelectedTable() {
  if (!getGrist()) return null;
  try {
    return getGrist().selectedTable;
  } catch (e) {
    return null;
  }
}

export function clearCaches() {
  _tableCache = {};
  _structureCache = {};
}

export const debouncedFetchTableData = debounce(fetchTableData, 300);
