import type { Settings, SizeCategory } from '../types';
import { SIZE_CATEGORIES } from '../lib/constants';
import { formatCategoryInGame, formatInGame, formatLength, inGameToMm } from '../lib/units';
import { IN_GAME_METRES, METRES_PER_FOOT } from '../lib/constants';
import { Silhouette, silhouetteSizeMm } from './Silhouette';
import type { ReferenceLine, StageItem } from './Stage';

/**
 * How far each silhouette overlaps the next larger one, as a fraction of the larger one's width.
 * Tuned per image: the slim human can cover half of the ogre, the ogre sits deep in the dragon's wing.
 */
const SILHOUETTE_OVERLAP: Record<Exclude<SizeCategory, 'gargantuan'>, number> = {
  huge: 0.5,
  large: 0.7,
  medium: 0.5,
  small: 0.65,
};

/** How much of the largest silhouette the following figures may cover by default, as a fraction of its width. */
const DEFAULT_FIGURE_OVERLAP = 0.15;
/** Upper limit when wide figures need more room (see Stage fit="all"). */
const MAX_FIGURE_OVERLAP = 0.5;

/**
 * All reference silhouettes in one column, smallest on the left, overlapping to save space.
 * Smaller silhouettes are drawn in front, and the figures next to the row may overlap the largest one,
 * so it stays in the background. Heights are labelled by the reference lines, not here.
 */
export function silhouetteRowItem(
  settings: Settings,
  figureOverlap = DEFAULT_FIGURE_OVERLAP,
  maxFigureOverlap = MAX_FIGURE_OVERLAP,
): StageItem {
  const entries = [...SIZE_CATEGORIES].reverse().map((category) => {
    const size = silhouetteSizeMm(category.id, settings.categoryHeightsMm[category.id]);
    return { category, heightMm: size.height, widthMm: size.width };
  });

  // Working from the largest silhouette leftwards: each smaller one ends inside the next larger one.
  let previous: { leftMm: number; widthMm: number } | null = null;
  const positioned = entries.map((entry) => {
    const id = entry.category.id;
    const leftMm =
      previous && id !== 'gargantuan'
        ? previous.leftMm + previous.widthMm * SILHOUETTE_OVERLAP[id] - entry.widthMm
        : 0;
    previous = { leftMm, widthMm: entry.widthMm };
    return { ...entry, leftMm };
  });
  // Shift everything so the leftmost silhouette starts at 0.
  const minLeftMm = Math.min(...positioned.map((entry) => entry.leftMm));
  const placed = positioned.map((entry) => ({ ...entry, leftMm: entry.leftMm - minLeftMm }));
  const totalWidthMm = Math.max(...placed.map((entry) => entry.leftMm + entry.widthMm));
  const trailingOverlapMm = entries[0].widthMm * figureOverlap;
  const tallestMm = Math.max(...entries.map((entry) => entry.heightMm));

  return {
    key: 'silhouettes',
    kind: 'silhouette',
    heightMm: tallestMm,
    widthMm: totalWidthMm,
    trailingOverlapMm,
    maxTrailingOverlapMm: entries[0].widthMm * Math.max(figureOverlap, maxFigureOverlap),
    render: (pxPerMm) => (
      <div className="silhouette-row" style={{ width: totalWidthMm * pxPerMm }}>
        {/* Largest first in DOM order, so smaller silhouettes end up in front. */}
        {placed.map((entry) => (
          <Silhouette
            key={entry.category.id}
            category={entry.category.id}
            heightPx={entry.heightMm * pxPerMm}
            leftPx={entry.leftMm * pxPerMm}
          />
        ))}
      </div>
    ),
  };
}

/** Round in-game heights for the extra lines above the largest category, per unit system. */
const EXTRA_LINE_STEPS = {
  mm: { values: [15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000], toMetres: 1 },
  in: { values: [50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000], toMetres: METRES_PER_FOOT },
};

/**
 * Reference lines for the stage: one per size category, plus optional unlabelled lines at round in-game heights
 * above the largest category. The stage only shows optional lines that fit and are not too close together.
 */
export function referenceLines(settings: Settings): ReferenceLine[] {
  const categoryLines: ReferenceLine[] = SIZE_CATEGORIES.map((category) => ({
    label: category.label,
    printSize: formatLength(settings.categoryHeightsMm[category.id], settings.unit),
    inGameSize: formatCategoryInGame(category.id, settings),
    heightMm: settings.categoryHeightsMm[category.id],
  }));

  const largestMetres = Math.max(...Object.values(IN_GAME_METRES));
  const steps = EXTRA_LINE_STEPS[settings.unit];
  const extraLines: ReferenceLine[] = steps.values
    .filter((value) => value * steps.toMetres > largestMetres + 1e-6)
    .map((value) => {
      const heightMm = inGameToMm(value * steps.toMetres, settings.categoryHeightsMm);
      return {
        label: '',
        optional: true,
        printSize: formatLength(heightMm, settings.unit),
        inGameSize: formatInGame(heightMm, settings.categoryHeightsMm, settings.unit),
        heightMm,
      };
    });

  return [...categoryLines, ...extraLines];
}
