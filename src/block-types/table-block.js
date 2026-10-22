import { createEl, formatNumber, aggregate } from '../utils.js';
import { fetchTableData, fetchLinkedTableData, getTableStructure, getLinkedTableColumns, listTables, getAllTablesWithColumns, getLinkedTableId } from '../grist-api.js';

const AGGREGATION_FUNCS = [
  { value: 'sum', label: 'Somme' },
  { value: 'avg', label: 'Moyenne' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Nombre' },
];

export async function renderTableBlock(block, container, store) {
  container.className = 'dc-block-content dc-table-block';
  container.innerHTML = '';

  const cfg = block.config;

  if (!cfg.columns || cfg.columns.length === 0) {
    container.appendChild(createEl('div', 'dc-block-placeholder', '⚙️ Configurez le tableau : cochez les colonnes à afficher'));
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
  cfg.columns.forEach(col => {
    headerRow.appendChild(createEl('th', 'dc-th', col.label || col.id));
  });
  if (cfg.rowAggregation) {
    const aggLabel = AGGREGATION_FUNCS.find(f => f.value === cfg.rowAggregationFunc)?.label || 'Σ';
    headerRow.appendChild(createEl('th', 'dc-th dc-th-last', aggLabel));
  }
  thead.appendChild(headerRow);

  tableEl.appendChild(thead);
  tableEl.appendChild(tbody);
  if (cfg.footerFunc) {
    tableEl.appendChild(tfoot);
  }

  wrapper.appendChild(tableEl);
  container.appendChild(wrapper);

  async function update() {
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    let currentData;
    try {
      if (cfg.useLinkedTable !== false) {
        currentData = await fetchLinkedTableData({
          columns: cfg.columns.map(c => c.id),
          filters: cfg.filters,
          sorts: cfg.sorts,
        });
      } else if (cfg.sourceTable) {
        currentData = await fetchTableData(cfg.sourceTable, {
          columns: cfg.columns.map(c => c.id),
          filters: cfg.filters,
          sorts: cfg.sorts,
        });
      } else {
        container.innerHTML = '';
        container.appendChild(createEl('div', 'dc-block-error', '⚠️ Aucune table source configurée'));
        return;
      }
    } catch (e) {
      container.innerHTML = '';
      container.appendChild(createEl('div', 'dc-block-error', `Erreur : ${e.message}`));
      return;
    }

    const records = currentData.records;

    for (const rec of records) {
      const row = createEl('tr', 'dc-tr');
      cfg.columns.forEach(col => {
        const val = rec.fields[col.id];
        const cell = createEl('td', 'dc-td');
        cell.textContent = formatCellValue(val);
        row.appendChild(cell);
      });
      if (cfg.rowAggregation) {
        const rowVals = cfg.columns.map(c => rec.fields[c.id]);
        const agg = aggregate(rowVals, cfg.rowAggregationFunc);
        const cell = createEl('td', 'dc-td dc-td-last dc-td-agg', formatNumber(agg));
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }

    if (cfg.footerFunc) {
      const footerRow = createEl('tr', 'dc-tr-footer');

      if (cfg.rowAggregation) {
        footerRow.appendChild(createEl('td', 'dc-td-footer-label', cfg.footerLabel || 'Total'));
        cfg.columns.forEach(col => {
          const values = records.map(r => r.fields[col.id]);
          const agg = aggregate(values, cfg.footerFunc);
          footerRow.appendChild(createEl('td', 'dc-td-footer', formatNumber(agg)));
        });
        const allRowAggs = records.map(rec => {
          const rowVals = cfg.columns.map(c => rec.fields[c.id]);
          return aggregate(rowVals, cfg.rowAggregationFunc);
        });
        const totalAgg = aggregate(allRowAggs, cfg.footerFunc);
        footerRow.appendChild(createEl('td', 'dc-td-footer dc-td-footer-last', formatNumber(totalAgg)));
      } else {
        const firstCol = cfg.columns[0];
        footerRow.appendChild(createEl('td', 'dc-td-footer-label', cfg.footerLabel || 'Total'));
        for (let i = 1; i < cfg.columns.length; i++) {
          const col = cfg.columns[i];
          const values = records.map(r => r.fields[col.id]);
          const agg = aggregate(values, cfg.footerFunc);
          footerRow.appendChild(createEl('td', 'dc-td-footer', formatNumber(agg)));
        }
        if (cfg.columns.length === 1) {
          const values = records.map(r => r.fields[firstCol.id]);
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

  editor.appendChild(createEl('p', 'dc-hint', '📋 Le tableau affiche les données de la table liée à ce widget. Cochez les colonnes à afficher.'));

  const nameLabel = createEl('label', 'dc-label', 'Nom du tableau (titre affiché au-dessus)');
  const nameInput = createEl('input', 'dc-input dc-input-full');
  nameInput.type = 'text';
  nameInput.placeholder = 'Ex: Surfaces par niveau';
  nameInput.value = cfg.tableName || '';
  nameInput.addEventListener('input', () => onChange({ tableName: nameInput.value }));
  editor.appendChild(nameLabel);
  editor.appendChild(nameInput);

  const columnsLabel = createEl('label', 'dc-label', 'Colonnes à afficher');
  editor.appendChild(columnsLabel);

  const columnsContainer = createEl('div', 'dc-columns-selector');
  columnsContainer.appendChild(createEl('p', 'dc-hint', '⏳ Chargement des colonnes...'));
  editor.appendChild(columnsContainer);

  const footerSection = createEl('div', 'dc-footer-section');
  footerSection.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #ddd;';

  const footerEnabledLabel = createEl('label', 'dc-checkbox-label');
  const footerEnabledCb = createEl('input');
  footerEnabledCb.type = 'checkbox';
  footerEnabledCb.checked = !!cfg.footerFunc;
  footerEnabledCb.addEventListener('change', () => {
    onChange({ footerFunc: footerEnabledCb.checked ? (cfg.footerFunc || 'sum') : null });
  });
  footerEnabledLabel.appendChild(footerEnabledCb);
  footerEnabledLabel.appendChild(createEl('span', '', ' Ajouter une ligne de total en bas du tableau'));
  footerSection.appendChild(footerEnabledLabel);

  const footerConfig = createEl('div', 'dc-footer-config');
  footerConfig.style.cssText = 'margin-left:20px;margin-top:8px;';

  const footerLabelInput = createEl('input', 'dc-input dc-input-full');
  footerLabelInput.type = 'text';
  footerLabelInput.placeholder = 'Nom de la ligne (ex: Total)';
  footerLabelInput.value = cfg.footerLabel || 'Total';
  footerLabelInput.addEventListener('input', () => onChange({ footerLabel: footerLabelInput.value }));

  const footerFuncSelect = createEl('select', 'dc-select dc-select-full');
  AGGREGATION_FUNCS.forEach(f => {
    const opt = createEl('option', '', f.label);
    opt.value = f.value;
    footerFuncSelect.appendChild(opt);
  });
  footerFuncSelect.value = cfg.footerFunc || 'sum';
  footerFuncSelect.addEventListener('change', () => onChange({ footerFunc: footerFuncSelect.value }));

  footerConfig.appendChild(createEl('label', 'dc-label', 'Nom de la ligne de total'));
  footerConfig.appendChild(footerLabelInput);
  footerConfig.appendChild(createEl('label', 'dc-label', 'Fonction d\'agrégation'));
  footerConfig.appendChild(footerFuncSelect);
  footerSection.appendChild(footerConfig);

  const rowAggLabel = createEl('label', 'dc-checkbox-label');
  rowAggLabel.style.cssText = 'margin-top:12px;display:flex;align-items:center;gap:6px;';
  const rowAggCb = createEl('input');
  rowAggCb.type = 'checkbox';
  rowAggCb.checked = cfg.rowAggregation || false;
  rowAggCb.addEventListener('change', () => onChange({ rowAggregation: rowAggCb.checked }));
  rowAggLabel.appendChild(rowAggCb);
  rowAggLabel.appendChild(createEl('span', '', ' Ajouter une colonne de droite (agrégation par ligne)'));
  footerSection.appendChild(rowAggLabel);

  const rowAggConfig = createEl('div', 'dc-rowagg-config');
  rowAggConfig.style.cssText = 'margin-left:20px;margin-top:8px;';

  const rowAggFuncSelect = createEl('select', 'dc-select dc-select-full');
  AGGREGATION_FUNCS.forEach(f => {
    const opt = createEl('option', '', f.label);
    opt.value = f.value;
    rowAggFuncSelect.appendChild(opt);
  });
  rowAggFuncSelect.value = cfg.rowAggregationFunc || 'sum';
  rowAggFuncSelect.addEventListener('change', () => onChange({ rowAggregationFunc: rowAggFuncSelect.value }));

  rowAggConfig.appendChild(createEl('label', 'dc-label', 'Fonction pour la colonne de droite'));
  rowAggConfig.appendChild(rowAggFuncSelect);
  footerSection.appendChild(rowAggConfig);

  editor.appendChild(footerSection);

  function updateFooterVisibility() {
    footerConfig.style.display = footerEnabledCb.checked ? 'block' : 'none';
  }
  function updateRowAggVisibility() {
    rowAggConfig.style.display = rowAggCb.checked ? 'block' : 'none';
  }
  footerEnabledCb.addEventListener('change', updateFooterVisibility);
  rowAggCb.addEventListener('change', updateRowAggVisibility);
  updateFooterVisibility();
  updateRowAggVisibility();

  async function loadAndRenderColumns() {
    columnsContainer.innerHTML = '';
    columnsContainer.appendChild(createEl('p', 'dc-hint', '⏳ Chargement des colonnes...'));

    let columns = [];
    let usedTableId = null;

    if (cfg.useLinkedTable !== false) {
      const linkedId = await getLinkedTableId();
      console.log('[table-block] Linked table ID:', linkedId);
      if (linkedId) {
        columns = await getTableStructure(linkedId);
        usedTableId = linkedId;
        console.log('[table-block] Columns from linked table:', columns.length);
      }
    }

    if (columns.length === 0 && cfg.sourceTable) {
      columns = await getTableStructure(cfg.sourceTable);
      usedTableId = cfg.sourceTable;
      console.log('[table-block] Columns from sourceTable:', columns.length);
    }

    if (columns.length === 0) {
      columns = await getLinkedTableColumns();
      console.log('[table-block] Columns from getLinkedTableColumns:', columns.length);
    }

    if (columns.length === 0) {
      const allTables = await getAllTablesWithColumns();
      const tableIds = Object.keys(allTables);
      console.log('[table-block] All tables:', tableIds);

      if (tableIds.length > 0) {
        columnsContainer.innerHTML = '';
        columnsContainer.appendChild(createEl('p', 'dc-hint dc-hint-error',
          '⚠️ Impossible de détecter automatiquement la table liée. Veuillez choisir une table :'));

        const tableSelect = createEl('select', 'dc-select dc-select-full');
        tableSelect.appendChild(createEl('option', '', '— Choisir une table —'));
        tableIds.forEach(tid => {
          const opt = createEl('option', '', tid);
          opt.value = tid;
          tableSelect.appendChild(opt);
        });
        tableSelect.addEventListener('change', async () => {
          if (tableSelect.value) {
            onChange({ sourceTable: tableSelect.value, useLinkedTable: false });
            const cols = allTables[tableSelect.value] || await getTableStructure(tableSelect.value);
            renderColumns(cols);
          }
        });
        columnsContainer.appendChild(tableSelect);
      } else {
        columnsContainer.innerHTML = '';
        columnsContainer.appendChild(createEl('p', 'dc-hint dc-hint-error',
          '⚠️ Aucune table trouvée dans ce document.'));
      }
      return;
    }

    renderColumns(columns);
  }

  function renderColumns(columns) {
    columnsContainer.innerHTML = '';

    if (columns.length === 0) {
      columnsContainer.appendChild(createEl('p', 'dc-hint dc-hint-error', '⚠️ Aucune colonne trouvée.'));
      return;
    }

    const selectedIds = (cfg.columns || []).map(c => c.id);

    columns.forEach(col => {
      const label = createEl('label', 'dc-checkbox-label');
      const cb = createEl('input');
      cb.type = 'checkbox';
      cb.checked = selectedIds.includes(col.id);
      cb.addEventListener('change', () => {
        const current = cfg.columns || [];
        if (cb.checked) {
          onChange({ columns: [...current, { id: col.id, label: col.label || col.id }] });
        } else {
          onChange({ columns: current.filter(c => c.id !== col.id) });
        }
      });
      label.appendChild(cb);
      label.appendChild(createEl('span', '', ` ${col.label || col.id} (${col.type})`));
      columnsContainer.appendChild(label);
    });
  }

  await loadAndRenderColumns();

  return editor;
}
