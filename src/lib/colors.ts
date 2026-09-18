import type { BaseColor, Figure } from '../types';
import { BASE_COLORS } from './constants';

/** The colour a figure's base or band is printed in, or null when it has none. */
export function figureColorHex(figure: Pick<Figure, 'color' | 'customColorHex'>): string | null {
  return figure.color === 'custom' ? figure.customColorHex : BASE_COLORS[figure.color].hex;
}

/** The colour shown on a swatch: the preset's own, or the figure's custom colour for the picker. */
export function swatchHex(key: BaseColor, customColorHex: string): string | null {
  return key === 'custom' ? customColorHex : BASE_COLORS[key].hex;
}

/** Returns black or white, whichever is more readable on the given background colour. */
export function readableTextColor(hex: string): string {
  const value = parseInt(hex.replace('#', ''), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  // Contrast against white vs. black (WCAG formula); pick the larger one.
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#111111';
}

/** How many earlier custom colours the picker keeps. */
export const REMEMBERED_COLORS = 8;

/** Puts a colour at the front of the remembered list, without repeating one that is already there. */
export function rememberColor(colors: string[], hex: string): string[] {
  const lower = hex.toLowerCase();
  return [lower, ...colors.filter((color) => color.toLowerCase() !== lower)].slice(0, REMEMBERED_COLORS);
}

export interface Hsv {
  /** 0-360 */
  h: number;
  /** 0-1 */
  s: number;
  /** 0-1 */
  v: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** Accepts "#abc", "abcdef" and the like, and returns a plain six-digit hex, or null. */
export function normalizeHex(value: string): string | null {
  const text = value.trim().replace(/^#/, '');
  const full = text.length === 3 ? text.replace(/./g, (c) => c + c) : text;
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toLowerCase()}` : null;
}

export function hexToHsv(hex: string): Hsv {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  let h = 0;
  if (span > 0) {
    if (max === r) h = 60 * (((g - b) / span) % 6);
    else if (max === g) h = 60 * ((b - r) / span + 2);
    else h = 60 * ((r - g) / span + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : span / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = clamp01(v) * clamp01(s);
  const hue = (((h % 360) + 360) % 360) / 60;
  const second = c * (1 - Math.abs((hue % 2) - 1));
  const [r1, g1, b1] =
    hue < 1 ? [c, second, 0]
    : hue < 2 ? [second, c, 0]
    : hue < 3 ? [0, c, second]
    : hue < 4 ? [0, second, c]
    : hue < 5 ? [second, 0, c]
    : [c, 0, second];
  const m = clamp01(v) - c;
  const channel = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r1)}${channel(g1)}${channel(b1)}`;
}
