import type { CropRect, Figure, FigureSide, ImageTransform, StoredImage } from '../types';

/** Untransformed orientation: no rotation, no mirroring. */
export const IDENTITY_TRANSFORM: ImageTransform = { quarterTurns: 0, flipX: false, flipY: false };

export function makeSide(imageId: string, crop: CropRect, transform = IDENTITY_TRANSFORM): FigureSide {
  return { imageId, crop, transform };
}

/** True when the transform turns the artwork onto its side, swapping width and height. */
export function isQuarterTurned(transform: ImageTransform): boolean {
  return transform.quarterTurns % 2 === 1;
}

/** Width divided by height of the cropped artwork, after rotation. */
export function sideAspect(side: FigureSide): number {
  const { width, height } = side.crop;
  return isQuarterTurned(side.transform) ? height / width : width / height;
}

/** Front and back of a figure, as far as it has them. What a flat mini prints. */
export function figureSides(figure: Pick<Figure, 'front' | 'back'>): FigureSide[] {
  return figure.back ? [figure.front, figure.back] : [figure.front];
}

/** Every side that ends up on paper for this figure's shape. */
export function printedSides(figure: Pick<Figure, 'shape' | 'front' | 'back' | 'left'>): FigureSide[] {
  const sides = figureSides(figure);
  return figure.shape === 'prism' && figure.left ? [...sides, figure.left] : sides;
}

/**
 * Images still referenced by a figure, including sides its current shape does not print, so that
 * switching a prism to flat and back again finds its front-left face intact.
 */
export function figureImageIds(figure: Pick<Figure, 'front' | 'back' | 'left'>): string[] {
  const sides = [figure.front, figure.back, figure.left].filter((side): side is FigureSide => side !== null);
  return [...new Set(sides.map((side) => side.imageId))];
}

/** The main image mirrored, which is what a prism's front-left face shows until it gets its own. */
export function mirrored(side: FigureSide): FigureSide {
  return { ...side, transform: { ...side.transform, flipX: !side.transform.flipX } };
}

/**
 * The back of a flat mini as seen from behind: its own artwork, or the main image mirrored.
 * The mirrored main image is what makes a flat mini look like the same figure from both sides.
 */
export function flatBack(figure: Pick<Figure, 'front' | 'back'>): FigureSide {
  return figure.back ?? mirrored(figure.front);
}

/** Rotates by a quarter turn and normalises back into 0-3, so the UI can just add or subtract 1. */
export function rotateSide(transform: ImageTransform, direction: 1 | -1): ImageTransform {
  return { ...transform, quarterTurns: (((transform.quarterTurns + direction) % 4) + 4) % 4 as 0 | 1 | 2 | 3 };
}

/** Applies a side's rotation and mirroring to the canvas, around the centre of a width x height box. */
export function applyTransform(
  ctx: CanvasRenderingContext2D,
  transform: ImageTransform,
  width: number,
  height: number,
): void {
  ctx.translate(width / 2, height / 2);
  ctx.rotate((transform.quarterTurns * Math.PI) / 2);
  ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
  // After a quarter turn the box is the other way round, so undo using the pre-rotation extent.
  const [w, h] = isQuarterTurned(transform) ? [height, width] : [width, height];
  ctx.translate(-w / 2, -h / 2);
}

/** The full image as a crop, used when a side has no meaningful crop of its own. */
export function fullCrop(image: Pick<StoredImage, 'width' | 'height'>): CropRect {
  return { x: 0, y: 0, width: image.width, height: image.height };
}
