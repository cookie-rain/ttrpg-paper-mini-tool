import type { Figure, FigureSide, Settings, SideKey } from '../types';
import { GLUE_TAB_MM, MIN_FIGURE_HEIGHT_MM, MM_PER_INCH, PAPER_SIZES_MM } from './constants';
import { figureSides, isQuarterTurned, mirrored, printedSides, sideAspect } from './sides';

/** Printed size of one piece of artwork at the given height. */
export function sideSize(side: FigureSide, heightMm: number): { width: number; height: number } {
  return { width: heightMm * sideAspect(side), height: heightMm };
}

/** Printed image size of a figure's front artwork (one side of the fold on a flat mini). */
export function figureImageSize(figure: Pick<Figure, 'front' | 'heightMm'>): { width: number; height: number } {
  return sideSize(figure.front, figure.heightMm);
}

/** Widest piece of artwork on a figure, which is what the card has to accommodate. */
export function widestSideMm(figure: Pick<Figure, 'front' | 'back' | 'heightMm'>): number {
  return Math.max(...figureSides(figure).map((side) => sideSize(side, figure.heightMm).width));
}

/**
 * Length of the reinforcement flap below the front base strip (folded base only).
 * It is folded under the foot and covers both base strips.
 */
export function flapHeightMm(settings: Settings): number {
  return settings.baseStyle === 'folded' ? 2 * settings.baseHeightMm : 0;
}

/** Width of the glue tab, or 0 when the tube is meant to be taped shut instead. */
export function glueTabMm(settings: Settings): number {
  return settings.glueTab ? GLUE_TAB_MM : 0;
}

/** Height of the band along the bottom of a prism. Zero when nothing is printed there. */
export function prismBandMm(settings: Settings): number {
  return settings.prismLabel === 'none' ? 0 : settings.prismLabelHeightMm;
}

/**
 * Printed width of the three faces of a prism: front right (the main image), front left (its own
 * artwork, or the main image mirrored) and back. A face without artwork of its own takes the main
 * image's width. 'equal' squares the tube off by giving every face the widest.
 */
export function prismPanelWidths(
  figure: Pick<Figure, 'front' | 'back' | 'left' | 'heightMm'>,
  settings: Settings,
): { right: number; left: number; back: number } {
  const width = (side: Figure['front'] | null) => (side ? sideSize(side, figure.heightMm).width : right);
  const right = sideSize(figure.front, figure.heightMm).width;
  const left = width(figure.left);
  const back = width(figure.back);
  if (settings.prismWidths === 'equal') {
    const widest = Math.max(right, left, back);
    return { right: widest, left: widest, back: widest };
  }
  return { right, left, back };
}

/**
 * The faces of a prism in the order they are printed, left to right: front right (the main image) and
 * front left side by side, so the figure's front edge is a plain fold, then the back. The glue tab, if
 * any, follows the back and closes the tube there. `side` is null for a back face left blank.
 */
export function prismFaces(
  figure: Pick<Figure, 'front' | 'back' | 'left' | 'heightMm'>,
  settings: Settings,
): { key: SideKey; x: number; width: number; side: FigureSide | null }[] {
  const widths = prismPanelWidths(figure, settings);
  return [
    { key: 'front', x: 0, width: widths.right, side: figure.front },
    { key: 'left', x: widths.right, width: widths.left, side: figure.left ?? mirrored(figure.front) },
    { key: 'back', x: widths.right + widths.left, width: widths.back, side: figure.back },
  ];
}

/**
 * Size of the unfolded card:
 *
 *   +-----------+  back base strip (text rotated 180°)
 *   |  image    |  back image (mirrored vertically)
 *   +- - fold - +
 *   |  image    |  front image
 *   +-----------+  front base strip
 *   |  flap     |  reinforcement flap (folded base only, 2 × base strip)
 *   +-----------+
 */
