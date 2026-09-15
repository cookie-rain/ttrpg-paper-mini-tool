import type { Figure, Settings } from '../types';
import { cardSize, printableArea } from './geometry';
import { indexToLetters } from './labels';

/** One physical copy of a figure placed on a page. Coordinates in mm from the page's top-left corner. */
export interface PlacedCard {
  figureId: string;
  /** Copy label ("A", "B", ...) or empty when only one copy is printed. */
  letter: string;
  x: number;
  y: number;
  /** Unrotated card size. */
  width: number;
  height: number;
  /** When true the card is rotated 90° clockwise on the page, occupying height × width. */
  rotated: boolean;
}

export interface PageLayout {
  cards: PlacedCard[];
}

export interface LayoutResult {
  pages: PageLayout[];
  /** Figures that do not fit on a sheet even when rotated. */
  oversizedFigureIds: string[];
}

interface CardInstance {
  figureId: string;
  letter: string;
  width: number;
  height: number;
  rotated: boolean;
}

const EPSILON = 0.001;

/**
 * Places all card copies on pages, either cut-friendly (rows and columns) or compact (as little paper as possible).
 * Figures that are too large for a single sheet are reported instead of placed.
 */
export function layoutPages(figures: Figure[], settings: Settings): LayoutResult {
  const area = printableArea(settings);
  const oversizedFigureIds: string[] = [];
  const instances: CardInstance[] = [];

  for (const figure of figures) {
    const size = cardSize(figure, settings);
    const fitsUpright = size.width <= area.width + EPSILON && size.height <= area.height + EPSILON;
    const fitsRotated = size.height <= area.width + EPSILON && size.width <= area.height + EPSILON;
    if (!fitsUpright && !fitsRotated) {
      oversizedFigureIds.push(figure.id);
      continue;
    }
    const count = Math.max(1, Math.floor(figure.count));
    for (let i = 0; i < count; i++) {
      instances.push({
        figureId: figure.id,
        letter: count > 1 ? indexToLetters(i) : '',
        width: size.width,
        height: size.height,
        rotated: !fitsUpright,
      });
    }
  }

  let pages = packRows(instances, area, settings);
  if (settings.packing === 'compact') {
    // Free packing is usually better, but never accept a result that needs more sheets than the row layout.
    const compact = packCompact(instances, area, settings);
    if (compact.length <= pages.length) pages = compact;
  }
  return { pages, oversizedFigureIds };
}

/**
 * Packs cards into rows that are split into columns.
 *
 * The tallest card of a row sets the row height; shorter cards are stacked into columns within that height.
 * This keeps every layout cuttable with straight guillotine cuts: separate the rows, then the columns,
 * then the cards within a column. Cards are sorted by height so similar sizes end up together.
 */
