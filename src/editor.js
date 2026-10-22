import { createEl } from './utils.js';
import { createTextEditor } from './block-types/text-block.js';
import { createTableEditor } from './block-types/table-block.js';
import { createChartEditor } from './block-types/chart-block.js';
import { createImageEditor } from './block-types/image-block.js';

const BLOCK_TYPE_OPTIONS = [
  { value: 'text', label: '📝 Texte (Markdown)' },
  { value: 'table', label: '▦ Tableau' },
  { value: 'chart', label: '📊 Graphique' },
  { value: 'image', label: '🖼 Image' },
];

export function createEditorPanel(block, store, onClose) {
  const overlay = createEl('div', 'dc-editor-overlay');
  const panel = createEl('div', 'dc-editor-panel');

  const header = createEl('div', 'dc-editor-header');
  const title = createEl('h3', 'dc-editor-title', 'Configuration du bloc');
  const closeBtn = createEl('button', 'dc-btn dc-btn-close', '✕');
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    if (onClose) onClose();
  });
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const typeLabel = createEl('label', 'dc-label', 'Type de bloc');
  const typeSelect = createEl('select', 'dc-select dc-select-full');
  BLOCK_TYPE_OPTIONS.forEach(opt => {
    const el = createEl('option', '', opt.label);
    el.value = opt.value;
    typeSelect.appendChild(el);
  });
  typeSelect.value = block.type;
  typeSelect.addEventListener('change', () => {
    store.changeBlockType(block.id, typeSelect.value);
    overlay.remove();
    if (onClose) onClose(true);
  });

  panel.appendChild(typeLabel);
  panel.appendChild(typeSelect);

  const configContainer = createEl('div', 'dc-editor-config');
  panel.appendChild(configContainer);

  async function loadConfigEditor() {
    configContainer.innerHTML = '';
    const onChange = (updates) => {
      store.updateBlockConfig(block.id, updates);
    };

    let editorEl;
    switch (block.type) {
      case 'text':
        editorEl = createTextEditor(block, onChange);
        break;
      case 'table':
        editorEl = await createTableEditor(block, onChange, store);
        break;
      case 'chart':
        editorEl = await createChartEditor(block, onChange, store);
        break;
      case 'image':
        editorEl = await createImageEditor(block, onChange, store);
        break;
      default:
        editorEl = createEl('p', '', 'Type de bloc non reconnu');
    }
    configContainer.appendChild(editorEl);
  }

  loadConfigEditor();

  const footer = createEl('div', 'dc-editor-footer');
  const deleteBtn = createEl('button', 'dc-btn dc-btn-danger', '🗑 Supprimer le bloc');
  deleteBtn.addEventListener('click', () => {
    if (confirm('Supprimer ce bloc ?')) {
      store.removeBlock(block.id);
      overlay.remove();
      if (onClose) onClose();
    }
  });
  footer.appendChild(deleteBtn);
  panel.appendChild(footer);

  overlay.appendChild(panel);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (onClose) onClose();
    }
  });

  return overlay;
}
