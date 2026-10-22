import * as echarts from 'echarts';
import 'echarts-gl';
import { createEl } from '../utils.js';
import { fetchTableData, fetchLinkedTableData, getTableStructure, getLinkedTableColumns, listTables, getLinkedTableId } from '../grist-api.js';
import { getPaletteColors, PALETTES } from '../palettes.js';

const CHART_TYPES = [
  { value: 'barGrouped', label: 'Histogramme groupé', icon: '📊' },
  { value: 'line', label: 'Courbe', icon: '📈' },
  { value: 'hBarStacked', label: 'Barres empilées (horizontales)', icon: '📊' },
  { value: 'barStacked', label: 'Histogramme empilé 2D', icon: '📊' },
  { value: 'bar3D', label: 'Histogramme empilé 3D', icon: '🎲' },
  { value: 'hBar3D', label: 'Barres empilées 3D', icon: '🎲' },
  { value: 'areaStacked', label: 'Aire empilée', icon: '🏔' },
  { value: 'pie', label: 'Secteur 2D (camembert)', icon: '🥧' },
  { value: 'pie3D', label: 'Secteur 3D', icon: '🎂' },
  { value: 'doughnut', label: 'Anneau', icon: '🍩' },
  { value: 'scatter', label: 'Nuage de points', icon: '☁️' },
  { value: 'treemap', label: 'Compartimentage', icon: '🗂' },
];

export async function renderChartBlock(block, container, store) {
  container.className = 'dc-block-content dc-chart-block';
  container.innerHTML = '';

  const cfg = block.config;

  if (!cfg.sourceTable || !cfg.xColumn || !cfg.yColumns || cfg.yColumns.length === 0) {
    container.appendChild(createEl('div', 'dc-block-placeholder', '⚙️ Configurez le graphique : choisissez une table, une colonne X et au moins une colonne Y'));
    return { update: async () => {}, destroy() {} };
  }

  const chartEl = createEl('div', 'dc-chart-canvas');
  chartEl.style.width = '100%';
  chartEl.style.height = '100%';
  container.appendChild(chartEl);

  const chart = echarts.init(chartEl);

  async function update() {
    try {
      const data = await fetchTableData(cfg.sourceTable, {
        columns: [cfg.xColumn, ...cfg.yColumns],
        filters: cfg.filters,
        sorts: cfg.sorts,
      });

      const records = data.records || [];
      const colors = getPaletteColors(cfg.palette);

      const categories = records.map(r => formatCategory(r.fields[cfg.xColumn]));
      const series = cfg.yColumns.map((col, i) => ({
        name: col,
        type: getEChartsType(cfg.chartType),
        data: records.map(r => {
          const v = r.fields[col];
          return typeof v === 'number' ? v : parseFloat(v) || 0;
        }),
        itemStyle: { color: colors[i % colors.length] },
        emphasis: { focus: 'series' },
      }));

      const option = buildChartOption(cfg, categories, series, colors);
      chart.setOption(option, true);
    } catch (e) {
      console.error('[chart-block] Error:', e);
      container.innerHTML = '';
      container.appendChild(createEl('div', 'dc-block-error', `Erreur : ${e.message}`));
    }
  }

  await update();

  const resizeObserver = new ResizeObserver(() => {
    chart.resize();
  });
  resizeObserver.observe(container);

  return {
    update,
    destroy() {
      resizeObserver.disconnect();
      chart.dispose();
    },
  };
}

