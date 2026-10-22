import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createEl, sanitizeHtml, debounce } from '../utils.js';
import { fetchTableData, listTables, getTableStructure, getSelectedTableId } from '../grist-api.js';

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderTextBlock(block, container, store) {
  container.className = 'dc-block-content dc-text-block';
  container.innerHTML = '';

  const contentEl = createEl('div', 'dc-text-content');
  container.appendChild(contentEl);

  async function update() {
    let markdown = block.config.markdown || '';

    if (block.config.linkedTable && block.config.linkedColumn && store.currentRecord) {
      try {
        const data = await fetchTableData(block.config.linkedTable, { limit: 1000 });
        const rec = data.records.find(r => r.id === store.currentRecord.id);
        if (rec && rec.fields[block.config.linkedColumn]) {
          const val = rec.fields[block.config.linkedColumn];
          markdown = typeof val === 'string' ? val : JSON.stringify(val);
        }
      } catch (e) {
        console.error('[text-block] Error fetching linked data:', e);
      }
    }

    const rawHtml = marked.parse(markdown);
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
        'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
        'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'img', 'span', 'div', 'small', 'sub', 'sup',
      ],
      ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'class', 'style', 'colspan', 'rowspan'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
    });
    contentEl.innerHTML = cleanHtml;
  }

  update();

  return {
    update,
    destroy() {},
  };
}

export async function createTextEditor(block, onChange, store) {
  const editor = createEl('div', 'dc-block-editor dc-text-editor');

  const textarea = createEl('textarea', 'dc-textarea');
  textarea.value = block.config.markdown || '';
  textarea.placeholder = 'Écrivez votre texte en Markdown...\n\n# Titre\n**gras** *italique*\n- liste';

  const preview = createEl('div', 'dc-text-preview');

  const updatePreview = debounce(() => {
    const rawHtml = marked.parse(textarea.value);
    preview.innerHTML = DOMPurify.sanitize(rawHtml);
    onChange({ markdown: textarea.value });
  }, 300);

  textarea.addEventListener('input', updatePreview);

  const rawHtml = marked.parse(textarea.value);
  preview.innerHTML = DOMPurify.sanitize(rawHtml);

  const linkSection = createEl('div', 'dc-text-link-section');
  const linkLabel = createEl('label', 'dc-label', 'Ou lier à une colonne (texte dynamique)');

  let tables = await listTables();
  const selectedTableId = await getSelectedTableId();
  if ((!tables || tables.length === 0) && selectedTableId) {
    tables = [selectedTableId];
  }

  const tableSelect = createEl('select', 'dc-select dc-select-full');
  tableSelect.appendChild(createEl('option', '', '— Texte statique (Markdown) —'));
  (tables || []).forEach(t => {
    const opt = createEl('option', '', t);
    opt.value = t;
    tableSelect.appendChild(opt);
  });
  tableSelect.value = block.config.linkedTable || '';

  const colSelect = createEl('select', 'dc-select dc-select-full');
  colSelect.appendChild(createEl('option', '', '— Choisir une colonne —'));

  async function loadColumns(tableId) {
    colSelect.innerHTML = '';
    colSelect.appendChild(createEl('option', '', '— Choisir une colonne —'));
    if (!tableId) return;
    const columns = await getTableStructure(tableId);
    console.log('[text-block] loadColumns:', columns.length, 'columns');
    columns.forEach(col => {
      const opt = createEl('option', '', `${col.label || col.id} (${col.type})`);
      opt.value = col.id;
      colSelect.appendChild(opt);
    });
    colSelect.value = block.config.linkedColumn || '';
  }

  tableSelect.addEventListener('change', () => {
    onChange({ linkedTable: tableSelect.value || null, linkedColumn: null });
    loadColumns(tableSelect.value);
  });

  colSelect.addEventListener('change', () => {
    onChange({ linkedColumn: colSelect.value || null });
  });

  if (block.config.linkedTable) {
    await loadColumns(block.config.linkedTable);
  }

  linkSection.appendChild(linkLabel);
  linkSection.appendChild(tableSelect);
  linkSection.appendChild(colSelect);

  editor.appendChild(createEl('label', 'dc-label', 'Contenu Markdown'));
  editor.appendChild(textarea);
  editor.appendChild(createEl('label', 'dc-label', 'Aperçu'));
  editor.appendChild(preview);
  editor.appendChild(linkSection);

  return editor;
}
