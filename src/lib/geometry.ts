import type { CropRect, Figure, ImageFit, Settings } from '../types';
import { MIN_FIGURE_HEIGHT_MM, MM_PER_INCH, PAPER_SIZES_MM } from './constants';

/** Source crop and centred destination for artwork fitted into a fixed-size box. */
export function fitImage(
  crop: CropRect,
  width: number,
  height: number,
  fit: ImageFit,
): { source: CropRect; destination: CropRect } {
  const source = { ...crop };
  const destination = { x: 0, y: 0, width, height };
  if (fit === 'contain') {
    const scale = Math.min(width / crop.width, height / crop.height);
    destination.width = crop.width * scale;
    destination.height = crop.height * scale;
    destination.x = (width - destination.width) / 2;
    destination.y = (height - destination.height) / 2;
  } else if (fit === 'cover') {
    const scale = Math.max(width / crop.width, height / crop.height);
    source.width = width / scale;
    source.height = height / scale;
    source.x += (crop.width - source.width) / 2;
    source.y += (crop.height - source.height) / 2;
  }
  return { source, destination };
}

/** Printed image size of a figure (one side of the fold). */
export function figureImageSize(figure: Pick<Figure, 'frontImage' | 'heightMm'>): { width: number; height: number } {
  const aspect = figure.frontImage.crop.width / figure.frontImage.crop.height;
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
export function cardSize(figure: Pick<Figure, 'frontImage' | 'heightMm'>, settings: Settings): { width: number; height: number } {
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
export function maxFigureHeightMm(crop: Figure['frontImage']['crop'], settings: Settings): number {
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
export function effectiveDpi(figure: Pick<Figure, 'frontImage' | 'heightMm'>): number {
  return figure.frontImage.crop.height / (figure.heightMm / MM_PER_INCH);
}
