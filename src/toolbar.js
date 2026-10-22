import { createEl } from './utils.js';

const BLOCK_TYPES = [
  { type: 'text', icon: 'T', label: 'Texte' },
  { type: 'table', icon: '▦', label: 'Tableau' },
  { type: 'chart', icon: '📊', label: 'Graphique' },
  { type: 'image', icon: '🖼', label: 'Image' },
];

const PAGE_FORMATS = [
  { value: 'A3', label: 'A3' },
  { value: 'A4', label: 'A4' },
  { value: 'A5', label: 'A5' },
  { value: 'screen', label: 'Écran' },
  { value: 'square', label: 'Carré' },
];

export function createToolbar(store, callbacks) {
  const toolbar = createEl('div', 'dc-toolbar');

  const leftGroup = createEl('div', 'dc-toolbar-group');

  const formatSelect = createEl('select', 'dc-select');
  PAGE_FORMATS.forEach(f => {
    const opt = createEl('option', '', f.label);
    opt.value = f.value;
    formatSelect.appendChild(opt);
  });
  formatSelect.value = store.config.pageFormat;
  formatSelect.addEventListener('change', () => {
    store.setPageFormat(formatSelect.value);
    if (callbacks.onFormatChange) callbacks.onFormatChange();
  });
  leftGroup.appendChild(formatSelect);

  const orientBtn = createEl('button', 'dc-btn dc-btn-icon', store.config.pageOrientation === 'portrait' ? '▯' : '▭');
  orientBtn.title = 'Changer l\'orientation';
  orientBtn.addEventListener('click', () => {
    const newOrient = store.config.pageOrientation === 'portrait' ? 'landscape' : 'portrait';
    store.setPageOrientation(newOrient);
    orientBtn.textContent = newOrient === 'portrait' ? '▯' : '▭';
    if (callbacks.onFormatChange) callbacks.onFormatChange();
  });
  leftGroup.appendChild(orientBtn);

  toolbar.appendChild(leftGroup);

  const centerGroup = createEl('div', 'dc-toolbar-group dc-toolbar-add');

  BLOCK_TYPES.forEach(bt => {
    const btn = createEl('button', 'dc-btn dc-btn-add', `${bt.icon} ${bt.label}`);
    btn.title = `Ajouter un bloc ${bt.label}`;
    btn.addEventListener('click', () => {
      if (callbacks.onAddBlock) callbacks.onAddBlock(bt.type);
    });
    centerGroup.appendChild(btn);
  });

  toolbar.appendChild(centerGroup);

  const rightGroup = createEl('div', 'dc-toolbar-group');

  const editBtn = createEl('button', 'dc-btn', '✏️ Éditer');
  editBtn.title = 'Mode édition';
  editBtn.addEventListener('click', () => {
    store.setEditMode(!store.editMode);
  });

  const previewBtn = createEl('button', 'dc-btn', '👁 Aperçu');
  previewBtn.title = 'Mode aperçu';
  previewBtn.addEventListener('click', () => {
    store.setPreviewMode(!store.previewMode);
  });

  const printBtn = createEl('button', 'dc-btn dc-btn-primary', '🖨 Imprimer / PDF');
  printBtn.title = 'Imprimer ou exporter en PDF';
  printBtn.addEventListener('click', () => {
    if (callbacks.onPrint) callbacks.onPrint();
  });

  const addPageBtn = createEl('button', 'dc-btn', '➕ Page');
  addPageBtn.title = 'Ajouter une page';
  addPageBtn.addEventListener('click', () => {
    store.addPage();
  });

  rightGroup.appendChild(editBtn);
  rightGroup.appendChild(previewBtn);
  rightGroup.appendChild(addPageBtn);
  rightGroup.appendChild(printBtn);

  toolbar.appendChild(rightGroup);

  store.subscribe((state) => {
    editBtn.classList.toggle('dc-btn-active', state.editMode);
    previewBtn.classList.toggle('dc-btn-active', state.previewMode);
    toolbar.classList.toggle('dc-hidden', state.previewMode);
  });

  return toolbar;
}
