import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createEl, debounce } from '../utils.js';
import { fetchLinkedTableData, fetchTableData, getLinkedTableColumns, getTableStructure, getAllTablesWithColumns } from '../grist-api.js';

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

    if (block.config.linkedColumn && store.currentRecord) {
      try {
        let data;
        if (block.config.useLinkedTable !== false) {
          data = await fetchLinkedTableData({ limit: 1000 });
        } else if (block.config.linkedTable) {
          data = await fetchTableData(block.config.linkedTable, { limit: 1000 });
        }
        if (data && data.records) {
          const rec = data.records.find(r => r.id === store.currentRecord.id);
          if (rec && rec.fields[block.config.linkedColumn]) {
            const val = rec.fields[block.config.linkedColumn];
            markdown = typeof val === 'string' ? val : JSON.stringify(val);
          }
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

  editor.appendChild(createEl('label', 'dc-label', 'Contenu (Markdown)'));
  editor.appendChild(createEl('p', 'dc-hint', 'Utilisez # pour un titre, **gras**, *italique*, - pour une liste...'));

  const textarea = createEl('textarea', 'dc-textarea');
  textarea.value = block.config.markdown || '';
  textarea.placeholder = 'Écrivez votre texte en Markdown...\n\n# Titre\n**gras** *italique*\n- liste à puces';
  textarea.style.cssText = 'width:100%;min-height:120px;font-family:monospace;font-size:13px;padding:8px;';

  const preview = createEl('div', 'dc-text-preview');
  preview.style.cssText = 'border:1px solid #ddd;padding:8px;margin-top:8px;min-height:40px;border-radius:4px;';

  const updatePreview = debounce(() => {
    const rawHtml = marked.parse(textarea.value);
    preview.innerHTML = DOMPurify.sanitize(rawHtml);
    onChange({ markdown: textarea.value });
  }, 300);

  textarea.addEventListener('input', updatePreview);

  const rawHtml = marked.parse(textarea.value);
  preview.innerHTML = DOMPurify.sanitize(rawHtml);

  editor.appendChild(textarea);
  editor.appendChild(createEl('label', 'dc-label', 'Aperçu'));
  editor.appendChild(preview);

  const linkSection = createEl('div', 'dc-text-link-section');
  linkSection.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #ddd;';

  const linkLabel = createEl('label', 'dc-label', 'Ou remplacer par le contenu d\'une colonne (dynamique)');
  linkSection.appendChild(linkLabel);
  linkSection.appendChild(createEl('p', 'dc-hint', 'Le texte ci-dessus sera remplacé par la valeur de la colonne choisie, pour la ligne active.'));

  const colSelect = createEl('select', 'dc-select dc-select-full');
  colSelect.appendChild(createEl('option', '', '— Texte statique (Markdown ci-dessus) —'));

  async function loadColumns() {
    colSelect.innerHTML = '';
    colSelect.appendChild(createEl('option', '', '— Texte statique (Markdown ci-dessus) —'));
    colSelect.appendChild(createEl('option', '', '⏳ Chargement...'));

    let columns = await getLinkedTableColumns();
    console.log('[text-block] Linked columns:', columns.length);

    if (columns.length === 0 && block.config.linkedTable) {
      columns = await getTableStructure(block.config.linkedTable);
    }

    colSelect.innerHTML = '';
    colSelect.appendChild(createEl('option', '', '— Texte statique (Markdown ci-dessus) —'));

    if (columns.length === 0) {
      colSelect.appendChild(createEl('option', '', '⚠️ Aucune colonne disponible'));
      return;
    }

    columns.forEach(col => {
      const opt = createEl('option', '', `${col.label || col.id} (${col.type})`);
      opt.value = col.id;
      colSelect.appendChild(opt);
    });
    colSelect.value = block.config.linkedColumn || '';
  }

  colSelect.addEventListener('change', () => {
    onChange({
      linkedColumn: colSelect.value || null,
      useLinkedTable: true,
    });
  });

  linkSection.appendChild(colSelect);

  editor.appendChild(linkSection);

  await loadColumns();

  return editor;
}
