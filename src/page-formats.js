export const PAGE_FORMATS = {
  A3: { width: 1123, height: 1587, label: 'A3' },
  A4: { width: 794, height: 1123, label: 'A4' },
  A5: { width: 559, height: 794, label: 'A5' },
  screen: { width: 1280, height: 720, label: 'Écran (16:9)' },
  square: { width: 1000, height: 1000, label: 'Carré (1:1)' },
  custom: { width: 800, height: 600, label: 'Personnalisé' },
};

export const PAGE_MARGIN = 40;

export function getPageDimensions(format, orientation) {
  const fmt = PAGE_FORMATS[format] || PAGE_FORMATS.A4;
  if (orientation === 'landscape') {
    return { width: fmt.height, height: fmt.width };
  }
  return { width: fmt.width, height: fmt.height };
}

export function getPrintSize(format, orientation) {
  const map = {
    A3: 'A3',
    A4: 'A4',
    A5: 'A5',
    screen: '1280px 720px',
    square: '1000px 1000px',
  };
  const size = map[format] || 'A4';
  const orient = orientation === 'landscape' ? 'landscape' : 'portrait';
  return orient === 'landscape' ? `${size} landscape` : `${size} portrait`;
}
