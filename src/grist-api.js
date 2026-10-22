import { debounce, escapeSqlValue, escapeSqlIdentifier } from './utils.js';

let _currentRecord = null;
let _currentMappings = null;
let _structureCache = {};
let _linkedColumnsCache = null;
let _linkedTableIdCache = null;
let _allTablesColumnsCache = null;
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
    try {
      await g.ready();
    } catch (e2) {
      console.error('[grist-api] grist.ready() fallback error:', e2);
    }
  }

  _isReady = true;
  console.log('[grist-api] Grist widget ready');

  g.onRecord(async (record, mappings) => {
    console.log('[grist-api] onRecord:', record ? `id=${record.id}` : 'null', 'mappings:', mappings ? Object.keys(mappings).length : 0);
    _currentRecord = record;
    _currentMappings = mappings;
    _linkedColumnsCache = null;
    _linkedTableIdCache = null;
    _allTablesColumnsCache = null;
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
    const tables = await g.docApi.listTables();
    return tables || [];
  } catch (e) {
    console.error('[grist-api] listTables error:', e);
    try {
      const result = await g.docApi.executeSQL({
        sql: 'SELECT id FROM _grist_Tables ORDER BY id'
      });
      return (result.records || []).map(r => r.fields.id);
    } catch (e2) {
      return [];
    }
  }
}