function formatCategory(val) {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function getEChartsType(chartType) {
  const map = {
    barGrouped: 'bar',
    line: 'line',
    hBarStacked: 'bar',
    barStacked: 'bar',
    bar3D: 'bar3D',
    hBar3D: 'bar3D',
    areaStacked: 'line',
    pie: 'pie',
    pie3D: 'pie',
    doughnut: 'pie',
    scatter: 'scatter',
    treemap: 'treemap',
  };
  return map[chartType] || 'bar';
}

function buildChartOption(cfg, categories, series, colors) {
  const baseOption = {
    color: colors,
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 50, right: 20, top: 30, bottom: 60, containLabel: true },
  };

  if (cfg.chartTitle) {
    baseOption.title = { text: cfg.chartTitle, left: 'center', textStyle: { fontSize: 14 } };
  }

  switch (cfg.chartType) {
    case 'pie':
    case 'pie3D':
    case 'doughnut': {
      const is3D = cfg.chartType === 'pie3D';
      const isDoughnut = cfg.chartType === 'doughnut';
      return {
        color: colors,
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle' },
        series: [{
          type: 'pie',
          radius: isDoughnut ? ['40%', '70%'] : is3D ? ['0%', '70%'] : '70%',
          center: is3D ? ['40%', '55%'] : ['50%', '55%'],
          roseType: is3D ? 'radius' : undefined,
          itemStyle: is3D ? { borderRadius: 4 } : undefined,
          label: { formatter: '{d}%' },
          data: categories.map((cat, i) => ({
            name: cat,
            value: series[0].data[i],
          })),
          ...(is3D ? { viewControl: { autoRotate: false } } : {}),
        }],
      };
    }

    case 'scatter':
      return {
        ...baseOption,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: series.map(s => ({ ...s, type: 'scatter', symbolSize: 10 })),
      };

    case 'treemap':
      return {
        color: colors,
        tooltip: { formatter: '{b}: {c}' },
        series: [{
          type: 'treemap',
          roam: false,
          width: '100%',
          height: '100%',
          top: cfg.chartTitle ? 40 : 10,
          label: { show: true, formatter: '{b}\n{c}' },
          data: categories.map((cat, i) => ({ name: cat, value: series[0].data[i] })),
        }],
      };

    case 'line':
    case 'areaStacked':
      return {
        ...baseOption,
        xAxis: { type: 'category', data: categories, boundaryGap: false },
        yAxis: { type: 'value' },
        series: series.map(s => ({
          ...s,
          type: 'line',
          stack: cfg.chartType === 'areaStacked' ? 'total' : undefined,
          areaStyle: cfg.chartType === 'areaStacked' ? {} : undefined,
          smooth: true,
        })),
      };

    case 'hBarStacked':
      return {
        ...baseOption,
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: categories },
        series: series.map(s => ({ ...s, type: 'bar', stack: 'total' })),
      };

    case 'barStacked':
      return {
        ...baseOption,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: series.map(s => ({ ...s, type: 'bar', stack: 'total' })),
      };

    case 'bar3D':
      return {
        ...baseOption,
        grid3D: { viewControl: { autoRotate: false } },
        xAxis3D: { type: 'category', data: categories },
        yAxis3D: { type: 'category', data: cfg.yColumns },
        zAxis3D: { type: 'value' },
        series: cfg.yColumns.map((col, i) => ({
          type: 'bar3D',
          data: categories.map((cat, j) => [j, i, series[i].data[j]]),
          stack: 'stack',
          itemStyle: { color: colors[i % colors.length] },
        })),
      };

    case 'hBar3D':
      return {
        ...baseOption,
        grid3D: { viewControl: { autoRotate: false } },
        xAxis3D: { type: 'value' },
        yAxis3D: { type: 'category', data: categories },
        zAxis3D: { type: 'category', data: cfg.yColumns },
        series: cfg.yColumns.map((col, i) => ({
          type: 'bar3D',
          data: categories.map((cat, j) => [series[i].data[j], j, i]),
          stack: 'stack',
          itemStyle: { color: colors[i % colors.length] },
        })),
      };

    case 'barGrouped':
    default:
      return {
        ...baseOption,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: series.map(s => ({ ...s, type: 'bar' })),
      };
  }
}

