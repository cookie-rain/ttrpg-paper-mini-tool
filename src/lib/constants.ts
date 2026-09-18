import type { BaseColor, PaperSize, Settings, SizeCategory } from '../types';

export const MM_PER_INCH = 25.4;
/** One battle map square. */
export const GRID_SQUARE_MM = MM_PER_INCH;
export const METRES_PER_FOOT = 0.3048;

/**
 * In-game size (metres) at each size category line. Sizes in between are interpolated linearly:
 * Small 1 m, Medium 1.8 m, Large 3–5 m, Huge 5–10 m, Gargantuan 10 m and more.
 */
export const IN_GAME_METRES: Record<SizeCategory, number> = {
  small: 1,
  medium: 1.8,
  large: 3,
  huge: 5,
  gargantuan: 10,
};
export const PRINT_DPI = 300;
/** Below this effective resolution a figure is flagged as blurry when printed. */
export const LOW_DPI_WARNING = 200;
export const MIN_FIGURE_HEIGHT_MM = 8;
/** Width of the trapezoid glue tab that closes a prism. */
export const GLUE_TAB_MM = 8;
/** How far each end of the glue tab tapers in, so it slides behind the opposite panel. */
export const GLUE_TAB_TAPER_MM = 1.5;

/** Portrait dimensions. Order defines the order in the paper selector. */
export const PAPER_SIZES_MM: Record<PaperSize, { width: number; height: number; label: string }> = {
  a5: { width: 148, height: 210, label: 'A5' },
  a4: { width: 210, height: 297, label: 'A4' },
  a3: { width: 297, height: 420, label: 'A3' },
  letter: { width: 215.9, height: 279.4, label: 'US Letter' },
  legal: { width: 215.9, height: 355.6, label: 'US Legal' },
  tabloid: { width: 279.4, height: 431.8, label: 'Tabloid (11 × 17 in)' },
};

export const SIZE_CATEGORIES: { id: SizeCategory; label: string; squares: number }[] = [
  { id: 'small', label: 'Small', squares: 1 },
  { id: 'medium', label: 'Medium', squares: 1 },
  { id: 'large', label: 'Large', squares: 2 },
  { id: 'huge', label: 'Huge', squares: 3 },
  { id: 'gargantuan', label: 'Gargantuan', squares: 4 },
];

/** Muted colours that print well; text colour is picked per colour for contrast. */
export const BASE_COLORS: Record<BaseColor, { label: string; hex: string | null }> = {
  none: { label: 'None', hex: null },
  blue: { label: 'Blue', hex: '#3d6b99' },
  red: { label: 'Red', hex: '#a8423f' },
  green: { label: 'Green', hex: '#4c8052' },
  yellow: { label: 'Yellow', hex: '#e3bf4a' },
  gray: { label: 'Gray', hex: '#8c8c8c' },
  // Resolved per figure; see figureColorHex.
  custom: { label: 'Custom', hex: null },
};

/** Starting point of the custom colour picker. */
export const DEFAULT_CUSTOM_COLOR = '#7a4fb8';

export const DEFAULT_SETTINGS: Settings = {
  unit: 'mm',
  paper: 'a4',
  marginMm: 6,
  gapMm: 0,
  cutLines: 'solid',
  foldLine: 'dashed',
  colorStyle: 'fill',
  baseStyle: 'stand',
  packing: 'rows',
  baseHeightMm: 10,
  minWidthMm: 22,
  flatText: true,
  calibrationRuler: true,
  glueTab: true,
  prismLabel: 'text',
  prismLabelPlacement: 'around',
  prismLabelHeightMm: 7,
  prismWidths: 'auto',
  customColors: [],
  // 1, 1.5, 2.5, 4 and 6 inches.
  categoryHeightsMm: { small: 25.4, medium: 38.1, large: 63.5, huge: 101.6, gargantuan: 152.4 },
};

/** Reference heights of earlier versions; saved projects still using them get the current defaults. */
export const LEGACY_CATEGORY_HEIGHTS_MM = { small: 25, medium: 35, large: 50, huge: 75 };

export const DEFAULT_FIGURE_HEIGHT_MM = DEFAULT_SETTINGS.categoryHeightsMm.medium;
