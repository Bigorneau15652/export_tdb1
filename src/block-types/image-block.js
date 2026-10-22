import { createEl } from '../utils.js';
import { fetchTableData, fetchLinkedTableData, getTableStructure, getLinkedTableColumns, getAllTablesWithColumns } from '../grist-api.js';

export async function renderImageBlock(block, container, store) {
  container.className = 'dc-block-content dc-image-block';
  container.innerHTML = '';

  const cfg = block.config;

  if (!cfg.imageColumn) {
    container.appendChild(createEl('div', 'dc-block-placeholder', '⚙️ Configurez l\'image : choisissez une colonne contenant des images'));
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
      let data;
      if (cfg.useLinkedTable !== false) {
        data = await fetchLinkedTableData({ limit: 1000 });
      } else if (cfg.sourceTable) {
        data = await fetchTableData(cfg.sourceTable, { limit: 1000 });
      }

      if (!data || !data.records) {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.textContent = '🖼 Aucune donnée';
        return;
      }

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

      let imageUrl = null;

      if (typeof selected === 'number') {
        const g = window.grist || (typeof grist !== 'undefined' ? grist : null);
        if (g && g.docApi) {
          try {
            const token = await g.docApi.getAccessToken({ readOnly: true });
            imageUrl = `/api/docs/${g.docApi._docId || ''}/attachments/${selected}/download`;
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

  editor.appendChild(createEl('p', 'dc-hint', '🖼 L\'image provient de la table liée à ce widget. Choisissez une colonne de type "Pièce jointe" ou "Texte" (URL).'));

  const colLabel = createEl('label', 'dc-label', 'Colonne contenant l\'image');
  const colSelect = createEl('select', 'dc-select dc-select-full');
  editor.appendChild(colLabel);
  editor.appendChild(colSelect);

  const indexLabel = createEl('label', 'dc-label', 'Numéro de l\'image (si plusieurs dans la cellule)');
  const indexInput = createEl('input', 'dc-input dc-input-full');
  indexInput.type = 'number';
  indexInput.min = '0';
  indexInput.value = cfg.imageIndex || 0;
  indexInput.addEventListener('input', () => onChange({ imageIndex: parseInt(indexInput.value, 10) || 0 }));
  editor.appendChild(indexLabel);
  editor.appendChild(indexInput);

  const captionLabel = createEl('label', 'dc-label', 'Légende (affichée sous l\'image)');
  const captionInput = createEl('input', 'dc-input dc-input-full');
  captionInput.type = 'text';
  captionInput.value = cfg.caption || '';
  captionInput.placeholder = 'Légende optionnelle';
  captionInput.addEventListener('input', () => onChange({ caption: captionInput.value }));
  editor.appendChild(captionLabel);
  editor.appendChild(captionInput);

  colSelect.appendChild(createEl('option', '', '⏳ Chargement des colonnes...'));

  async function loadColumns() {
    colSelect.innerHTML = '';
    colSelect.appendChild(createEl('option', '', '— Choisir une colonne —'));

    let columns = [];

    if (cfg.useLinkedTable !== false) {
      columns = await getLinkedTableColumns();
      console.log('[image-block] Linked columns:', columns.length);
    }

    if (columns.length === 0 && cfg.sourceTable) {
      columns = await getTableStructure(cfg.sourceTable);
    }

    if (columns.length === 0) {
      columns = await getLinkedTableColumns();
    }

    colSelect.innerHTML = '';
    colSelect.appendChild(createEl('option', '', '— Choisir une colonne —'));

    if (columns.length === 0) {
      colSelect.appendChild(createEl('option', '', '⚠️ Aucune colonne disponible'));

      const allTables = await getAllTablesWithColumns();
      const tableIds = Object.keys(allTables);
      if (tableIds.length > 0) {
        const altLabel = createEl('label', 'dc-label', 'Ou choisir une autre table:');
        const altSelect = createEl('select', 'dc-select dc-select-full');
        altSelect.appendChild(createEl('option', '', '— Choisir —'));
        tableIds.forEach(tid => {
          const opt = createEl('option', '', tid);
          opt.value = tid;
          altSelect.appendChild(opt);
        });
        altSelect.addEventListener('change', async () => {
          if (altSelect.value) {
            onChange({ sourceTable: altSelect.value, useLinkedTable: false, imageColumn: null });
            const cols = allTables[altSelect.value] || await getTableStructure(altSelect.value);
            renderColumns(cols);
          }
        });
        editor.appendChild(altLabel);
        editor.appendChild(altSelect);
      }
      return;
    }

    renderColumns(columns);
  }

  function renderColumns(columns) {
    colSelect.innerHTML = '';
    colSelect.appendChild(createEl('option', '', '— Choisir une colonne —'));
    columns.forEach(col => {
      const opt = createEl('option', '', `${col.label || col.id} (${col.type})`);
      opt.value = col.id;
      colSelect.appendChild(opt);
    });
    colSelect.value = cfg.imageColumn || '';
  }

  colSelect.addEventListener('change', () => onChange({ imageColumn: colSelect.value || null }));

  await loadColumns();

  return editor;
}