function packRows(input: CardInstance[], area: { width: number; height: number }, settings: Settings): PageLayout[] {
  // Stable sort keeps copies of the same figure together (A, B, C in order).
  const instances = [...input].sort((a, b) => footprint(b).height - footprint(a).height);

  const gap = settings.gapMm;
  const pages: PageLayout[] = [];
  let page: PageLayout | null = null;
  let rowY = 0;
  let rowHeight = 0;
  let columnX = 0;
  let columnWidth = 0;
  let columnUsed = 0;

  const place = (instance: CardInstance, x: number, y: number) => page!.cards.push(toPlaced(instance, x, y, settings));

  for (const instance of instances) {
    const { width, height } = footprint(instance);

    // 1. Stack below the previous card in the current column.
    if (page && columnWidth > 0) {
      const newWidth = Math.max(columnWidth, width);
      const fitsVertically = columnUsed + gap + height <= rowHeight + EPSILON;
      const fitsHorizontally = columnX + newWidth <= area.width + EPSILON;
      if (fitsVertically && fitsHorizontally) {
        place(instance, columnX, rowY + columnUsed + gap);
        columnUsed += gap + height;
        columnWidth = newWidth;
        continue;
      }
    }

    // 2. Open a new column to the right in the current row.
    const nextX = columnWidth > 0 ? columnX + columnWidth + gap : 0;
    if (page && rowHeight > 0 && nextX + width <= area.width + EPSILON && height <= rowHeight + EPSILON) {
      columnX = nextX;
      columnWidth = width;
      columnUsed = height;
      place(instance, columnX, rowY);
      continue;
    }

    // 3. Start a new row, on a new page if necessary.
    const nextRowY = page && rowHeight > 0 ? rowY + rowHeight + gap : 0;
    if (!page || nextRowY + height > area.height + EPSILON) {
      page = { cards: [] };
      pages.push(page);
      rowY = 0;
    } else {
      rowY = nextRowY;
    }
    rowHeight = height;
    columnX = 0;
    columnWidth = width;
    columnUsed = height;
    place(instance, 0, rowY);
  }

  return pages;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Packs cards as tightly as possible using the MaxRects algorithm ("best short side fit").
 * Every card may be rotated by 90°. Each page keeps a list of maximal free rectangles;
 * a card goes into the free rectangle it fills most snugly on the first page where it fits.
 * The gap is handled by growing every card and the page by one gap, so neighbours end up exactly one gap apart.
 */
function packCompact(input: CardInstance[], area: { width: number; height: number }, settings: Settings): PageLayout[] {
  const gap = settings.gapMm;
  // Largest cards first; copies of a figure stay together thanks to the stable sort.
  const instances = [...input].sort(
    (a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height,
  );

  const pages: { layout: PageLayout; free: Rect[] }[] = [];
  const newPage = () => {
    const page = { layout: { cards: [] }, free: [{ x: 0, y: 0, width: area.width + gap, height: area.height + gap }] };
    pages.push(page);
    return page;
  };

  for (const instance of instances) {
    const w = instance.width + gap;
    const h = instance.height + gap;
    let placed = false;

    for (const page of [...pages, null]) {
      const target = page ?? newPage();
      const best = findBestFit(target.free, w, h);
      if (!best) continue;
      const rect: Rect = { x: best.x, y: best.y, width: best.rotated ? h : w, height: best.rotated ? w : h };
      target.free = splitFreeRects(target.free, rect);
      target.layout.cards.push(toPlaced({ ...instance, rotated: best.rotated }, rect.x, rect.y, settings));
      placed = true;
      break;
    }
    // Cannot happen: oversized cards were filtered out and an empty page always fits the rest.
    if (!placed) throw new Error('Card does not fit on an empty page');
  }

  return pages.map((page) => page.layout);
}

function findBestFit(free: Rect[], w: number, h: number): { x: number; y: number; rotated: boolean } | null {
  let best: { x: number; y: number; rotated: boolean; short: number; long: number } | null = null;
  for (const rect of free) {
    for (const rotated of [false, true]) {
      const cw = rotated ? h : w;
      const ch = rotated ? w : h;
      if (cw > rect.width + EPSILON || ch > rect.height + EPSILON) continue;
      const leftoverW = rect.width - cw;
      const leftoverH = rect.height - ch;
      const short = Math.min(leftoverW, leftoverH);
      const long = Math.max(leftoverW, leftoverH);
      if (!best || short < best.short - EPSILON || (Math.abs(short - best.short) <= EPSILON && long < best.long)) {
        best = { x: rect.x, y: rect.y, rotated, short, long };
      }
    }
  }
  return best;
}

/** Removes the used area from all free rectangles and drops rectangles contained in others. */
function splitFreeRects(free: Rect[], used: Rect): Rect[] {
  const result: Rect[] = [];
  for (const rect of free) {
    const overlaps =
      used.x < rect.x + rect.width - EPSILON &&
      used.x + used.width > rect.x + EPSILON &&
      used.y < rect.y + rect.height - EPSILON &&
      used.y + used.height > rect.y + EPSILON;
    if (!overlaps) {
      result.push(rect);
      continue;
    }
    if (used.x > rect.x + EPSILON) result.push({ ...rect, width: used.x - rect.x });
    if (used.x + used.width < rect.x + rect.width - EPSILON) {
      result.push({ ...rect, x: used.x + used.width, width: rect.x + rect.width - (used.x + used.width) });
    }
    if (used.y > rect.y + EPSILON) result.push({ ...rect, height: used.y - rect.y });
    if (used.y + used.height < rect.y + rect.height - EPSILON) {
      result.push({ ...rect, y: used.y + used.height, height: rect.y + rect.height - (used.y + used.height) });
    }
  }
  return result.filter(
    (rect, i) =>
      !result.some(
        (other, j) =>
          i !== j &&
          contains(other, rect) &&
          // Of two identical rectangles keep only the first.
          !(contains(rect, other) && j > i),
      ),
  );
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
  );
}

function toPlaced(instance: CardInstance, x: number, y: number, settings: Settings): PlacedCard {
  return {
    figureId: instance.figureId,
    letter: instance.letter,
    x: settings.marginMm + x,
    y: settings.marginMm + y,
    width: instance.width,
    height: instance.height,
    rotated: instance.rotated,
  };
}

/** Space a card occupies on the page, taking rotation into account. */
function footprint(card: { width: number; height: number; rotated: boolean }): { width: number; height: number } {
  return card.rotated ? { width: card.height, height: card.width } : { width: card.width, height: card.height };
}