export function cardSize(
  figure: Pick<Figure, 'shape' | 'front' | 'back' | 'left' | 'heightMm'>,
  settings: Settings,
): { width: number; height: number } {
  if (figure.shape === 'prism') {
    // One strip of three faces, closed into a triangular tube. No fold at the top, no base strip.
    const { right, left, back } = prismPanelWidths(figure, settings);
    return { width: right + left + back + glueTabMm(settings), height: figure.heightMm + prismBandMm(settings) };
  }
  return {
    width: Math.max(widestSideMm(figure), settings.minWidthMm),
    height: 2 * (figure.heightMm + settings.baseHeightMm) + flapHeightMm(settings),
  };
}

/** Area on the page that cards can be placed in. */
export function printableArea(settings: Settings): { width: number; height: number } {
  const paper = PAPER_SIZES_MM[settings.paper];
  return {
    width: paper.width - 2 * settings.marginMm,
    height: paper.height - 2 * settings.marginMm - footerReserveMm(settings),
  };
}

/**
 * Vertical space reserved at the bottom of each page for the footer:
 * enough for the calibration rulers, or just for the page number when they are switched off.
 */
export function footerReserveMm(settings: Settings): number {
  return settings.calibrationRuler ? 8 : 4;
}

/**
 * Largest image height that still fits on a single sheet, either upright or rotated by 90°.
 * The card width is max(imageWidth, minWidth), so both constraints are checked separately.
 */
export function maxFigureHeightMm(
  figure: Pick<Figure, 'shape' | 'front' | 'back' | 'left'>,
  settings: Settings,
): number {
  const area = printableArea(settings);
  const fit = figure.shape === 'prism' ? prismFit(figure, settings) : flatFit(figure, settings);
  const best = Math.max(fit(area.width, area.height), fit(area.height, area.width));
  return Math.max(MIN_FIGURE_HEIGHT_MM, Math.floor(best * 10) / 10);
}

/** Largest height of a flat card that fits into the given space. */
function flatFit(figure: Pick<Figure, 'front' | 'back'>, settings: Settings) {
  const aspect = Math.max(...figureSides(figure).map(sideAspect));
  return (availWidth: number, availHeight: number) => {
    if (settings.minWidthMm > availWidth) return 0;
    const byHeight = (availHeight - flapHeightMm(settings)) / 2 - settings.baseHeightMm;
    const byWidth = availWidth / aspect;
    return Math.max(0, Math.min(byHeight, byWidth));
  };
}

/**
 * Largest height of a prism that fits. Its width grows linearly with the height
 * (two side faces plus the back face), with the glue tab added on top as a constant.
 */
function prismFit(figure: Pick<Figure, 'front' | 'back' | 'left'>, settings: Settings) {
  const frontAspect = sideAspect(figure.front);
  const backAspect = figure.back ? sideAspect(figure.back) : frontAspect;
  const leftAspect = figure.left ? sideAspect(figure.left) : frontAspect;
  const widthPerMm =
    settings.prismWidths === 'equal'
      ? 3 * Math.max(frontAspect, backAspect, leftAspect)
      : frontAspect + backAspect + leftAspect;
  const tab = glueTabMm(settings);
  return (availWidth: number, availHeight: number) => {
    const byWidth = (availWidth - tab) / widthPerMm;
    const byHeight = availHeight - prismBandMm(settings);
    return Math.max(0, Math.min(byHeight, byWidth));
  };
}

/** Effective print resolution of a figure, taken from whichever side prints most coarsely. */
export function effectiveDpi(figure: Pick<Figure, 'shape' | 'front' | 'back' | 'left' | 'heightMm'>): number {
  const pixelsAlongHeight = (side: FigureSide) =>
    isQuarterTurned(side.transform) ? side.crop.width : side.crop.height;
  return Math.min(...printedSides(figure).map((side) => pixelsAlongHeight(side) / (figure.heightMm / MM_PER_INCH)));
}
