// The window to export and import the page layout as a JSON text.
import { createEl } from './utils.js';
import { buildExport, parseImport, describeConfig } from './config-io.js';

const FILE_NAME = `mise-en-page-tableau-de-bord.json`;
const MAX_NOTES_SHOWN = 12;

function downloadText(fileName, content) {
  const blob = new Blob([content], { type: `application/json` });
  const url = URL.createObjectURL(blob);
  const link = createEl(`a`);
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// callbacks.onApplied(): called after an import replaced the layout.
export function openConfigDialog(store, callbacks = {}) {
  const existing = document.querySelector(`.dc-editor-overlay`);
  if (existing) existing.remove();

  const overlay = createEl(`div`, `dc-editor-overlay`);
  const panel = createEl(`div`, `dc-editor-panel dc-io-panel`);

  const header = createEl(`div`, `dc-editor-header`);
  header.appendChild(createEl(`h3`, `dc-editor-title`, `Exporter ou importer la mise en page`));
  const closeButton = createEl(`button`, `dc-btn dc-btn-close`, `✕`);
  closeButton.addEventListener(`click`, () => overlay.remove());
  header.appendChild(closeButton);
  panel.appendChild(header);

  const body = createEl(`div`, `dc-io-body`);
  body.appendChild(createEl(`p`, `dc-io-help`,
    `La mise en page est le format de page, les pages, les blocs avec leur position, leur taille et leurs réglages. ` +
    `Les données des tables ne sont pas exportées. Un import remplace la mise en page actuelle.`));

  const textarea = createEl(`textarea`, `dc-io-text`);
  textarea.rows = 14;
  textarea.spellcheck = false;
  textarea.placeholder = `Collez ici une mise en page JSON, ou cliquez sur Exporter pour afficher la mise en page actuelle.`;
  body.appendChild(textarea);

  const message = createEl(`div`, `dc-io-message`);
  message.setAttribute(`role`, `status`);
  message.hidden = true;
  body.appendChild(message);

  const buttons = createEl(`div`, `dc-io-buttons`);
  const exportButton = createEl(`button`, `dc-btn dc-btn-primary`, `Exporter`);
  const copyButton = createEl(`button`, `dc-btn`, `Copier le texte`);
  const downloadButton = createEl(`button`, `dc-btn`, `Télécharger un fichier`);
  const fileButton = createEl(`button`, `dc-btn`, `Choisir un fichier`);
  const checkButton = createEl(`button`, `dc-btn`, `Vérifier l'import`);
  const applyButton = createEl(`button`, `dc-btn dc-btn-danger`, `Remplacer la mise en page actuelle`);
  applyButton.hidden = true;
  const fileInput = createEl(`input`);
  fileInput.type = `file`;
  fileInput.accept = `.json,application/json`;
  fileInput.hidden = true;
  [exportButton, copyButton, downloadButton, fileButton, checkButton, applyButton, fileInput].forEach((el) => buttons.appendChild(el));
  body.appendChild(buttons);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let pending = null;

  function show(kind, lines) {
    message.hidden = false;
    message.className = `dc-io-message dc-io-${kind}`;
    message.textContent = ``;
    lines.forEach((line) => message.appendChild(createEl(`p`, ``, line)));
  }

  function clearPending() {
    pending = null;
    applyButton.hidden = true;
  }

  exportButton.addEventListener(`click`, () => {
    clearPending();
    textarea.value = buildExport(store.config);
    textarea.focus();
    textarea.select();
    show(`info`, [`Mise en page actuelle affichée : ${describeConfig(store.config)}`]);
  });

  copyButton.addEventListener(`click`, async () => {
    if (!textarea.value) textarea.value = buildExport(store.config);
    textarea.focus();
    textarea.select();
    try {
      await navigator.clipboard.writeText(textarea.value);
      show(`info`, [`Texte copié dans le presse-papiers.`]);
    } catch {
      show(`info`, [`La copie automatique est bloquée ici : le texte est sélectionné, utilisez Ctrl+C.`]);
    }
  });

  downloadButton.addEventListener(`click`, () => {
    if (!textarea.value) textarea.value = buildExport(store.config);
    try {
      downloadText(FILE_NAME, textarea.value);
      show(`info`, [`Fichier ${FILE_NAME} préparé. Si rien ne se télécharge, copiez le texte du cadre dans un fichier.`]);
    } catch {
      show(`error`, [`Le téléchargement est bloqué ici : copiez le texte du cadre dans un fichier.`]);
    }
  });

  fileButton.addEventListener(`click`, () => fileInput.click());
  fileInput.addEventListener(`change`, () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    clearPending();
    const reader = new FileReader();
    reader.onload = () => {
      textarea.value = String(reader.result || ``);
      show(`info`, [`Fichier lu. Cliquez sur Vérifier l'import.`]);
    };
    reader.onerror = () => show(`error`, [`Le fichier n'a pas pu être lu.`]);
    reader.readAsText(file);
    fileInput.value = ``;
  });

  textarea.addEventListener(`input`, clearPending);

  checkButton.addEventListener(`click`, () => {
    clearPending();
    const result = parseImport(textarea.value);
    if (result.error) {
      show(`error`, [`Import impossible : ${result.error}`]);
      return;
    }
    pending = result.config;
    const lines = [`Mise en page lisible : ${describeConfig(result.config)}`];
    if (result.notes.length) {
      lines.push(`${result.notes.length} point(s) corrigé(s) ou ignoré(s) :`);
      result.notes.slice(0, MAX_NOTES_SHOWN).forEach((note) => lines.push(note));
      if (result.notes.length > MAX_NOTES_SHOWN) lines.push(`et ${result.notes.length - MAX_NOTES_SHOWN} autre(s).`);
    }
    lines.push(`Cliquez sur « Remplacer la mise en page actuelle » pour l'appliquer. Pensez à exporter l'actuelle avant si vous voulez la garder.`);
    show(result.notes.length ? `warning` : `info`, lines);
    applyButton.hidden = false;
  });

  applyButton.addEventListener(`click`, async () => {
    if (!pending) return;
    const config = pending;
    clearPending();
    await store.replaceConfig(config);
    overlay.remove();
    if (callbacks.onApplied) callbacks.onApplied();
  });

  overlay.addEventListener(`click`, (event) => {
    if (event.target === overlay) overlay.remove();
  });
  textarea.focus();
}
