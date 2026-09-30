/**
 * The outline drawn around a figure: the artwork's own shape, grown outwards by a fixed distance and
 * filled with one colour, printed underneath the artwork.
 *
 * Growing it is a distance problem, not a scaling one. Scaling a copy of the artwork up from its centre
 * — the obvious trick — moves every pixel by an amount that depends on how far it sits from that centre,
 * so an outstretched arm ends up with a thinner edge than the body and a figure standing off-centre gets
 * a lopsided one. Measuring the distance to the artwork instead gives the same thickness everywhere,
 * around holes as readily as around the silhouette.
 *
 * Which distance is measured decides what happens at a corner, and there is no free choice: a line of
 * even thickness in every direction is exactly the one that rounds every corner off to its radius. See
 * `OutlineCorners` for the trade, and `DEFAULT_OUTLINE_CORNERS` for where this lands.
 */

/** Stands in for infinity: large enough to lose against any real distance, small enough to stay finite. */
const INF = 1e20;

/** How corners are turned unless something says otherwise. */
export const DEFAULT_OUTLINE_CORNERS: OutlineCorners = 'chamfer';

/** Alpha at or below this counts as empty, matching the trim in `image.ts`. */
export const OUTLINE_ALPHA_THRESHOLD = 8;

/**
 * Squared distance transform of one row, in place (Felzenszwalb & Huttenlocher).
 *
 * It walks the lower envelope of the parabolas rooted at each sample, which is what makes the whole
 * transform linear in the number of pixels rather than quadratic in the radius: a thick outline costs
 * exactly as much as a thin one.
 */
function transformRow(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Squared distance from every pixel to the nearest set pixel of `mask`, in pixels.
 * Zero where the mask is set. Separable: columns first, then rows.
 */
export function squaredDistanceField(mask: Uint8Array, width: number, height: number): Float64Array {
  const field = new Float64Array(width * height);
  for (let i = 0; i < field.length; i++) field[i] = mask[i] ? 0 : INF;

  const longest = Math.max(width, height);
  const f = new Float64Array(longest);
  const d = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = field[y * width + x];
    transformRow(f, d, v, z, height);
    for (let y = 0; y < height; y++) field[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = field[row + x];
    transformRow(f, d, v, z, width);
    for (let x = 0; x < width; x++) field[row + x] = d[x];
  }
  return field;
}

/**
 * Two-pass chamfer distance, where a straight step costs `straight` and a diagonal one `diagonal`.
 * With both at 1 this measures Chebyshev distance; with the diagonal unreachable, Manhattan.
 */
function chamferDistance(
  mask: Uint8Array,
  width: number,
  height: number,
  straight: number,
  diagonal: number,
): Float64Array {
  const d = new Float64Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let best = d[i];
      if (y > 0) {
        best = Math.min(best, d[i - width] + straight);
        if (x > 0) best = Math.min(best, d[i - width - 1] + diagonal);
        if (x < width - 1) best = Math.min(best, d[i - width + 1] + diagonal);
      }
      if (x > 0) best = Math.min(best, d[i - 1] + straight);
      d[i] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let best = d[i];
      if (y < height - 1) {
        best = Math.min(best, d[i + width] + straight);
        if (x > 0) best = Math.min(best, d[i + width - 1] + diagonal);
        if (x < width - 1) best = Math.min(best, d[i + width + 1] + diagonal);
      }
      if (x < width - 1) best = Math.min(best, d[i + 1] + straight);
      d[i] = best;
    }
  }
  return d;
}

/**
 * How the outline turns a corner.
 *
 * 'round' keeps exactly the same thickness in every direction, and pays for it by rounding every corner
 * off to the radius. 'square' keeps corners square but reaches 41% further along the diagonals than along
 * the axes, so a sloped edge carries a visibly fatter line. 'chamfer' is the middle: corners survive with
 * a small bevel, and the thickness varies by 8%.
 */
export type OutlineCorners = 'round' | 'chamfer' | 'square';

/** Distance from every pixel to the artwork, measured the way `corners` calls for. */
function distanceTo(
  mask: Uint8Array,
  width: number,
  height: number,
  corners: OutlineCorners,
): Float64Array {
  if (corners === 'square') return chamferDistance(mask, width, height, 1, 1);
  if (corners === 'chamfer') {
    // The octagon is where the square and the diamond meet: neither reaches further than the other.
    const square = chamferDistance(mask, width, height, 1, 1);
    const diamond = chamferDistance(mask, width, height, 1, INF);
    const out = new Float64Array(square.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(square[i], diamond[i] / Math.SQRT2);
    return out;
  }
  const squared = squaredDistanceField(mask, width, height);
  const out = new Float64Array(squared.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(squared[i]);
  return out;
}

/**
 * Coverage of the outline for every pixel: the artwork's shape grown outwards by `radiusPx`.
 *
 * Full inside the artwork and out to the radius, fading over the last pixel so the edge is not stepped,
 * and empty beyond. The artwork is printed on top of it, so the filled middle never shows.
 */
export function outlineCoverage(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  radiusPx: number,
  corners: OutlineCorners = DEFAULT_OUTLINE_CORNERS,
  threshold = OUTLINE_ALPHA_THRESHOLD,
): Uint8ClampedArray {
  const coverage = new Uint8ClampedArray(width * height);
  if (radiusPx <= 0 || width <= 0 || height <= 0) return coverage;

  const mask = new Uint8Array(width * height);
  let any = false;
  for (let i = 0; i < mask.length; i++) {
    if (alpha[i * 4 + 3] > threshold) {
      mask[i] = 1;
      any = true;
    }
  }
  // Nothing to grow: an image that is empty by this measure would otherwise come back solid, because
  // every pixel is infinitely far from an artwork that is not there.
  if (!any) return coverage;

  const distance = distanceTo(mask, width, height, corners);
  for (let i = 0; i < coverage.length; i++) {
    // Half a pixel of feathering, centred on the radius, is one pixel of anti-aliasing at the rim.
    coverage[i] = Math.round(255 * Math.min(1, Math.max(0, radiusPx + 0.5 - distance[i])));
  }
  return coverage;
}

/** Splits `#rrggbb` into its three channels. */
export function outlineRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Turns a drawn piece of artwork into its outline: same pixels, one colour, grown by `radiusPx`.
 * The source is read in place and replaced, so the caller keeps one canvas rather than two.
 */
export function paintOutline(
  pixels: ImageData,
  radiusPx: number,
  hex: string,
  corners: OutlineCorners = DEFAULT_OUTLINE_CORNERS,
): ImageData {
  const { data, width, height } = pixels;
  const coverage = outlineCoverage(data, width, height, radiusPx, corners);
  const [r, g, b] = outlineRgb(hex);
  for (let i = 0; i < coverage.length; i++) {
    const at = i * 4;
    data[at] = r;
    data[at + 1] = g;
    data[at + 2] = b;
    data[at + 3] = coverage[i];
  }
  return pixels;
}
