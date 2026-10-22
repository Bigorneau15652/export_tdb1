import { getPrintSize } from './page-formats.js';

export function setupPrintStyles(store) {
  const existingStyle = document.getElementById('dc-print-styles');
  if (existingStyle) existingStyle.remove();

  const style = document.createElement('style');
  style.id = 'dc-print-styles';

  const printSize = getPrintSize(store.config.pageFormat, store.config.pageOrientation);

  style.textContent = `
    @media print {
      @page {
        size: ${printSize};
        margin: 0;
      }

      body {
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
      }

      .dc-toolbar,
      .dc-editor-overlay,
      .dc-block-toolbar,
      .dc-block-resize-handle,
      .dc-block-edit-btn,
      .dc-block-delete-btn,
      .dc-page-indicator,
      .dc-empty-state {
        display: none !important;
      }

      #app {
        display: block !important;
      }

      .dc-pages-container {
        display: block !important;
      }

      .dc-page {
        box-shadow: none !important;
        margin: 0 !important;
        page-break-after: always;
        break-after: page;
        position: relative !important;
        overflow: hidden !important;
      }

      .dc-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }

      .dc-block {
        box-shadow: none !important;
        border: none !important;
        position: absolute !important;
      }

      .dc-block-content {
        overflow: visible !important;
      }

      .dc-chart-canvas {
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }

      .dc-data-table {
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }

      .dc-data-table th {
        background-color: #e8e8e8 !important;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }

      .dc-tr-footer td {
        font-weight: bold !important;
        border-top: 2px solid #333 !important;
      }

      * {
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }
    }
  `;

  document.head.appendChild(style);
}

export function printDashboard() {
  window.print();
}
