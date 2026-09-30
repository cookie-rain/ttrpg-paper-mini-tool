/**
 * The outline drawn around a figure: the artwork's own shape, grown outwards by a fixed distance and
 * filled with one colour, printed underneath the artwork.
 *
 * Growing it is a distance problem, not a scaling one. Scaling a copy of the artwork up from its centre
 * — the obvious trick — moves every pixel by an amount that depends on how far it sits from that centre,
 * so an outstretched arm ends up with a thinner edge than the body and a figure standing off-centre gets
 * a lopsided one. Measuring the distance to the artwork instead gives the same thickness everywhere,
 * around holes as readily as around the silhouette.
 */

/** Stands in for infinity: large enough to lose against any real distance, small enough to stay finite. */
const INF = 1e20;

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

  const field = squaredDistanceField(mask, width, height);
  for (let i = 0; i < coverage.length; i++) {
    // Half a pixel of feathering, centred on the radius, is one pixel of anti-aliasing at the rim.
    coverage[i] = Math.round(255 * Math.min(1, Math.max(0, radiusPx + 0.5 - Math.sqrt(field[i]))));
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
export function paintOutline(pixels: ImageData, radiusPx: number, hex: string): ImageData {
  const { data, width, height } = pixels;
  const coverage = outlineCoverage(data, width, height, radiusPx);
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
