import type { Settings, SizeCategory, Unit } from '../types';
import { IN_GAME_METRES, METRES_PER_FOOT, MM_PER_INCH, SIZE_CATEGORIES } from './constants';

export function mmToUnit(mm: number, unit: Unit): number {
  return unit === 'in' ? mm / MM_PER_INCH : mm;
}

export function unitToMm(value: number, unit: Unit): number {
  return unit === 'in' ? value * MM_PER_INCH : value;
}

/** Formats a length for display, e.g. "35 mm" or "1.38 in". `precise` keeps one decimal for millimetres. */
export function formatLength(mm: number, unit: Unit, precise = false): string {
  if (unit === 'in') return `${(mm / MM_PER_INCH).toFixed(2)} in`;
  return precise ? `${Number(mm.toFixed(1))} mm` : `${Math.round(mm)} mm`;
}

/**
 * Converts a printed length to the size it represents in the game world.
 * Each size category line maps to a fixed in-game size (see IN_GAME_METRES); values in between are interpolated,
 * values above the largest category continue with the last slope and values below the smallest scale down to 0.
 */
export function inGameMetres(mm: number, categoryHeightsMm: Settings['categoryHeightsMm']): number {
  const anchors = SIZE_CATEGORIES.map((c) => ({ mm: categoryHeightsMm[c.id], m: IN_GAME_METRES[c.id] })).sort(
    (a, b) => a.mm - b.mm,
  );
  const points = [{ mm: 0, m: 0 }, ...anchors];
  let upper = points.findIndex((p) => p.mm >= mm);
  if (upper === -1) upper = points.length - 1; // above the largest category: extend the last segment
  const a = points[Math.max(0, upper - 1)];
  const b = points[Math.max(1, upper)];
  if (b.mm === a.mm) return b.m;
  return Math.max(0, a.m + ((mm - a.mm) * (b.m - a.m)) / (b.mm - a.mm));
}

/** Inverse of inGameMetres: the printed height that represents the given in-game size. */
export function inGameToMm(metres: number, categoryHeightsMm: Settings['categoryHeightsMm']): number {
  const anchors = SIZE_CATEGORIES.map((c) => ({ mm: categoryHeightsMm[c.id], m: IN_GAME_METRES[c.id] })).sort(
    (a, b) => a.m - b.m,
  );
  const points = [{ mm: 0, m: 0 }, ...anchors];
  let upper = points.findIndex((p) => p.m >= metres);
  if (upper === -1) upper = points.length - 1; // above the largest category: extend the last segment
  const a = points[Math.max(0, upper - 1)];
  const b = points[Math.max(1, upper)];
  if (b.m === a.m) return b.mm;
  return Math.max(0, a.mm + ((metres - a.m) * (b.mm - a.mm)) / (b.m - a.m));
}

/**
 * Formats the in-game size of a printed length in the unit system the user chose:
 * metres alongside millimetres, feet alongside inches. E.g. 38.1 mm -> "1.8 m" or "5.9 ft".
 */
export function formatInGame(mm: number, categoryHeightsMm: Settings['categoryHeightsMm'], unit: Unit): string {
  const metres = inGameMetres(mm, categoryHeightsMm);
  const value = unit === 'in' ? metres / METRES_PER_FOOT : metres;
  // Up to two decimals so typed values like 1.48 m show unchanged; Number() drops trailing zeros ("5 m", "1.5 m").
  return `${Number(value.toFixed(2))} ${unit === 'in' ? 'ft' : 'm'}`;
}

/**
 * In-game size of a size category line. The largest category is open-ended, so it gets a "+" (e.g. "10 m+").
 */
export function formatCategoryInGame(category: SizeCategory, settings: Pick<Settings, 'categoryHeightsMm' | 'unit'>): string {
  const text = formatInGame(settings.categoryHeightsMm[category], settings.categoryHeightsMm, settings.unit);
  const isLargest = SIZE_CATEGORIES[SIZE_CATEGORIES.length - 1].id === category;
  return isLargest ? `${text}+` : text;
}

/** Step size for numeric inputs in the given unit. */
export function unitStep(unit: Unit): number {
  return unit === 'in' ? 0.05 : 1;
}
