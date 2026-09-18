import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { GRID_SQUARE_MM } from '../lib/constants';

export interface StageItem {
  key: string;
  heightMm: number;
  widthMm: number;
  /** Renders the visual at the given pixel scale. */
  render: (pxPerMm: number) => ReactNode;
  label?: ReactNode;
  kind: 'silhouette' | 'figure';
  /** Lets the scrolling items overlap the right part of this (leading) item by this many millimetres. */
  trailingOverlapMm?: number;
  /** With fit="all", the overlap may grow up to this value before the whole stage is scaled down. */
  maxTrailingOverlapMm?: number;
  selected?: boolean;
  onClick?: () => void;
}

export interface ReferenceLine {
  label: string;
  heightMm: number;
  /** Printed height, e.g. "102 mm". */
  printSize: string;
  /** Size in the game world, e.g. "5 m". */
  inGameSize: string;
  /** Optional lines are only shown when they fit into the drawing area and keep some distance to other lines. */
  optional?: boolean;
}

const HEADROOM = 1.1;
/** Smallest scale before the stage scrolls instead (lineup). */
const MIN_PX_PER_MM = 2.5;
/** With fit="all" everything must fit, so the scale may go much lower. */
const MIN_PX_PER_MM_FIT_ALL = 0.3;
const MAX_PX_PER_MM = 12;
const DEFAULT_MIN_GAP_PX = 16;
const DEFAULT_LABEL_WIDTH_PX = 110;
/** Space kept free between neighbouring labels. */
const LABEL_SPACING_PX = 8;
/** Slack against rounding, so the row never trips the scrolling area by a pixel. */
const SCROLL_SAFETY_PX = 4;
/** With `fit="leading"`, at least this share of the free width stays available for the scrolling items. */
const MIN_SCROLL_SHARE = 0.4;
const SCROLLBAR_ALLOWANCE_PX = 24;
/** Thickness of the baseline drawn under the grid (see .stage-grid in the CSS). */
const GRID_BASELINE_PX = 2;
/** Minimum vertical distance between two visible reference lines, so their labels stay readable. */
const MIN_LINE_SPACING_PX = 26;
/** Space above a line that its label needs. */
const LINE_LABEL_HEIGHT_PX = 14;
/** Space kept free between the scrolling items and the reference line labels. */
const EDGE_PADDING_PX = 12;

/**
 * A side-by-side comparison of figures standing on a common baseline, drawn over a battle map grid
 * (one square = 1 inch). Layout, from left to right:
 *
 *   leading item (e.g. silhouettes, fixed) | items (scroll horizontally, fade at the edges) | line labels (fixed)
 *
 * Grid and reference lines run behind all three parts. The scale fits everything into the available space;
 * when that would get too small, only the middle part scrolls, so the references always stay visible.
 */
