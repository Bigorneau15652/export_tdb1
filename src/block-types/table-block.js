import { createEl, formatNumber, aggregate } from '../utils.js';
import { fetchTableData, fetchLinkedTableData, getTableStructure, listTables, getLinkedTableId, getCurrentRecord } from '../grist-api.js';

const AGGREGATION_FUNCS = [
  { value: 'sum', label: 'Somme' },
  { value: 'avg', label: 'Moyenne' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Nombre' },
];

const FILTER_OPS = [
  { value: 'eq', label: 'égal à' },
  { value: 'neq', label: 'différent de' },
  { value: 'gt', label: 'supérieur à' },
  { value: 'gte', label: 'supérieur ou égal' },
  { value: 'lt', label: 'inférieur à' },
  { value: 'lte', label: 'inférieur ou égal' },
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
    container.appendChild(createEl('div', 'dc-block-placeholder', '⚙️ Configurez le tableau : choisissez une table et cochez les colonnes'));
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
      if (cfg.useLinkedTable !== false && !cfg.sourceTable) {
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
        container.appendChild(createEl('div', 'dc-block-error', '⚠️ Choisissez une table source dans les paramètres'));
        return;
      }
    } catch (e) {
      container.innerHTML = '';
      container.appendChild(createEl('div', 'dc-block-error', `Erreur : ${e.message}`));
      return;
    }

    let records = currentData.records;

    if (cfg.dynamicFilter && cfg.dynamicFilterColumn && store.currentRecord) {
      const currentRec = store.currentRecord;
      const currentVal = currentRec.fields?.[cfg.dynamicFilterColumn] || currentRec[cfg.dynamicFilterColumn];
      if (currentVal !== undefined && currentVal !== null) {
        const beforeCount = records.length;
        records = records.filter(r => {
          const val = r.fields[cfg.dynamicFilterColumn];
          if (Array.isArray(val)) {
            return val.some(v => String(v) === String(currentVal));
          }
          return String(val) === String(currentVal);
        });
        console.log(`[table-block] Dynamic filter on ${cfg.dynamicFilterColumn}=${currentVal}: ${beforeCount} → ${records.length} records`);
      }
    }

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
        footerRow.appendChild(createEl('td', 'dc-td-footer-label', cfg.footerLabel || 'Total'));
        for (let i = 1; i < cfg.columns.length; i++) {
          const col = cfg.columns[i];
          const values = records.map(r => r.fields[col.id]);
          const agg = aggregate(values, cfg.footerFunc);
          footerRow.appendChild(createEl('td', 'dc-td-footer', formatNumber(agg)));
        }
        if (cfg.columns.length === 1) {
          const values = records.map(r => r.fields[cfg.columns[0].id]);
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

  const nameLabel = createEl('label', 'dc-label', 'Nom du tableau (titre affiché au-dessus)');
  const nameInput = createEl('input', 'dc-input dc-input-full');
  nameInput.type = 'text';
  nameInput.placeholder = 'Ex: Surfaces par étage';
  nameInput.value = cfg.tableName || '';
  nameInput.addEventListener('input', () => onChange({ tableName: nameInput.value }));
  editor.appendChild(nameLabel);
  editor.appendChild(nameInput);

  const tableLabel = createEl('label', 'dc-label', 'Table source');
  const tableSelect = createEl('select', 'dc-select dc-select-full');
  editor.appendChild(tableLabel);
  editor.appendChild(tableSelect);

  const columnsLabel = createEl('label', 'dc-label', 'Colonnes à afficher');
  editor.appendChild(columnsLabel);

  const columnsContainer = createEl('div', 'dc-columns-selector');
  editor.appendChild(columnsContainer);

  const dynamicSection = createEl('div', 'dc-dynamic-section');
  dynamicSection.style.cssText = 'margin-top:16px;padding:12px;border:1px solid #c3dafe;background:#ebf5ff;border-radius:6px;';

  const dynamicTitle = createEl('div', 'dc-section-title', '🔗 Liaison dynamique avec la ligne Grist active');
  dynamicTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;color:#2b6cb0;';
  dynamicSection.appendChild(dynamicTitle);

  const dynamicHint = createEl('p', 'dc-hint', 'Le tableau ne montrera que les lignes liées au bâtiment/site sélectionné dans Grist.');
  dynamicHint.style.cssText = 'font-size:12px;color:#4a5568;margin-bottom:8px;';
  dynamicSection.appendChild(dynamicHint);

  const currentRecord = getCurrentRecord();
  if (currentRecord) {
    const recordInfo = createEl('p', 'dc-hint', `📍 Ligne active : ID ${currentRecord.id}`);
    recordInfo.style.cssText = 'font-size:12px;color:#2b6cb0;background:#bee3f8;padding:4px 8px;border-radius:4px;margin-bottom:8px;';
    dynamicSection.appendChild(recordInfo);
  }

  const dynamicEnabledLabel = createEl('label', 'dc-checkbox-label');
  const dynamicEnabledCb = createEl('input');
  dynamicEnabledCb.type = 'checkbox';
  dynamicEnabledCb.checked = cfg.dynamicFilter || false;
  dynamicEnabledCb.addEventListener('change', () => {
    onChange({ dynamicFilter: dynamicEnabledCb.checked });
    updateDynamicVisibility();
  });
  dynamicEnabledLabel.appendChild(dynamicEnabledCb);
  dynamicEnabledLabel.appendChild(createEl('span', '', ' Activer le filtre dynamique (lié à la ligne active)'));
  dynamicSection.appendChild(dynamicEnabledLabel);

  const dynamicConfig = createEl('div', 'dc-dynamic-config');
  dynamicConfig.style.cssText = 'margin-left:20px;margin-top:8px;';

  const dynamicColLabel = createEl('label', 'dc-label', 'Colonne de liaison (ex: Batiment, Site...)');
  const dynamicColSelect = createEl('select', 'dc-select dc-select-full');
  dynamicColSelect.appendChild(createEl('option', '', '— Choisir la colonne de liaison —'));
  dynamicColSelect.addEventListener('change', () => {
    onChange({ dynamicFilterColumn: dynamicColSelect.value || null });
  });

  dynamicConfig.appendChild(dynamicColLabel);
  dynamicConfig.appendChild(dynamicColSelect);
  dynamicSection.appendChild(dynamicConfig);

  function updateDynamicVisibility() {
    dynamicConfig.style.display = dynamicEnabledCb.checked ? 'block' : 'none';
  }
  updateDynamicVisibility();

  editor.appendChild(dynamicSection);

  const filterSection = createEl('div', 'dc-filter-section');
  filterSection.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #ddd;';

  const filterTitle = createEl('div', 'dc-section-title', '🔍 Filtres (optionnels)');
  filterTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;';
  filterSection.appendChild(filterTitle);

  const filtersContainer = createEl('div', 'dc-filters-container');
  filterSection.appendChild(filtersContainer);

  const addFilterBtn = createEl('button', 'dc-btn dc-btn-small', '+ Ajouter un filtre');
  addFilterBtn.style.cssText = 'margin-top:8px;padding:4px 12px;font-size:12px;';
  filterSection.appendChild(addFilterBtn);

  function renderFilters() {
    filtersContainer.innerHTML = '';
    const filters = cfg.filters || [];
    if (filters.length === 0) {
      filtersContainer.appendChild(createEl('p', 'dc-hint', 'Aucun filtre. Toutes les lignes seront affichées.'));
      return;
    }
    filters.forEach((filter, idx) => {
      const row = createEl('div', 'dc-filter-row');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;';

      const colSel = createEl('select', 'dc-select');
      colSel.appendChild(createEl('option', '', '— Colonne —'));
      availableColumns.forEach(col => {
        const opt = createEl('option', '', col.label || col.id);
        opt.value = col.id;
        colSel.appendChild(opt);
      });
      colSel.value = filter.column || '';
      colSel.addEventListener('change', () => {
        const newFilters = [...(cfg.filters || [])];
        newFilters[idx] = { ...newFilters[idx], column: colSel.value || null };
        onChange({ filters: newFilters });
      });

      const opSel = createEl('select', 'dc-select');
      FILTER_OPS.forEach(op => {
        const opt = createEl('option', '', op.label);
        opt.value = op.value;
        opSel.appendChild(opt);
      });
      opSel.value = filter.op || 'eq';
      opSel.addEventListener('change', () => {
        const newFilters = [...(cfg.filters || [])];
        newFilters[idx] = { ...newFilters[idx], op: opSel.value };
        onChange({ filters: newFilters });
      });

      const valInput = createEl('input', 'dc-input');
      valInput.type = 'text';
      valInput.placeholder = 'Valeur';
      valInput.value = filter.value || '';
      valInput.style.cssText = 'width:120px;';
      const isEmptyOp = ['isempty', 'isnotempty'].includes(filter.op);
      valInput.style.display = isEmptyOp ? 'none' : 'inline-block';
      valInput.addEventListener('input', () => {
        const newFilters = [...(cfg.filters || [])];
        newFilters[idx] = { ...newFilters[idx], value: valInput.value };
        onChange({ filters: newFilters });
      });

      opSel.addEventListener('change', () => {
        valInput.style.display = ['isempty', 'isnotempty'].includes(opSel.value) ? 'none' : 'inline-block';
      });

      const removeBtn = createEl('button', 'dc-btn dc-btn-danger dc-btn-small', '✕');
      removeBtn.style.cssText = 'padding:2px 8px;font-size:12px;';
      removeBtn.addEventListener('click', () => {
        const newFilters = (cfg.filters || []).filter((_, i) => i !== idx);
        onChange({ filters: newFilters });
        renderFilters();
      });

      row.appendChild(colSel);
      row.appendChild(opSel);
      row.appendChild(valInput);
      row.appendChild(removeBtn);
      filtersContainer.appendChild(row);
    });
  }

  addFilterBtn.addEventListener('click', () => {
    const newFilters = [...(cfg.filters || []), { column: null, op: 'eq', value: '' }];
    onChange({ filters: newFilters });
    renderFilters();
  });

  editor.appendChild(filterSection);

  const sortSection = createEl('div', 'dc-sort-section');
  sortSection.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #ddd;';

  const sortTitle = createEl('div', 'dc-section-title', '↕️ Tris (optionnels)');
  sortTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;';
  sortSection.appendChild(sortTitle);

  const sortsContainer = createEl('div', 'dc-sorts-container');
  sortSection.appendChild(sortsContainer);

  const addSortBtn = createEl('button', 'dc-btn dc-btn-small', '+ Ajouter un tri');
  addSortBtn.style.cssText = 'margin-top:8px;padding:4px 12px;font-size:12px;';
  sortSection.appendChild(addSortBtn);

  function renderSorts() {
    sortsContainer.innerHTML = '';
    const sorts = cfg.sorts || [];
    if (sorts.length === 0) {
      sortsContainer.appendChild(createEl('p', 'dc-hint', 'Aucun tri. Ordre original de la table.'));
      return;
    }
    sorts.forEach((sort, idx) => {
      const row = createEl('div', 'dc-sort-row');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';

      const colSel = createEl('select', 'dc-select');
      colSel.appendChild(createEl('option', '', '— Colonne —'));
      availableColumns.forEach(col => {
        const opt = createEl('option', '', col.label || col.id);
        opt.value = col.id;
        colSel.appendChild(opt);
      });
      colSel.value = sort.column || '';
      colSel.addEventListener('change', () => {
        const newSorts = [...(cfg.sorts || [])];
        newSorts[idx] = { ...newSorts[idx], column: colSel.value || null };
        onChange({ sorts: newSorts });
      });

      const dirSel = createEl('select', 'dc-select');
      dirSel.appendChild(createEl('option', '↑ Croissant', 'asc'));
      dirSel.appendChild(createEl('option', '↓ Décroissant', 'desc'));
      dirSel.value = sort.dir || 'asc';
      dirSel.addEventListener('change', () => {
        const newSorts = [...(cfg.sorts || [])];
        newSorts[idx] = { ...newSorts[idx], dir: dirSel.value };
        onChange({ sorts: newSorts });
      });

      const removeBtn = createEl('button', 'dc-btn dc-btn-danger dc-btn-small', '✕');
      removeBtn.style.cssText = 'padding:2px 8px;font-size:12px;';
      removeBtn.addEventListener('click', () => {
        const newSorts = (cfg.sorts || []).filter((_, i) => i !== idx);
        onChange({ sorts: newSorts });
        renderSorts();
      });

      row.appendChild(colSel);
      row.appendChild(dirSel);
      row.appendChild(removeBtn);
      sortsContainer.appendChild(row);
    });
  }

  addSortBtn.addEventListener('click', () => {
    const newSorts = [...(cfg.sorts || []), { column: null, dir: 'asc' }];
    onChange({ sorts: newSorts });
    renderSorts();
  });

  editor.appendChild(sortSection);

  const footerSection = createEl('div', 'dc-footer-section');
  footerSection.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #ddd;';

  const footerEnabledLabel = createEl('label', 'dc-checkbox-label');
  const footerEnabledCb = createEl('input');
  footerEnabledCb.type = 'checkbox';
  footerEnabledCb.checked = !!cfg.footerFunc;
  footerEnabledCb.addEventListener('change', () => {
    onChange({ footerFunc: footerEnabledCb.checked ? (cfg.footerFunc || 'sum') : null });
    updateFooterVisibility();
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
  rowAggCb.addEventListener('change', () => {
    onChange({ rowAggregation: rowAggCb.checked });
    updateRowAggVisibility();
  });
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
  updateFooterVisibility();
  updateRowAggVisibility();

  let availableColumns = [];

  async function loadTables() {
    tableSelect.innerHTML = '';
    tableSelect.appendChild(createEl('option', '', '⏳ Chargement des tables...'));

    const tables = await listTables();
    console.log('[table-block] Tables loaded:', tables.length);

    tableSelect.innerHTML = '';
    tableSelect.appendChild(createEl('option', '', '— Choisir une table —'));
    tables.forEach(t => {
      const opt = createEl('option', '', t);
      opt.value = t;
      tableSelect.appendChild(opt);
    });

    const linkedId = await getLinkedTableId();
    console.log('[table-block] Linked table:', linkedId);

    if (cfg.sourceTable && tables.includes(cfg.sourceTable)) {
      tableSelect.value = cfg.sourceTable;
      await loadColumns(cfg.sourceTable);
    } else if (linkedId && tables.includes(linkedId)) {
      tableSelect.value = linkedId;
      onChange({ sourceTable: linkedId, useLinkedTable: true });
      await loadColumns(linkedId);
    } else if (tables.length > 0) {
      columnsContainer.appendChild(createEl('p', 'dc-hint', '⬆️ Sélectionnez une table pour voir ses colonnes'));
    } else {
      columnsContainer.appendChild(createEl('p', 'dc-hint dc-hint-error', '⚠️ Aucune table trouvée.'));
    }
  }

  async function loadColumns(tableId) {
    columnsContainer.innerHTML = '';
    columnsContainer.appendChild(createEl('p', 'dc-hint', '⏳ Chargement des colonnes...'));

    availableColumns = await getTableStructure(tableId);
    console.log('[table-block] Columns:', availableColumns.length, availableColumns.map(c => c.id));

    dynamicColSelect.innerHTML = '';
    dynamicColSelect.appendChild(createEl('option', '', '— Choisir la colonne de liaison —'));
    availableColumns.forEach(col => {
      const opt = createEl('option', '', `${col.label || col.id} (${col.type})`);
      opt.value = col.id;
      dynamicColSelect.appendChild(opt);
    });
    dynamicColSelect.value = cfg.dynamicFilterColumn || '';

    renderFilters();
    renderSorts();
    renderColumns();
  }

  function renderColumns() {
    columnsContainer.innerHTML = '';

    if (availableColumns.length === 0) {
      columnsContainer.appendChild(createEl('p', 'dc-hint dc-hint-error', '⚠️ Aucune colonne trouvée pour cette table.'));
      return;
    }

    const selectedIds = (cfg.columns || []).map(c => c.id);

    availableColumns.forEach(col => {
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

  tableSelect.addEventListener('change', async () => {
    const tid = tableSelect.value;
    if (!tid) {
      availableColumns = [];
      columnsContainer.innerHTML = '';
      columnsContainer.appendChild(createEl('p', 'dc-hint', '⬆️ Sélectionnez une table pour voir ses colonnes'));
      onChange({ sourceTable: null, columns: [], filters: [], sorts: [] });
      return;
    }
    onChange({ sourceTable: tid, useLinkedTable: false, columns: [], filters: [], sorts: [] });
    await loadColumns(tid);
  });

  await loadTables();

  return editor;
}