export async function createChartEditor(block, onChange, store) {
  const editor = createEl('div', 'dc-block-editor dc-chart-editor');
  const cfg = block.config;

  const typeLabel = createEl('label', 'dc-label', 'Type de graphique');
  const typeSelect = createEl('select', 'dc-select dc-select-full');
  CHART_TYPES.forEach(ct => {
    const opt = createEl('option', '', `${ct.icon} ${ct.label}`);
    opt.value = ct.value;
    typeSelect.appendChild(opt);
  });
  typeSelect.value = cfg.chartType || 'barGrouped';
  typeSelect.addEventListener('change', () => onChange({ chartType: typeSelect.value }));
  editor.appendChild(typeLabel);
  editor.appendChild(typeSelect);

  const titleLabel = createEl('label', 'dc-label', 'Titre du graphique');
  const titleInput = createEl('input', 'dc-input dc-input-full');
  titleInput.type = 'text';
  titleInput.value = cfg.chartTitle || '';
  titleInput.placeholder = 'Titre optionnel';
  titleInput.addEventListener('input', () => onChange({ chartTitle: titleInput.value }));
  editor.appendChild(titleLabel);
  editor.appendChild(titleInput);

  const tableLabel = createEl('label', 'dc-label', 'Table source');
  const tableSelect = createEl('select', 'dc-select dc-select-full');
  editor.appendChild(tableLabel);
  editor.appendChild(tableSelect);

  const xColLabel = createEl('label', 'dc-label', 'Colonne X (catégories / libellés)');
  const xColSelect = createEl('select', 'dc-select dc-select-full');
  editor.appendChild(xColLabel);
  editor.appendChild(xColSelect);

  const yColLabel = createEl('label', 'dc-label', 'Colonnes Y (valeurs numériques)');
  const yColContainer = createEl('div', 'dc-columns-selector');
  editor.appendChild(yColLabel);
  editor.appendChild(yColContainer);

  const paletteLabel = createEl('label', 'dc-label', 'Palette de couleurs');
  const paletteSelect = createEl('select', 'dc-select dc-select-full');
  Object.entries(PALETTES).forEach(([id, p]) => {
    const opt = createEl('option', '', p.name);
    opt.value = id;
    paletteSelect.appendChild(opt);
  });
  paletteSelect.value = cfg.palette || 'palette-1';
  paletteSelect.addEventListener('change', () => onChange({ palette: paletteSelect.value }));
  editor.appendChild(paletteLabel);
  editor.appendChild(paletteSelect);

  let availableColumns = [];

  function renderColumnSelectors() {
    xColSelect.innerHTML = '';
    xColSelect.appendChild(createEl('option', '', '— Choisir une colonne —'));
    yColContainer.innerHTML = '';

    if (availableColumns.length === 0) {
      yColContainer.appendChild(createEl('p', 'dc-hint', '⬆️ Sélectionnez une table pour voir ses colonnes'));
      return;
    }

    availableColumns.forEach(col => {
      const opt = createEl('option', '', `${col.label || col.id} (${col.type})`);
      opt.value = col.id;
      xColSelect.appendChild(opt.cloneNode(true));

      const label = createEl('label', 'dc-checkbox-label');
      const cb = createEl('input');
      cb.type = 'checkbox';
      cb.checked = (cfg.yColumns || []).includes(col.id);
      cb.addEventListener('change', () => {
        const current = cfg.yColumns || [];
        if (cb.checked) {
          onChange({ yColumns: [...current, col.id] });
        } else {
          onChange({ yColumns: current.filter(c => c !== col.id) });
        }
      });
      label.appendChild(cb);
      label.appendChild(createEl('span', '', ` ${col.label || col.id}`));
      yColContainer.appendChild(label);
    });

    xColSelect.value = cfg.xColumn || '';
  }

  xColSelect.addEventListener('change', () => onChange({ xColumn: xColSelect.value }));

  async function loadTables() {
    tableSelect.innerHTML = '';
    tableSelect.appendChild(createEl('option', '', '⏳ Chargement des tables...'));

    const tables = await listTables();
    console.log('[chart-block] Tables:', tables.length, tables);

    tableSelect.innerHTML = '';
    tableSelect.appendChild(createEl('option', '', '— Choisir une table —'));
    tables.forEach(t => {
      const opt = createEl('option', '', t);
      opt.value = t;
      tableSelect.appendChild(opt);
    });

    const linkedId = await getLinkedTableId();
    console.log('[chart-block] Linked:', linkedId);

    if (cfg.sourceTable && tables.includes(cfg.sourceTable)) {
      tableSelect.value = cfg.sourceTable;
      await loadColumns(cfg.sourceTable);
    } else if (linkedId && tables.includes(linkedId)) {
      tableSelect.value = linkedId;
      onChange({ sourceTable: linkedId });
      await loadColumns(linkedId);
    } else {
      renderColumnSelectors();
    }
  }

  async function loadColumns(tableId) {
    xColSelect.innerHTML = '';
    xColSelect.appendChild(createEl('option', '', '⏳ Chargement...'));
    yColContainer.innerHTML = '';
    yColContainer.appendChild(createEl('p', 'dc-hint', '⏳ Chargement des colonnes...'));

    availableColumns = await getTableStructure(tableId);
    console.log('[chart-block] Columns:', availableColumns.length);
    renderColumnSelectors();
  }

  tableSelect.addEventListener('change', async () => {
    const tid = tableSelect.value;
    if (!tid) {
      availableColumns = [];
      renderColumnSelectors();
      onChange({ sourceTable: null, xColumn: null, yColumns: [] });
      return;
    }
    onChange({ sourceTable: tid, xColumn: null, yColumns: [] });
    await loadColumns(tid);
  });

  await loadTables();

  return editor;
}
