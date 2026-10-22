import { createEl } from '../utils.js';
import { fetchTableData, getTableStructure, listTables, getSelectedTableId } from '../grist-api.js';

export async function renderImageBlock(block, container, store) {
  container.className = 'dc-block-content dc-image-block';
  container.innerHTML = '';

  const cfg = block.config;

  if (!cfg.sourceTable || !cfg.imageColumn) {
    container.appendChild(createEl('div', 'dc-block-placeholder', '⚙️ Configurez l\'image : choisissez une table et une colonne'));
    return { update: async () => {}, destroy() {} };
  }

  const imgWrapper = createEl('div', 'dc-image-wrapper');
  const img = createEl('img', 'dc-image');
  img.alt = cfg.caption || 'Image';

  const placeholder = createEl('div', 'dc-image-placeholder', '🖼 Aucune image');

  imgWrapper.appendChild(img);
  imgWrapper.appendChild(placeholder);
  container.appendChild(imgWrapper);

  if (cfg.caption) {
    container.appendChild(createEl('div', 'dc-image-caption', cfg.caption));
  }

  async function update() {
    try {
      const data = await fetchTableData(cfg.sourceTable, {
        columns: [cfg.imageColumn],
        limit: 1000,
      });

      const rec = data.records.find(r => store.currentRecord && r.id === store.currentRecord.id);
      if (!rec) {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.textContent = '🖼 Aucune donnée pour cette ligne';
        return;
      }

      const val = rec.fields[cfg.imageColumn];
      if (!val) {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.textContent = '🖼 Aucune image';
        return;
      }

      let imageUrl = null;
      let images = [];

      if (Array.isArray(val)) {
        if (val[0] === 'L') {
          images = val.slice(1);
        } else if (typeof val[0] === 'number') {
          images = val;
        }
      } else if (typeof val === 'string') {
        if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:')) {
          images = [val];
        }
      } else if (typeof val === 'number') {
        images = [val];
      }

      const idx = Math.min(cfg.imageIndex || 0, Math.max(0, images.length - 1));
      const selected = images[idx];

      if (typeof selected === 'number') {
        if (typeof grist !== 'undefined') {
          try {
            const token = await grist.docApi.getAccessToken({ readOnly: true });
            imageUrl = `/api/docs/${grist.docApi._docId || ''}/attachments/${selected}/download`;
          } catch (e) {
            imageUrl = null;
          }
        }
      } else if (typeof selected === 'string') {
        imageUrl = selected;
      }

      if (imageUrl) {
        img.src = imageUrl;
        img.style.display = 'block';
        placeholder.style.display = 'none';
        img.onerror = () => {
          img.style.display = 'none';
          placeholder.style.display = 'flex';
          placeholder.textContent = '🖼 Image non disponible';
        };
      } else {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.textContent = '🖼 Aucune image';
      }
    } catch (e) {
      console.error('[image-block] Error:', e);
      img.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.textContent = '🖼 Erreur de chargement';
    }
  }

  await update();

  return {
    update,
    destroy() {
      img.src = '';
    },
  };
}

export async function createImageEditor(block, onChange, store) {
  const editor = createEl('div', 'dc-block-editor dc-image-editor');
  const cfg = block.config;

  let tables = await listTables();
  const selectedTableId = await getSelectedTableId();
  const isGristContext = typeof grist !== 'undefined';

  if ((!tables || tables.length === 0) && selectedTableId) {
    tables = [selectedTableId];
  }

  const debugInfo = createEl('div', 'dc-debug-info');
  debugInfo.style.cssText = 'font-size:11px;color:#888;background:#f5f5f5;padding:6px;border-radius:4px;margin-bottom:8px;font-family:monospace;';
  debugInfo.textContent = `Debug: Grist=${isGristContext}, Tables=${tables ? tables.length : 'null'} [${(tables || []).join(', ')}], Selected=${selectedTableId || 'none'}`;
  editor.appendChild(debugInfo);

  const tableLabel = createEl('label', 'dc-label', 'Table source');
  const tableSelect = createEl('select', 'dc-select dc-select-full');
  tableSelect.appendChild(createEl('option', '', '— Choisir une table —'));
  (tables || []).forEach(t => {
    const opt = createEl('option', '', t);
    opt.value = t;
    tableSelect.appendChild(opt);
  });

  if (!cfg.sourceTable && selectedTableId && tables.includes(selectedTableId)) {
    cfg.sourceTable = selectedTableId;
    onChange({ sourceTable: selectedTableId });
  }
  tableSelect.value = cfg.sourceTable || '';

  const colLabel = createEl('label', 'dc-label', 'Colonne image (Attachments ou URL)');
  const colSelect = createEl('select', 'dc-select dc-select-full');

  const indexLabel = createEl('label', 'dc-label', 'Index de l\'image (si plusieurs)');
  const indexInput = createEl('input', 'dc-input dc-input-full');
  indexInput.type = 'number';
  indexInput.min = '0';
  indexInput.value = cfg.imageIndex || 0;
  indexInput.addEventListener('input', () => onChange({ imageIndex: parseInt(indexInput.value, 10) || 0 }));

  const captionLabel = createEl('label', 'dc-label', 'Légende');
  const captionInput = createEl('input', 'dc-input dc-input-full');
  captionInput.type = 'text';
  captionInput.value = cfg.caption || '';
  captionInput.placeholder = 'Légende optionnelle';
  captionInput.addEventListener('input', () => onChange({ caption: captionInput.value }));

  let availableColumns = [];

  async function loadColumns(tableId) {
    if (!tableId) {
      availableColumns = [];
      renderColumnSelect();
      return;
    }
    availableColumns = await getTableStructure(tableId);
    if (availableColumns.length === 0) {
      try {
        const data = await fetchTableData(tableId, { limit: 1 });
        if (data.fields) {
          availableColumns = Object.entries(data.fields).map(([id, field]) => ({
            id,
            label: field.label || id,
            type: field.type || 'Any',
          }));
        } else if (data.records && data.records.length > 0) {
          availableColumns = Object.keys(data.records[0].fields).map(id => ({
            id,
            label: id,
            type: 'Any',
          }));
        }
      } catch (e) {
        console.error('[image-block] loadColumns fallback error:', e);
      }
    }
    renderColumnSelect();
  }

  function renderColumnSelect() {
    colSelect.innerHTML = '';
    colSelect.appendChild(createEl('option', '', '— Choisir —'));
    availableColumns.forEach(col => {
      const opt = createEl('option', '', `${col.label || col.id} (${col.type})`);
      opt.value = col.id;
      colSelect.appendChild(opt);
    });
    colSelect.value = cfg.imageColumn || '';
  }

  colSelect.addEventListener('change', () => onChange({ imageColumn: colSelect.value }));
  tableSelect.addEventListener('change', () => {
    onChange({ sourceTable: tableSelect.value, imageColumn: null });
    loadColumns(tableSelect.value);
  });

  if (cfg.sourceTable) {
    await loadColumns(cfg.sourceTable);
  } else {
    renderColumnSelect();
  }

  editor.appendChild(tableLabel);
  editor.appendChild(tableSelect);
  editor.appendChild(colLabel);
  editor.appendChild(colSelect);
  editor.appendChild(indexLabel);
  editor.appendChild(indexInput);
  editor.appendChild(captionLabel);
  editor.appendChild(captionInput);

  return editor;
}
