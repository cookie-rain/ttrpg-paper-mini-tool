import type { Figure, Settings } from '../types';
import { GLUE_TAB_TAPER_MM } from './constants';
import { glueTabMm } from './geometry';
import type { PlacedCard } from './layout';

/** A straight piece of cut line, in millimetres from the page's top-left corner. */
export interface CutSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Coordinates this close together are the same edge. */
const EPSILON = 0.01;

/**
 * Cut lines for one card, in page coordinates. They are not inset: neighbouring cards printed without a
 * gap share an edge exactly, which is what lets the page draw it once instead of twice.
 */
export function cardCutSegments(card: PlacedCard, figure: Figure, settings: Settings): CutSegment[] {
  if (settings.cutLines === 'none') return [];
  const { width, height } = card;
  const local = settings.cutLines === 'corners' ? cornerMarks(width, height) : outline(figure, settings, width, height);
  return local.map((segment) => toPage(segment, card));
}

/** The card's own outline: a rectangle, or a rectangle with the prism's glue tab tapering off its end. */
function outline(figure: Figure, settings: Settings, width: number, height: number): CutSegment[] {
  const tab = figure.shape === 'prism' ? glueTabMm(settings) : 0;
  if (tab <= 0) return box(0, 0, width, height);
  const bodyRight = width - tab;
  const taper = Math.min(GLUE_TAB_TAPER_MM, height / 4);
  return [
    { x1: 0, y1: 0, x2: bodyRight, y2: 0 },
    { x1: bodyRight, y1: 0, x2: width, y2: taper },
    { x1: width, y1: taper, x2: width, y2: height - taper },
    { x1: width, y1: height - taper, x2: bodyRight, y2: height },
    { x1: bodyRight, y1: height, x2: 0, y2: height },
    { x1: 0, y1: height, x2: 0, y2: 0 },
  ];
}

function box(x: number, y: number, width: number, height: number): CutSegment[] {
  return [
    { x1: x, y1: y, x2: x + width, y2: y },
    { x1: x + width, y1: y, x2: x + width, y2: y + height },
    { x1: x + width, y1: y + height, x2: x, y2: y + height },
    { x1: x, y1: y + height, x2: x, y2: y },
  ];
}

/** Short marks at each corner instead of a full outline. */
function cornerMarks(width: number, height: number): CutSegment[] {
  const len = Math.min(4, width / 4, height / 4);
  return [
    [0, 0, 1, 1],
    [width, 0, -1, 1],
    [0, height, 1, -1],
    [width, height, -1, -1],
  ].flatMap(([x, y, dx, dy]) => [
    { x1: x, y1: y, x2: x + dx * len, y2: y },
    { x1: x, y1: y, x2: x, y2: y + dy * len },
  ]);
}

/** Card coordinates to page coordinates, taking the card's quarter turn into account. */
function toPage(segment: CutSegment, card: PlacedCard): CutSegment {
  const point = (x: number, y: number) =>
    // Rotated cards are turned a quarter clockwise about the corner they are placed at.
    card.rotated ? { x: card.x + card.height - y, y: card.y + x } : { x: card.x + x, y: card.y + y };
  const a = point(segment.x1, segment.y1);
  const b = point(segment.x2, segment.y2);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * Joins up the cut lines of a whole page. Cards printed without a gap share their edges, and each card
 * asks for the shared edge itself; drawn as they come, that edge is stroked twice, which shows as a
 * doubled line and, when dashed, as two dash patterns out of step. Runs along the same line are merged
 * into one, so every edge is drawn exactly once. Anything not straight along an axis -- the glue tab's
 * tapers -- is passed through untouched.
 */
export function mergeCutSegments(segments: CutSegment[]): CutSegment[] {
  const horizontal = new Map<number, [number, number][]>();
  const vertical = new Map<number, [number, number][]>();
  const diagonal: CutSegment[] = [];

  for (const segment of segments) {
    const span = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)];
    if (Math.abs(segment.y1 - segment.y2) < EPSILON) {
      add(horizontal, segment.y1, span(segment.x1, segment.x2));
    } else if (Math.abs(segment.x1 - segment.x2) < EPSILON) {
      add(vertical, segment.x1, span(segment.y1, segment.y2));
    } else {
      diagonal.push(segment);
    }
  }

  const merged: CutSegment[] = [];
  for (const [at, runs] of horizontal) {
    for (const [from, to] of union(runs)) merged.push({ x1: from, y1: at / 100, x2: to, y2: at / 100 });
  }
  for (const [at, runs] of vertical) {
    for (const [from, to] of union(runs)) merged.push({ x1: at / 100, y1: from, x2: at / 100, y2: to });
  }
  return [...merged, ...diagonal];
}

/** Buckets a run by the line it lies on, rounded so edges that should coincide do. */
function add(lines: Map<number, [number, number][]>, at: number, run: [number, number]): void {
  const key = Math.round(at * 100);
  const runs = lines.get(key);
  if (runs) runs.push(run);
  else lines.set(key, [run]);
}

/** Merges runs that overlap or touch into the stretches actually covered. */
function union(runs: [number, number][]): [number, number][] {
  const merged: [number, number][] = [];
  for (const [from, to] of [...runs].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + EPSILON) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}
