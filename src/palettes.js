export const PALETTES = {
  'palette-1': {
    name: 'Classique',
    colors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
  },
  'palette-2': {
    name: 'Terreux',
    colors: ['#2E86AB', '#A23B72', '#F18F01', '#C73E1D', '#3B1F2B', '#6A994E', '#BC4B51', '#5F8F5F', '#E4C580', '#8B8B5A'],
  },
  'palette-3': {
    name: 'Méditerranéen',
    colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#457b9d', '#1d3557', '#a8dadc', '#f1faee', '#8ecae6'],
  },
  'palette-4': {
    name: 'Moderne',
    colors: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'],
  },
};

export function getPaletteColors(paletteId) {
  const palette = PALETTES[paletteId] || PALETTES['palette-1'];
  return palette.colors;
}
