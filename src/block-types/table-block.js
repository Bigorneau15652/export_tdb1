import { createEl, formatNumber, aggregate } from '../utils.js';
import { fetchTableData, getTableStructure, listTables } from '../grist-api.js';

const AGGREGATION_FUNCS = [
  { value: 'sum', label: 'Somme' },
  { value: 'avg', label: 'Moyenne' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Nombre' },
];

const FILTER_OPS = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contient' },
  { value: 'startswith', label: 'commence par' },
  { value: 'endswith', label: 'finit par' },
  { value: 'isempty', label: 'est vide' },
  { value: 'isnotempty', label: 'n\'est pas vide' },
];

export async function renderTableBlock(block, container, store) {
  container.className = 'dc-block-content dc-table-block';
  container.innerHTML = '';

  const cfg = block.config;

  if (!cfg.sourceTable || !cfg.columns || cfg.columns.length === 0) {
    container.appendChild(createEl('div', 'dc-block-placeholder', '⚙️ Configurez le tableau : choisissez une table et des colonnes'));
    return { update: async () => {}, destroy() {} };
  }

  const wrapper = createEl('div', 'dc-table-wrapper');

  if (cfg.tableName) {
    wrapper.appendChild(createEl('div', 'dc-table-name', cfg.tableName));
  }

  const tableEl = createEl('table', 'dc-data-table');
  const thead = createEl('thead');
  const tbody = createEl('tbody');
  const tfoot = createEl('tfoot');

  const headerRow = createEl('tr');
  if (cfg.rowAggregation) {
    headerRow.appendChild(createEl('th', 'dc-th dc-th-first', ''));
  }
  cfg.columns.forEach(col => {
    headerRow.appendChild(createEl('th', 'dc-th', col));
  });
  if (cfg.rowAggregation) {
    const aggLabel = AGGREGATION_FUNCS.find(f => f.value === cfg.rowAggregationFunc)?.label || 'Σ';
    headerRow.appendChild(createEl('th', 'dc-th dc-th-last', aggLabel));
  }
  thead.appendChild(headerRow);

  tableEl.appendChild(thead);
  tableEl.appendChild(tbody);

  wrapper.appendChild(tableEl);
  container.appendChild(wrapper);

  let currentData = { records: [], fields: {} };

  async function update() {
    tbody.innerHTML = '';
    tfoot.innerHTML = '';
    tableEl.appendChild(tfoot);

    try {
      currentData = await fetchTableData(cfg.sourceTable, {
        columns: cfg.columns,
        filters: cfg.filters,
        sorts: cfg.sorts,
      });
    } catch (e) {
      container.innerHTML = '';
      container.appendChild(createEl('div', 'dc-block-error', `Erreur : ${e.message}`));
      return;
    }

    const records = currentData.records;

    for (const rec of records) {
      const row = createEl('tr', 'dc-tr');
      if (cfg.rowAggregation) {
        row.appendChild(createEl('td', 'dc-td dc-td-first', ''));
      }
      cfg.columns.forEach(col => {
        const val = rec.fields[col];
        const cell = createEl('td', 'dc-td');
        cell.textContent = formatCellValue(val);
        row.appendChild(cell);
      });
      if (cfg.rowAggregation) {
        const rowVals = cfg.columns.map(c => rec.fields[c]);
        const agg = aggregate(rowVals, cfg.rowAggregationFunc);
        const cell = createEl('td', 'dc-td dc-td-last dc-td-agg', formatNumber(agg));
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }

    if (cfg.footerFunc) {
      const footerRow = createEl('tr', 'dc-tr-footer');
      const labelCell = createEl('td', 'dc-td-footer-label', cfg.footerLabel || 'Total');
      labelCell.setAttribute('colspan', cfg.rowAggregation ? '1' : '1');
      footerRow.appendChild(labelCell);

      let colIdx = 0;
      cfg.columns.forEach((col, i) => {
        if (i === 0 && !cfg.rowAggregation) {
          return;
        }
        const values = records.map(r => r.fields[col]);
        const agg = aggregate(values, cfg.footerFunc);
        const cell = createEl('td', 'dc-td-footer', formatNumber(agg));
        footerRow.appendChild(cell);
        colIdx++;
      });

      if (cfg.rowAggregation) {
        const allRowAggs = records.map(rec => {
          const rowVals = cfg.columns.map(c => rec.fields[c]);
          return aggregate(rowVals, cfg.rowAggregationFunc);
        });
        const totalAgg = aggregate(allRowAggs, cfg.footerFunc);
        footerRow.appendChild(createEl('td', 'dc-td-footer', formatNumber(totalAgg)));
      } else if (cfg.columns.length > 1) {
        for (let i = 1; i < cfg.columns.length; i++) {
          const col = cfg.columns[i];
          const values = records.map(r => r.fields[col]);
          const agg = aggregate(values, cfg.footerFunc);
          footerRow.appendChild(createEl('td', 'dc-td-footer', formatNumber(agg)));
        }
      }

      tfoot.appendChild(footerRow);
    }
  }

  await update();

  return {
    update,
    destroy() {},
  };
}

function formatCellValue(val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') return formatNumber(val);
  if (typeof val === 'boolean') return val ? 'Oui' : 'Non';
  if (Array.isArray(val)) {
    if (val[0] === 'd') {
      return new Date(val[1] * 1000).toLocaleDateString('fr-FR');
    }
    if (val[0] === 'L') return val.slice(1).join(', ');
    return val.join(', ');
  }
  return String(val);
}

export async function createTableEditor(block, onChange, store) {
  const editor = createEl('div', 'dc-block-editor dc-table-editor');
  const cfg = block.config;

  const tables = await listTables();
  const tableSelect = createEl('select', 'dc-select dc-select-full');
  tableSelect.appendChild(createEl('option', '', '— Choisir une table —'));
  tables.forEach(t => {
    const opt = createEl('option', '', t);
    opt.value = t;
    tableSelect.appendChild(opt);
  });
  tableSelect.value = cfg.sourceTable || '';

  const nameInput = createEl('input', 'dc-input dc-input-full');
  nameInput.type = 'text';
  nameInput.placeholder = 'Nom du tableau (affiché au-dessus)';
  nameInput.value = cfg.tableName || '';
  nameInput.addEventListener('input', () => onChange({ tableName: nameInput.value }));

  const columnsContainer = createEl('div', 'dc-columns-selector');
  let availableColumns = [];

  async function loadColumns(tableId) {
    if (!tableId) {
      availableColumns = [];
      renderColumnCheckboxes();
      return;
    }
    availableColumns = await getTableStructure(tableId);
    renderColumnCheckboxes();
  }

  function renderColumnCheckboxes() {
    columnsContainer.innerHTML = '';
    if (availableColumns.length === 0) {
      columnsContainer.appendChild(createEl('p', 'dc-hint', 'Choisissez d\'abord une table'));
      return;
    }
    availableColumns.forEach(col => {
      const label = createEl('label', 'dc-checkbox-label');
      const cb = createEl('input');
      cb.type = 'checkbox';
      cb.checked = (cfg.columns || []).includes(col.id);
      cb.addEventListener('change', () => {
        const current = cfg.columns || [];
        if (cb.checked) {
          onChange({ columns: [...current, col.id] });
        } else {
          onChange({ columns: current.filter(c => c !== col.id) });
        }
      });
      label.appendChild(cb);
      label.appendChild(createEl('span', '', ` ${col.label || col.id} (${col.type})`));
      columnsContainer.appendChild(label);
    });
  }

  tableSelect.addEventListener('change', () => {
    onChange({ sourceTable: tableSelect.value, columns: [] });
    loadColumns(tableSelect.value);
  });

  if (cfg.sourceTable) {
    await loadColumns(cfg.sourceTable);
  } else {
    renderColumnCheckboxes();
  }

  const footerLabel = createEl('label', 'dc-label', 'Nom de la ligne de pied');
  const footerLabelInput = createEl('input', 'dc-input dc-input-full');
  footerLabelInput.type = 'text';
  footerLabelInput.value = cfg.footerLabel || 'Total';
  footerLabelInput.addEventListener('input', () => onChange({ footerLabel: footerLabelInput.value }));

  const footerFuncLabel = createEl('label', 'dc-label', 'Fonction d\'agrégation (ligne de pied)');
  const footerFuncSelect = createEl('select', 'dc-select dc-select-full');
  AGGREGATION_FUNCS.forEach(f => {
    const opt = createEl('option', '', f.label);
    opt.value = f.value;
    footerFuncSelect.appendChild(opt);
  });
  footerFuncSelect.value = cfg.footerFunc || 'sum';
  footerFuncSelect.addEventListener('change', () => onChange({ footerFunc: footerFuncSelect.value }));

  const rowAggLabel = createEl('label', 'dc-checkbox-label');
  const rowAggCb = createEl('input');
  rowAggCb.type = 'checkbox';
  rowAggCb.checked = cfg.rowAggregation || false;
  rowAggCb.addEventListener('change', () => onChange({ rowAggregation: rowAggCb.checked }));
  rowAggLabel.appendChild(rowAggCb);
  rowAggLabel.appendChild(createEl('span', '', ' Colonne de droite (agrégation par ligne)'));

  const rowAggFuncSelect = createEl('select', 'dc-select dc-select-full');
  AGGREGATION_FUNCS.forEach(f => {
    const opt = createEl('option', '', f.label);
    opt.value = f.value;
    rowAggFuncSelect.appendChild(opt);
  });
  rowAggFuncSelect.value = cfg.rowAggregationFunc || 'sum';
  rowAggFuncSelect.addEventListener('change', () => onChange({ rowAggregationFunc: rowAggFuncSelect.value }));

  editor.appendChild(createEl('label', 'dc-label', 'Table source'));
  editor.appendChild(tableSelect);
  editor.appendChild(createEl('label', 'dc-label', 'Nom du tableau'));
  editor.appendChild(nameInput);
  editor.appendChild(createEl('label', 'dc-label', 'Colonnes à afficher'));
  editor.appendChild(columnsContainer);
  editor.appendChild(createEl('label', 'dc-label', 'Ligne de pied'));
  editor.appendChild(footerLabel);
  editor.appendChild(footerLabelInput);
  editor.appendChild(footerFuncLabel);
  editor.appendChild(footerFuncSelect);
  editor.appendChild(rowAggLabel);
  editor.appendChild(rowAggFuncSelect);

  return editor;
}
