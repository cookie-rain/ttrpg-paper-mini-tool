import type { CropRect, StoredImage } from '../types';

const ALPHA_THRESHOLD = 8;
const COLOR_TOLERANCE = 18;

/** Cache of decoded images so canvases can draw them synchronously. */
const decoded = new Map<string, Promise<HTMLImageElement>>();

/** Drops cached decodes, so deleting figures actually frees their pixel data again. */
export function forgetImages(dataUrls: Iterable<string>): void {
  for (const url of dataUrls) decoded.delete(url);
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  let promise = decoded.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = src;
    });
    decoded.set(src, promise);
  }
  return promise;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function importImageFile(file: File, id: string): Promise<{ image: StoredImage; trim: CropRect }> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(dataUrl);
  const image: StoredImage = { id, dataUrl, width: img.naturalWidth, height: img.naturalHeight };
  return { image, trim: findContentBounds(img) };
}

/**
 * Finds the bounding box of the actual figure.
 * Transparent images are trimmed by alpha; fully opaque images are trimmed by the colour of the top-left pixel
 * (useful for artwork on a plain white background).
 */
export function findContentBounds(img: HTMLImageElement): CropRect {
  const { naturalWidth: width, naturalHeight: height } = img;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const full: CropRect = { x: 0, y: 0, width, height };
  if (!ctx) return full;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;

  let hasTransparency = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255 - ALPHA_THRESHOLD) {
      hasTransparency = true;
      break;
    }
  }

  const [r0, g0, b0] = [data[0], data[1], data[2]];
  const isContent = (i: number) =>
    hasTransparency
      ? data[i + 3] > ALPHA_THRESHOLD
      : Math.abs(data[i] - r0) > COLOR_TOLERANCE ||
        Math.abs(data[i + 1] - g0) > COLOR_TOLERANCE ||
        Math.abs(data[i + 2] - b0) > COLOR_TOLERANCE;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (isContent(row + x * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return full;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
