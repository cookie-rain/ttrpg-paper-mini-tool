import type { Figure, FigureSide, Settings, SideKey } from '../types';
import { GLUE_TAB_MM, MIN_FIGURE_HEIGHT_MM, MM_PER_INCH, PAPER_SIZES_MM } from './constants';
import { figureSides, isQuarterTurned, printedSides, PRISM_SIDES, sideAspect } from './sides';

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

/** Height of the band along the bottom of a prism. Zero when nothing is printed on any face. */
export function prismBandMm(settings: Settings): number {
  const anywhere = PRISM_SIDES.some(({ key }) => settings.prismBandSides[key]);
  return settings.prismLabel === 'none' || !anywhere ? 0 : settings.prismLabelHeightMm;
}

/**
 * Width the artwork on one face takes, before any manual width is applied. A face left blank still needs
 * a width to stand on, and takes the main image's.
 */
export function faceArtworkWidthMm(
  figure: Pick<Figure, 'front' | 'back' | 'left' | 'heightMm'>,
  key: SideKey,
): number {
  // A face without artwork of its own is as wide as the main image: Side B mirrors it, Side C is blank.
  const side = figure[key] ?? figure.front;
  return sideSize(side, figure.heightMm).width;
}

/**
 * Printed width of each face of a prism. A face is as wide as its artwork, or wider if a width was
 * typed in for it; with `prismWidths: 'equal'` all three take the widest of those, and the artwork sits
 * in the extra space according to the face's alignment.
 */
export function prismPanelWidths(
  figure: Pick<Figure, 'front' | 'back' | 'left' | 'heightMm' | 'faces'>,
  settings: Settings,
): Record<SideKey, number> {
  const own = (key: SideKey) => Math.max(faceArtworkWidthMm(figure, key), figure.faces[key].widthMm ?? 0);
  const widths = { front: own('front'), left: own('left'), back: own('back') };
  if (settings.prismWidths !== 'equal') return widths;
  const widest = Math.max(widths.front, widths.left, widths.back);
  return { front: widest, left: widest, back: widest };
}

/**
 * Whether the three faces can actually be folded into a tube. Two faces have to reach across the third,
 * so the widest one has to stay narrower than the other two together -- the triangle inequality. A face
 * made very wide, by its artwork or by hand, leaves the other two too short to meet and be glued.
 */
export function prismCloses(widths: Record<SideKey, number>): boolean {
  const sides = [widths.front, widths.left, widths.back];
  const widest = Math.max(...sides);
  const others = sides.reduce((sum, width) => sum + width, 0) - widest;
  // A hair of margin: faces that only just meet leave a flat triangle with nothing to glue.
  return others > widest + 0.5;
}

/**
 * The faces of a prism in the order they are printed, left to right: Side A (the main image) and Side B
 * side by side, so the figure's front edge is a plain fold, then Side C. The glue tab, if any, follows
 * Side C and closes the tube there. `side` is null for a face left blank.
 */
export function prismStrip(
  figure: Pick<Figure, 'front' | 'back' | 'left' | 'heightMm' | 'faces'>,
  settings: Settings,
): { key: SideKey; x: number; width: number; align: number; side: FigureSide | null }[] {
  const widths = prismPanelWidths(figure, settings);
  const sides: Record<SideKey, FigureSide | null> = {
    front: figure.front,
    left: figure.left,
    back: figure.back,
  };
  let x = 0;
  return PRISM_SIDES.map(({ key }) => {
    const face = { key, x, width: widths[key], align: figure.faces[key].align, side: sides[key] };
    x += widths[key];
    return face;
  });
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
  figure: Pick<Figure, 'shape' | 'front' | 'back' | 'left' | 'heightMm' | 'faces'>,
  settings: Settings,
): { width: number; height: number } {
  if (figure.shape === 'prism') {
    // One strip of three faces, closed into a triangular tube. No fold at the top, no base strip.
    const widths = prismPanelWidths(figure, settings);
    const total = widths.front + widths.left + widths.back;
    return { width: total + glueTabMm(settings), height: figure.heightMm + prismBandMm(settings) };
  }
  return {
    // A width set by hand widens the card the same way the stand minimum does.
    width: Math.max(widestSideMm(figure), settings.minWidthMm, figure.faces.front.widthMm ?? 0),
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
  figure: Pick<Figure, 'shape' | 'front' | 'back' | 'left' | 'faces'>,
  settings: Settings,
): number {
  const area = printableArea(settings);
  const fit = figure.shape === 'prism' ? prismFit(figure, settings) : flatFit(figure, settings);
  const best = Math.max(fit(area.width, area.height), fit(area.height, area.width));
  return Math.max(MIN_FIGURE_HEIGHT_MM, Math.floor(best * 10) / 10);
}

/** Largest height of a flat card that fits into the given space. */
function flatFit(figure: Pick<Figure, 'front' | 'back' | 'faces'>, settings: Settings) {
  const aspect = Math.max(...figureSides(figure).map(sideAspect));
  // Neither the stand minimum nor a width set by hand shrinks with the figure.
  const fixedWidth = Math.max(settings.minWidthMm, figure.faces.front.widthMm ?? 0);
  return (availWidth: number, availHeight: number) => {
    if (fixedWidth > availWidth) return 0;
    const byHeight = (availHeight - flapHeightMm(settings)) / 2 - settings.baseHeightMm;
    const byWidth = availWidth / aspect;
    return Math.max(0, Math.min(byHeight, byWidth));
  };
}

/**
 * Largest height of a prism that fits. A width typed in by hand does not shrink with the height, so the
 * card's width is not a plain multiple of it; the largest fitting height is found by bisection instead.
 */
function prismFit(figure: Pick<Figure, 'front' | 'back' | 'left' | 'faces'>, settings: Settings) {
  const widthAt = (heightMm: number) => {
    const widths = prismPanelWidths({ ...figure, heightMm }, settings);
    return widths.front + widths.left + widths.back + glueTabMm(settings);
  };
  return (availWidth: number, availHeight: number) => {
    const byHeight = availHeight - prismBandMm(settings);
    if (byHeight <= 0 || widthAt(0) > availWidth) return 0;
    if (widthAt(byHeight) <= availWidth) return byHeight;
    let low = 0;
    let high = byHeight;
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (widthAt(mid) <= availWidth) low = mid;
      else high = mid;
    }
    return low;
  };
}

/** Effective print resolution of a figure, taken from whichever side prints most coarsely. */
export function effectiveDpi(figure: Pick<Figure, 'shape' | 'front' | 'back' | 'left' | 'heightMm'>): number {
  const pixelsAlongHeight = (side: FigureSide) =>
    isQuarterTurned(side.transform) ? side.crop.width : side.crop.height;
  return Math.min(...printedSides(figure).map((side) => pixelsAlongHeight(side) / (figure.heightMm / MM_PER_INCH)));
}