export async function getLinkedTableId() {
  if (_linkedTableIdCache) return _linkedTableIdCache;

  const g = getGrist();
  if (!g) return null;

  console.log('[grist-api] === getLinkedTableId: start ===');

  if (typeof g.getTable === 'function') {
    try {
      const table = g.getTable();
      console.log('[grist-api] getTable() result type:', typeof table);
      console.log('[grist-api] getTable() constructor:', table?.constructor?.name);
      console.log('[grist-api] getTable() own keys:', table ? Object.keys(table) : 'null');

      if (typeof table === 'string') {
        _linkedTableIdCache = table;
        console.log('[grist-api] Found via getTable() string:', table);
        return table;
      }

      if (table && typeof table === 'object') {
        const proto = Object.getPrototypeOf(table);
        const protoKeys = proto ? Object.getOwnPropertyNames(proto) : [];
        console.log('[grist-api] getTable() proto keys:', protoKeys.join(', '));

        for (const key of ['tableId', '_tableId', 'id', 'tableName', 'name']) {
          if (table[key] !== undefined && table[key] !== null) {
            console.log(`[grist-api] getTable().${key} =`, table[key], typeof table[key]);
            if (typeof table[key] === 'string' && table[key].length > 0) {
              _linkedTableIdCache = table[key];
              return table[key];
            }
          }
        }

        for (const key of Object.keys(table)) {
          const val = table[key];
          console.log(`[grist-api] getTable().${key}:`, typeof val, val?.constructor?.name || String(val).slice(0, 50));
        }

        if (typeof table.fetch === 'function') {
          console.log('[grist-api] table.fetch is a function, trying...');
          try {
            const data = await table.fetch();
            console.log('[grist-api] table.fetch() result keys:', data ? Object.keys(data) : 'null');
            if (data) {
              if (data.tableId) {
                _linkedTableIdCache = data.tableId;
                console.log('[grist-api] Found tableId via fetch():', data.tableId);
                return data.tableId;
              }
              console.log('[grist-api] table.fetch() colInfo keys:', data.colInfo ? Object.keys(data.colInfo).length : 'none');
              console.log('[grist-api] table.fetch() records:', data.records?.length || 0);
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
    console.log('[grist-api] g.getTable is NOT a function');
  }

  if (g.selectedTable) {
    try {
      const st = g.selectedTable;
      console.log('[grist-api] selectedTable type:', typeof st, st?.constructor?.name);
      if (typeof st === 'string') {
        _linkedTableIdCache = st;
        return st;
      }
      if (st && typeof st === 'object') {
        const proto = Object.getPrototypeOf(st);
        console.log('[grist-api] selectedTable proto keys:', proto ? Object.getOwnPropertyNames(proto).join(', ') : 'none');
        console.log('[grist-api] selectedTable own keys:', Object.keys(st));
        for (const key of ['tableId', '_tableId', 'id']) {
          if (st[key] && typeof st[key] === 'string') {
            _linkedTableIdCache = st[key];
            console.log(`[grist-api] Found via selectedTable.${key}:`, st[key]);
            return st[key];
          }
        }
      }
    } catch (e) {
      console.log('[grist-api] selectedTable error:', e.message);
    }
  }

  console.log('[grist-api] Trying record-based table detection...');
  try {
    let record = _currentRecord;
    if (!record && typeof g.fetchSelectedRecord === 'function') {
      record = await g.fetchSelectedRecord();
    }
    console.log('[grist-api] current record:', record ? `id=${record.id}` : 'null');

    if (record && record.id && g.docApi) {
      const tables = await listTables();
      const userTables = tables.filter(t => !t.startsWith('_grist_'));
      console.log('[grist-api] Searching in', userTables.length, 'user tables');

      const checkPromises = userTables.map(async (tableId) => {
        try {
          const result = await g.docApi.executeSQL({
            sql: `SELECT id FROM ${escapeSqlIdentifier(tableId)} WHERE id = ${record.id} LIMIT 1`
          });
          if (result && result.records && result.records.length > 0) {
            return tableId;
          }
        } catch (e) {}
        return null;
      });

      const results = await Promise.all(checkPromises);
      const found = results.find(r => r !== null);
      if (found) {
        console.log('[grist-api] Found table via record matching:', found);
        _linkedTableIdCache = found;
        return found;
      }
    }
  } catch (e) {
    console.log('[grist-api] Record matching error:', e.message);
  }

  console.log('[grist-api] === getLinkedTableId: returning null ===');
  return null;
}

export async function getLinkedTableColumns() {
  if (_linkedColumnsCache) return _linkedColumnsCache;

  const g = getGrist();
  if (!g) return [];

  console.log('[grist-api] === getLinkedTableColumns: start ===');

  const tableId = await getLinkedTableId();
  console.log('[grist-api] Linked table ID:', tableId);

  if (tableId) {
    const cols = await getTableStructure(tableId);
    if (cols.length > 0) {
      console.log('[grist-api] getLinkedTableColumns via getTableStructure:', cols.length);
      _linkedColumnsCache = cols;
      return cols;
    }
  }

  if (typeof g.getTable === 'function') {
    try {
      const table = g.getTable();
      if (table && typeof table.fetch === 'function') {
        const data = await table.fetch();
        if (data) {
          if (data.colInfo && typeof data.colInfo === 'object') {
            const cols = Object.entries(data.colInfo).map(([id, col]) => ({
              id,
              label: col.label || id,
              type: col.type || 'Any',
            }));
            if (cols.length > 0) {
              console.log('[grist-api] getLinkedTableColumns via table.fetch() colInfo:', cols.length);
              _linkedColumnsCache = cols;
              return cols;
            }
          }
          if (data.records && data.records.length > 0 && data.records[0].fields) {
            const cols = Object.keys(data.records[0].fields).map(id => ({
              id, label: id, type: 'Any'
            }));
            console.log('[grist-api] getLinkedTableColumns via table.fetch() records:', cols.length);
            _linkedColumnsCache = cols;
            return cols;
          }
        }
      }
    } catch (e) {
      console.log('[grist-api] getLinkedTableColumns table.fetch() error:', e.message);
    }
  }

  if (tableId && g.docApi) {
    try {
      const data = await g.docApi.fetchTable(tableId);
      if (data) {
        const colInfo = data.colInfo || data.fields;
        if (colInfo && typeof colInfo === 'object') {
          const cols = Object.entries(colInfo).map(([id, col]) => ({
            id,
            label: col.label || id,
            type: col.type || 'Any',
          }));
          if (cols.length > 0) {
            console.log('[grist-api] getLinkedTableColumns via fetchTable colInfo:', cols.length);
            _linkedColumnsCache = cols;
            return cols;
          }
        }
        if (data.records && data.records.length > 0 && data.records[0].fields) {
          const cols = Object.keys(data.records[0].fields).map(id => ({
            id, label: id, type: 'Any'
          }));
          console.log('[grist-api] getLinkedTableColumns via fetchTable records:', cols.length);
          _linkedColumnsCache = cols;
          return cols;
        }
      }
    } catch (e) {
      console.log('[grist-api] getLinkedTableColumns fetchTable error:', e.message);
    }
  }

  console.log('[grist-api] === getLinkedTableColumns: returning empty ===');
  return [];
}

export async function fetchLinkedTableData(options = {}) {
  const { columns, filters, sorts, limit } = options;
  const g = getGrist();
  if (!g) return { records: [], fields: {} };

  const tableId = await getLinkedTableId();
  console.log('[grist-api] fetchLinkedTableData for table:', tableId);

  if (tableId) {
    return fetchTableData(tableId, options);
  }

  if (typeof g.getTable === 'function') {
    try {
      const table = g.getTable();
      if (table && typeof table.fetch === 'function') {
        let data = await table.fetch();
        if (data && data.records) {
          let records = data.records;

          if (columns && columns.length > 0) {
            records = records.map(rec => ({
              ...rec,
              fields: Object.fromEntries(
                Object.entries(rec.fields || {}).filter(([k]) => columns.includes(k))
              ),
            }));
          }

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

          return {
            records,
            fields: data.colInfo || data.fields || {},
          };
        }
      }
    } catch (e) {
      console.log('[grist-api] fetchLinkedTableData table.fetch() error:', e.message);
    }
  }

  return { records: [], fields: {} };
}

export async function getAllTablesWithColumns() {
  if (_allTablesColumnsCache) return _allTablesColumnsCache;

  const g = getGrist();
  if (!g || !g.docApi) return {};

  console.log('[grist-api] getAllTablesWithColumns: start');

  const result = {};

  try {
    const sql = `
      SELECT t.id as table_id, c.id as col_id, c.label as col_label, c.type as col_type, c.parentPos
      FROM _grist_Tables t
      LEFT JOIN _grist_Tables_column c ON c.tableRef = t.id
      WHERE t.id NOT LIKE '_grist_%'
      ORDER BY t.id, c.parentPos
    `;
    const res = await g.docApi.executeSQL({ sql });
    if (res && res.records) {
      for (const r of res.records) {
        const tid = r.fields.table_id;
        if (!result[tid]) result[tid] = [];
        if (r.fields.col_id) {
          result[tid].push({
            id: r.fields.col_id,
            label: r.fields.col_label || r.fields.col_id,
            type: r.fields.col_type || 'Any',
          });
        }
      }
      console.log('[grist-api] getAllTablesWithColumns SQL:', Object.keys(result).length, 'tables with', 
        Object.values(result).reduce((a, b) => a + b.length, 0), 'total columns');
    }
  } catch (e) {
    console.log('[grist-api] getAllTablesWithColumns SQL failed:', e.message);
  }

  if (Object.keys(result).length === 0) {
    const tables = await listTables();
    for (const tableId of tables) {
      if (tableId.startsWith('_grist_')) continue;
      try {
        const cols = await getTableStructure(tableId);
        if (cols.length > 0) result[tableId] = cols;
      } catch (e) {}
    }
  }

  _allTablesColumnsCache = result;
  return result;
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
  _structureCache = {};
  _linkedColumnsCache = null;
  _linkedTableIdCache = null;
  _allTablesColumnsCache = null;
}

export const debouncedFetchTableData = debounce(fetchTableData, 300);
