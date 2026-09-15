import type { Figure, Settings } from '../types';
import { MIN_FIGURE_HEIGHT_MM, MM_PER_INCH, PAPER_SIZES_MM } from './constants';

/** Printed image size of a figure (one side of the fold). */
export function figureImageSize(figure: Pick<Figure, 'crop' | 'heightMm'>): { width: number; height: number } {
  const aspect = figure.crop.width / figure.crop.height;
  return { width: figure.heightMm * aspect, height: figure.heightMm };
}

/**
 * Length of the reinforcement flap below the front base strip (folded base only).
 * It is folded under the foot and covers both base strips.
 */
export function flapHeightMm(settings: Settings): number {
  return settings.baseStyle === 'folded' ? 2 * settings.baseHeightMm : 0;
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
export function cardSize(figure: Pick<Figure, 'crop' | 'heightMm'>, settings: Settings): { width: number; height: number } {
  const image = figureImageSize(figure);
  return {
    width: Math.max(image.width, settings.minWidthMm),
    height: 2 * (image.height + settings.baseHeightMm) + flapHeightMm(settings),
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
export function maxFigureHeightMm(crop: Figure['crop'], settings: Settings): number {
  const area = printableArea(settings);
  const aspect = crop.width / crop.height;
  const fit = (availWidth: number, availHeight: number) => {
    if (settings.minWidthMm > availWidth) return 0;
    const byHeight = (availHeight - flapHeightMm(settings)) / 2 - settings.baseHeightMm;
    const byWidth = availWidth / aspect;
    return Math.max(0, Math.min(byHeight, byWidth));
  };
  const best = Math.max(fit(area.width, area.height), fit(area.height, area.width));
  return Math.max(MIN_FIGURE_HEIGHT_MM, Math.floor(best * 10) / 10);
}

/** Effective print resolution of the cropped image at its printed size. */
export function effectiveDpi(figure: Pick<Figure, 'crop' | 'heightMm'>): number {
  return figure.crop.height / (figure.heightMm / MM_PER_INCH);
}
