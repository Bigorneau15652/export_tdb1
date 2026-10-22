import { debounce, escapeSqlValue, escapeSqlIdentifier } from './utils.js';

let _currentRecord = null;
let _currentMappings = null;
let _tableCache = {};
let _structureCache = {};
let _isReady = false;
let _recordCallback = null;
let _optionsCallback = null;

export async function initGrist() {
  if (typeof grist === 'undefined') {
    console.warn('[grist-api] Running outside Grist context (dev mode)');
    return false;
  }

  await grist.ready({
    requiredAccess: 'full',
    allowSelectBy: true,
  });

  _isReady = true;
  console.log('[grist-api] Grist widget ready');

  grist.onRecord((record, mappings) => {
    _currentRecord = record;
    _currentMappings = mappings;
    if (_recordCallback) _recordCallback(record, mappings);
  });

  grist.onOptions((options) => {
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
  if (typeof grist === 'undefined') return {};
  try {
    return await grist.getOptions();
  } catch (e) {
    console.error('[grist-api] getOptions error:', e);
    return {};
  }
}

export async function setOption(key, value) {
  if (typeof grist === 'undefined') return;
  try {
    await grist.setOption(key, value);
  } catch (e) {
    console.error('[grist-api] setOption error:', e);
  }
}

export async function listTables() {
  if (typeof grist === 'undefined') return [];
  try {
    return await grist.docApi.listTables();
  } catch (e) {
    console.error('[grist-api] listTables error:', e);
    return [];
  }
}

export async function getTableStructure(tableId) {
  if (!tableId) return [];
  if (_structureCache[tableId]) return _structureCache[tableId];

  if (typeof grist === 'undefined') return [];

  try {
    const sql = `SELECT col.id as colId, col.label, col.type, col.parentPos
                 FROM _grist_Tables_column col
                 JOIN _grist_Tables tbl ON col.tableRef = tbl.id
                 WHERE tbl.id = ${escapeSqlValue(tableId)}
                 ORDER BY col.parentPos`;
    const result = await grist.docApi.executeSQL({ sql });
    const columns = result.records
      ? result.records.map(r => ({
          id: r.fields.colId,
          label: r.fields.label,
          type: r.fields.type || 'Any',
          parentPos: r.fields.parentPos,
        }))
      : [];
    _structureCache[tableId] = columns;
    return columns;
  } catch (e) {
    console.error('[grist-api] getTableStructure SQL error, fallback to fetchTable:', e);
    try {
      const data = await grist.docApi.fetchTable(tableId);
      if (data.fields) {
        const columns = Object.entries(data.fields).map(([id, field]) => ({
          id,
          label: field.label || id,
          type: field.type || 'Any',
        }));
        _structureCache[tableId] = columns;
        return columns;
      }
      const sample = data.records?.[0]?.fields || {};
      const columns = Object.keys(sample).map(id => ({
        id,
        label: id,
        type: 'Any',
      }));
      _structureCache[tableId] = columns;
      return columns;
    } catch (e2) {
      console.error('[grist-api] fallback getTableStructure error:', e2);
      return [];
    }
  }
}

export async function getSelectedTableId() {
  if (typeof grist === 'undefined') return null;
  try {
    if (grist.selectedTable) return grist.selectedTable;
    if (grist.viewApi && grist.viewApi.getSelectedTable) {
      return await grist.viewApi.getSelectedTable();
    }
    if (grist.raw && grist.raw.selectedTable) return grist.raw.selectedTable;
    if (grist.sectionApi && grist.sectionApi.getSelectedTable) {
      return await grist.sectionApi.getSelectedTable();
    }
  } catch (e) {
    console.error('[grist-api] getSelectedTableId error:', e);
  }
  return null;
}

export async function getSelectedTableColumns() {
  if (typeof grist === 'undefined') return [];
  try {
    const table = await grist.getTable();
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
  if (typeof grist === 'undefined' || !_currentRecord) return null;
  return _currentRecord.fields || _currentRecord;
}

export async function listAllTablesWithStructure() {
  if (typeof grist === 'undefined') return [];
  try {
    const tableIds = await grist.docApi.listTables();
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

  if (typeof grist === 'undefined') return { records: [], fields: {} };

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

    const result = await grist.docApi.executeSQL({ sql });
    return {
      records: result.records || [],
      fields: result.fields || {},
    };
  } catch (e) {
    console.error('[grist-api] fetchTableData SQL error, fallback to fetchTable:', e);
    try {
      const data = await grist.docApi.fetchTable(tableId);
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
  if (typeof grist === 'undefined') return null;
  try {
    return grist.selectedTable;
  } catch (e) {
    return null;
  }
}

export function clearCaches() {
  _tableCache = {};
  _structureCache = {};
}

export const debouncedFetchTableData = debounce(fetchTableData, 300);
