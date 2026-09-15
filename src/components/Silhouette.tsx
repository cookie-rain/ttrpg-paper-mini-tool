import type { SizeCategory } from '../types';
import smallUrl from '../assets/silhouettes/small.png';
import mediumUrl from '../assets/silhouettes/medium.png';
import largeUrl from '../assets/silhouettes/large.png';
import hugeUrl from '../assets/silhouettes/huge.png';
import gargantuanUrl from '../assets/silhouettes/gargantuan.png';

/**
 * Reference silhouette images, trimmed so the feet touch the bottom edge.
 * `aspect` is width / height of the image. `overshoot` is the fraction of the image height that sticks out
 * above the category height (e.g. horns that should not count towards the height).
 */
export const SILHOUETTES: Record<SizeCategory, { url: string; aspect: number; overshoot: number }> = {
  small: { url: smallUrl, aspect: 579 / 800, overshoot: 0 },
  medium: { url: mediumUrl, aspect: 391 / 800, overshoot: 0 },
  large: { url: largeUrl, aspect: 615 / 800, overshoot: 0 },
  huge: { url: hugeUrl, aspect: 534 / 800, overshoot: 0 },
  gargantuan: { url: gargantuanUrl, aspect: 429 / 800, overshoot: 0 },
};

/** Rendered image size for a category height, including any overshoot. */
export function silhouetteSizeMm(category: SizeCategory, categoryHeightMm: number): { width: number; height: number } {
  const { aspect, overshoot } = SILHOUETTES[category];
  const height = categoryHeightMm / (1 - overshoot);
  return { width: height * aspect, height };
}

/**
 * A size reference silhouette. The image is used as a mask so its colour comes from the theme
 * (see the `--silhouette-*` CSS variables): the bigger the category, the darker the shade.
 */
export function Silhouette({
  category,
  heightPx,
  leftPx,
}: {
  category: SizeCategory;
  /** Height of the whole image in pixels (including overshoot). */
  heightPx: number;
  leftPx?: number;
}) {
  const { url, aspect } = SILHOUETTES[category];
  const mask = `url("${url}") center / 100% 100% no-repeat`;
  return (
    <div
      className={`silhouette silhouette-${category}`}
      style={{ width: heightPx * aspect, height: heightPx, left: leftPx, mask, WebkitMask: mask }}
      aria-hidden="true"
    />
  );
}