export function Stage({
  items,
  leading,
  labelHeight = 80,
  fit = 'height',
  referenceLines = [],
  minGapPx = DEFAULT_MIN_GAP_PX,
  labelWidthPx = DEFAULT_LABEL_WIDTH_PX,
  fixedGapPx,
  centerItems = false,
  leadingBehind = false,
  itemAreaShare = 1,
}: {
  items: StageItem[];
  /** Fixed item on the left that never scrolls. */
  leading?: StageItem;
  labelHeight?: number;
  /**
   * How the scale is chosen. Always as tall as the height allows, and additionally:
   * - 'all': small enough that every item fits horizontally (no scrolling),
   * - 'leading': small enough that the leading item leaves room for the scrolling items,
   * - 'height': no width limit.
   */
  fit?: 'all' | 'leading' | 'height';
  /** Dashed horizontal lines across the whole stage, e.g. the size category heights. */
  referenceLines?: ReferenceLine[];
  /** Smallest horizontal space between neighbouring images. */
  minGapPx?: number;
  /** Width reserved for the label under each item; the gap grows so neighbouring labels never touch. */
  labelWidthPx?: number;
  /**
   * Keeps the space between items at exactly this many pixels instead of widening it for the labels.
   * Labels are narrowed to match, so they still cannot touch. Use when a steady gap matters more
   * than full-width labels, e.g. the two sides of one figure sitting next to each other.
   */
  fixedGapPx?: number;
  /** Centres the items in the space left over, so they do not drift sideways while being resized. */
  centerItems?: boolean;
  /**
   * Draws the leading item as a backdrop instead of placing it in the row. The items then keep their own
   * fixed area and simply cover the backdrop when they are large enough, so their position never depends
   * on how wide the leading item happens to be.
   */
  leadingBehind?: boolean;
  /** Share of the free width the items are fitted into. The rest stays empty, half at either end. */
  itemAreaShare?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  // useId() may contain characters that are awkward inside url(#…), so keep only safe ones.
  const gridPatternId = `stage-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [available, setAvailable] = useState({ width: 800, height: 400 });
  const [labelsWidth, setLabelsWidth] = useState(0);
  const [scroll, setScroll] = useState({ left: 0, visible: 1, total: 1 });

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = { left: el.scrollLeft, visible: el.clientWidth, total: el.scrollWidth };
    setScroll((current) =>
      current.left === next.left && current.visible === next.visible && current.total === next.total ? current : next,
    );
  }, []);

  // Vertical mouse wheel scrolls the figures sideways while they overflow.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      const container = containerRef.current;
      if (container) setAvailable({ width: container.clientWidth, height: container.clientHeight });
      setLabelsWidth(labelsRef.current?.offsetWidth ?? 0);
      updateScroll();
    });
    for (const el of [containerRef.current, labelsRef.current, scrollRef.current?.firstElementChild]) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [updateScroll, referenceLines.length]);

  const resolveGap = (widths: number[]) => stageGap(widths, minGapPx, labelWidthPx, fixedGapPx);

  const allItems = leading ? [leading, ...items] : items;
  const requiredLines = referenceLines.filter((line) => !line.optional);
  const tallest = Math.max(10, ...allItems.map((item) => item.heightMm), ...requiredLines.map((line) => line.heightMm));
  // With fit="all" nothing scrolls, so no room is needed for the scrollbar.
  const scrollbarSpace = fit === 'all' ? 0 : SCROLLBAR_ALLOWANCE_PX;
  const byHeight = (available.height - labelHeight - scrollbarSpace) / (tallest * HEADROOM);
  const freeWidth = available.width - labelsWidth - EDGE_PADDING_PX;
  let byWidth = MAX_PX_PER_MM;
  let overlapMm = leading?.trailingOverlapMm ?? 0;
  if (fit === 'all' && leadingBehind) {
    // The backdrop plays no part in the fit; the items get their own slice of the width and stay centred.
    // Whatever the row ends up holding has to fit the area exactly: a scrollbar here would not only look
    // wrong, it would also steal height from the drawing area below.
    const compensation = centerItems ? labelsWidth : 0;
    const room = freeWidth - EDGE_PADDING_PX - compensation - SCROLL_SAFETY_PX;
    const budget = Math.max(0, Math.min(room, available.width * itemAreaShare));
    ({ scale: byWidth } = fitAll(undefined, items, budget, byHeight, resolveGap, labelWidthPx, false, centerItems));
    overlapMm = 0;
  } else if (fit === 'all') {
    // Centred items need a box that does not move: a growing overlap would drag the middle left with it.
    ({ scale: byWidth, overlapMm } = fitAll(
      leading,
      items,
      freeWidth,
      byHeight,
      resolveGap,
      labelWidthPx,
      !centerItems,
      centerItems,
    ));
  } else if (fit === 'leading' && leading) {
    // Let the figures slide further over the silhouettes before the whole stage shrinks.
    const baseOverlap = leading.trailingOverlapMm ?? 0;
    const maxOverlap = Math.max(baseOverlap, leading.maxTrailingOverlapMm ?? baseOverlap);
    const allowedMm = byHeight > 0 ? (freeWidth * (1 - MIN_SCROLL_SHARE)) / byHeight : Infinity;
    overlapMm = Math.min(maxOverlap, Math.max(baseOverlap, leading.widthMm - allowedMm));
    byWidth = (freeWidth * (1 - MIN_SCROLL_SHARE)) / Math.max(0.1, leading.widthMm - overlapMm);
  }
  const minScale = fit === 'all' ? MIN_PX_PER_MM_FIT_ALL : MIN_PX_PER_MM;
  const pxPerMm = Math.min(MAX_PX_PER_MM, Math.max(minScale, Math.min(byHeight, byWidth)));
  const itemWidthsPx = items.map((item) => item.widthMm * pxPerMm);
  const gapPx = resolveGap(itemWidthsPx);
  const last = itemWidthsPx[itemWidthsPx.length - 1] ?? 0;
  // Labels may be wider than their image; pad the ends so the first and last label are not cut off.
  const firstPadPx = Math.max(0, (labelWidthPx - (itemWidthsPx[0] ?? 0)) / 2);
  const lastPadPx = Math.max(0, (labelWidthPx - last) / 2);
  // Centring only reads as centred when both ends are padded the same, whatever the items measure.
  const padStartPx = centerItems ? Math.max(firstPadPx, lastPadPx) : firstPadPx;
  const padEndPx = centerItems ? padStartPx : lastPadPx;
  const squarePx = GRID_SQUARE_MM * pxPerMm;
  // The drawing area always fills the available height. When the scale is limited by the width, the grid simply
  // continues upwards above the tallest item instead of leaving empty space below the labels.
  const drawHeight = Math.max(tallest * HEADROOM * pxPerMm, available.height - labelHeight - scrollbarSpace);
  const overlapPx = overlapMm * pxPerMm;
  const visibleLines = pickVisibleLines(referenceLines, pxPerMm, drawHeight);
  const fadeLeft = scroll.left > 1;
  const fadeRight = scroll.left + scroll.visible < scroll.total - 1;

  // Each column is exactly as wide as its image, so the gap between images is uniform.
  // The label is centred under the image and may extend into the gap.
  const renderColumn = (item: StageItem, widthPx: number, labelWidth: number) => (
    <div
      key={item.key}
      className={`stage-column ${item.kind} ${item.selected ? 'selected' : ''} ${item.onClick ? 'clickable' : ''}`}
      style={{ width: widthPx }}
    >
      <div className="stage-visual" style={{ height: drawHeight }} onClick={item.onClick}>
        {item.render(pxPerMm)}
      </div>
      <div
        className="stage-label"
        style={{ minHeight: labelHeight, width: labelWidth, marginLeft: (widthPx - labelWidth) / 2 }}
      >
        {item.label}
      </div>
    </div>
  );

  return (
    <div className="stage" ref={containerRef}>
      <div className="stage-grid" style={{ height: drawHeight }}>
        {/*
          SVG pattern instead of a CSS background: CSS tiles are rounded to whole pixels, which drops grid lines
          at fractional square sizes. The pattern is anchored at the baseline so full squares stand on the floor.
        */}
        <svg className="stage-grid-lines" aria-hidden="true">
          <defs>
            <pattern
              id={gridPatternId}
              patternUnits="userSpaceOnUse"
              width={squarePx}
              height={squarePx}
              y={drawHeight - GRID_BASELINE_PX}
            >
              <rect width={1} height={squarePx} />
              <rect width={squarePx} height={1} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${gridPatternId})`} />
        </svg>
      </div>

      <div className="stage-body">
        {/* Own layer, so the size lines stay readable across the silhouettes behind the figures. */}
        <div className="stage-lines" style={{ height: drawHeight }}>
          {visibleLines.map((line) => (
            <div key={lineKey(line)} className="reference-line" style={{ bottom: line.heightMm * pxPerMm }} />
          ))}
        </div>
        {leading && (
          <div className={`stage-leading ${leadingBehind ? 'behind' : ''}`}>
            {renderColumn(leading, leading.widthMm * pxPerMm, leading.widthMm * pxPerMm)}
          </div>
        )}

        <div
          className="stage-scroll-area"
          style={{ marginLeft: leading && !leadingBehind ? -overlapPx - padStartPx : 0 }}
        >
          <div
            ref={scrollRef}
            className={`stage-scroll ${fadeLeft ? 'fade-left' : ''} ${fadeRight ? 'fade-right' : ''}`}
            onScroll={updateScroll}
          >
            <div
              className={`stage-row ${centerItems ? 'centered' : ''}`}
              style={{
                gap: gapPx,
                paddingLeft:
                  (leading && !centerItems && !leadingBehind ? padStartPx : padStartPx + EDGE_PADDING_PX) +
                  // The line labels sit to the right of this area, so centring inside it reads as
                  // left-of-centre on the stage. Padding the left by their width evens that out.
                  (centerItems && leadingBehind ? labelsWidth : 0),
                paddingRight: padEndPx + EDGE_PADDING_PX,
              }}
            >
              {items.map((item, index) => renderColumn(item, itemWidthsPx[index], labelWidthPx))}
            </div>
          </div>
          {scroll.total > scroll.visible + 2 && (
            <Scrollbar
              scroll={scroll}
              onScrollTo={(left) => {
                if (scrollRef.current) scrollRef.current.scrollLeft = left;
              }}
            />
          )}
        </div>

        {referenceLines.length > 0 && (
          <div className="stage-line-labels" ref={labelsRef} style={{ height: drawHeight }}>
            {/* Invisible copy sizes the column to its widest label; the visible labels are positioned absolutely. */}
            <div className="stage-line-labels-sizer" aria-hidden="true">
              {referenceLines.map((line) => (
                <LineLabel key={lineKey(line)} line={line} />
              ))}
            </div>
            {visibleLines.map((line) => (
              <div key={lineKey(line)} className="stage-line-label" style={{ bottom: line.heightMm * pxPerMm }}>
                <LineLabel line={line} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Always-visible horizontal scrollbar. Native scrollbars are hidden by many systems until you scroll
 * (overlay scrollbars), so the stage draws its own: drag the thumb or click the track to jump.
 */
function Scrollbar({
  scroll,
  onScrollTo,
}: {
  scroll: { left: number; visible: number; total: number };
  onScrollTo: (left: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);

  const maxScroll = scroll.total - scroll.visible;
  const thumbShare = scroll.visible / scroll.total;
  const thumbPosition = maxScroll > 0 ? scroll.left / maxScroll : 0;
  /** Converts a horizontal pointer distance on the track into a scroll distance. */
  const pxToScroll = (px: number) => {
    const trackWidth = trackRef.current?.clientWidth ?? 1;
    const freeTrack = trackWidth * (1 - thumbShare);
    return freeTrack > 0 ? (px / freeTrack) * maxScroll : 0;
  };

  const onThumbDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startLeft: scroll.left };
  };
  const onThumbMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onScrollTo(drag.current.startLeft + pxToScroll(event.clientX - drag.current.startX));
  };
  const onTrackDown = (event: PointerEvent<HTMLDivElement>) => {
    // Clicking beside the thumb pages one view width towards the click.
    const rect = event.currentTarget.getBoundingClientRect();
    const clickShare = (event.clientX - rect.left) / rect.width;
    onScrollTo(scroll.left + (clickShare < thumbPosition ? -1 : 1) * scroll.visible * 0.9);
  };

  return (
    <div className="stage-scrollbar">
      <div className="stage-scrollbar-track" ref={trackRef} onPointerDown={onTrackDown}>
        <div
          className="stage-scrollbar-thumb"
          style={{ width: `${thumbShare * 100}%`, left: `${thumbPosition * (1 - thumbShare) * 100}%` }}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
      </div>
    </div>
  );
}

function lineKey(line: ReferenceLine): string {
  return `${line.label}-${line.heightMm}`;
}

/** All required lines, plus optional lines that fit below the top edge and are not too close to their neighbours. */
function pickVisibleLines(lines: ReferenceLine[], pxPerMm: number, drawHeight: number): ReferenceLine[] {
  const required = lines.filter((line) => !line.optional);
  let lastPx = Math.max(0, ...required.map((line) => line.heightMm * pxPerMm));
  const picked = [...required];
  for (const line of lines.filter((l) => l.optional).sort((a, b) => a.heightMm - b.heightMm)) {
    const px = line.heightMm * pxPerMm;
    if (px > drawHeight - LINE_LABEL_HEIGHT_PX) break;
    if (px - lastPx < MIN_LINE_SPACING_PX) continue;
    picked.push(line);
    lastPx = px;
  }
  return picked;
}

function LineLabel({ line }: { line: ReferenceLine }) {
  return (
    <span>
      {line.label && `${line.label} - `}
      <span className="size-print">{line.printSize}</span>{' '}
      <span className="size-ingame">({line.inGameSize})</span>
    </span>
  );
}

/**
 * The gap between neighbouring items, following whichever is wider: the images or their labels.
 * It never drops below `fixedGap`, so wide images keep a steady distance while being resized, and it
 * opens up beyond that only when narrow images would otherwise let two labels touch.
 */
export function stageGap(widths: number[], minGap: number, labelWidth: number, fixedGap?: number): number {
  const needed = uniformGap(widths, minGap, labelWidth);
  return fixedGap === undefined ? needed : Math.max(fixedGap, needed);
}

/**
 * One gap for all neighbours: at least `minGap`, and large enough that no two neighbouring labels overlap.
 * Uniform spacing reads better than gaps that depend on each image's width.
 */
function uniformGap(widthsPx: number[], minGap: number, labelWidth: number): number {
  let gap = minGap;
  for (let i = 1; i < widthsPx.length; i++) {
    // Distance between the centres of two neighbours must fit one label plus spacing.
    const needed = labelWidth + LABEL_SPACING_PX - (widthsPx[i - 1] + widthsPx[i]) / 2;
    gap = Math.max(gap, needed);
  }
  return gap;
}

/**
 * Largest scale at which the leading item and all scrolling items fit side by side.
 * Before shrinking below the height-based scale, the items may move further over the leading item
 * (up to its maxTrailingOverlapMm), so wide figures keep the stage tall instead of leaving empty space.
 */
function fitAll(
  leading: StageItem | undefined,
  items: StageItem[],
  availableWidth: number,
  heightScale: number,
  resolveGap: (widths: number[]) => number,
  labelWidth: number,
  growOverlap: boolean,
  symmetricPads: boolean,
): { scale: number; overlapMm: number } {
  const baseOverlap = leading?.trailingOverlapMm ?? 0;
  const maxOverlap = growOverlap ? Math.max(baseOverlap, leading?.maxTrailingOverlapMm ?? baseOverlap) : baseOverlap;

  // Width of everything except the overlap, in pixels, at the given scale.
  const widthAt = (scale: number, overlapMm: number) => {
    const widths = items.map((item) => item.widthMm * scale);
    const gap = resolveGap(widths);
    const leadingPx = leading ? (leading.widthMm - overlapMm) * scale : 0;
    const first = widths[0] ?? 0;
    const last = widths[widths.length - 1] ?? 0;
    const firstPad = Math.max(0, (labelWidth - first) / 2);
    const lastPad = Math.max(0, (labelWidth - last) / 2);
    // Centring pads both ends to the larger of the two, so the fit has to expect that as well.
    const pads = symmetricPads ? 2 * Math.max(firstPad, lastPad) : firstPad + lastPad;
    return leadingPx + widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1) + pads;
  };

  const target = Math.min(MAX_PX_PER_MM, Math.max(MIN_PX_PER_MM_FIT_ALL, heightScale));
  if (widthAt(target, baseOverlap) <= availableWidth) return { scale: MAX_PX_PER_MM, overlapMm: baseOverlap };
  // Grow the overlap just enough to fit at the height-based scale.
  const neededOverlap = baseOverlap + (widthAt(target, baseOverlap) - availableWidth) / target;
  if (neededOverlap <= maxOverlap) return { scale: MAX_PX_PER_MM, overlapMm: neededOverlap };

  // Still too wide: use the maximum overlap and find the largest fitting scale (width grows with scale).
  let low = MIN_PX_PER_MM_FIT_ALL;
  let high = target;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (widthAt(mid, maxOverlap) <= availableWidth) low = mid;
    else high = mid;
  }
  return { scale: low, overlapMm: maxOverlap };
}
