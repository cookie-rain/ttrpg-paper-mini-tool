import type { Figure, Settings, SideKey, StoredImage } from '../types';
import { MM_PER_INCH, PAPER_SIZES_MM } from './constants';
import { figureColorHex, readableTextColor } from './colors';
import { figureImageSize, flapHeightMm, glueTabMm, prismBandMm, prismStrip, sideSize } from './geometry';
import { loadImageElement } from './image';
import { applyTransform, figureImageIds, flatBack, isQuarterTurned } from './sides';
import type { PageLayout, PlacedCard } from './layout';
import { cardCutSegments, mergeCutSegments, type CutSegment } from './cutlines';

const FONT_FAMILY = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const CUT_LINE_COLOR = '#808080';
const FOLD_LINE_COLOR = '#b4b4b4';
/** Hairline: about 1 px at 300 dpi. Thin enough to disappear after cutting, still visible on paper. */
const LINE_WIDTH_MM = 0.1;

const FOOTER_COLOR = '#666666';
const FOOTER_FONT_MM = 2.4;
/** Space kept between two footer blocks. */
const FOOTER_GAP_MM = 4;
/** Calibration ruler lengths, longest first. The longest pair that fits the sheet width is printed. */
const RULER_PRESETS = [
  { mm: 50, inches: 2 },
  { mm: 30, inches: 1 },
];
export const CALIBRATION_NOTE = 'Print at 100 % (actual size)';
export const BRAND = 'TTRPG Paper-Mini Tool';

/** Decoded images keyed by image id, so a figure can look up each of its sides. */
export type DecodedImages = Map<string, HTMLImageElement>;

/** Decodes every image used by the given figures, keyed by image id. */
export async function decodeFigureImages(figures: Figure[], images: Record<string, StoredImage>): Promise<DecodedImages> {
  const result: DecodedImages = new Map();
  const ids = [...new Set(figures.flatMap(figureImageIds))];
  await Promise.all(
    ids.map(async (id) => {
      const stored = images[id];
      if (stored) result.set(id, await loadImageElement(stored.dataUrl));
    }),
  );
  return result;
}

/**
 * Draws one side's artwork into a width x height box at the origin, honouring its rotation and mirroring.
 */
export function drawSideArtwork(
  ctx: CanvasRenderingContext2D,
  side: Figure['front'],
  img: HTMLImageElement | undefined,
  width: number,
  height: number,
): void {
  if (!img) return;
  const { x, y, width: cw, height: ch } = side.crop;
  ctx.save();
  applyTransform(ctx, side.transform, width, height);
  // After a quarter turn the artwork is drawn into the box with its sides swapped.
  const [w, h] = isQuarterTurned(side.transform) ? [height, width] : [width, height];
  ctx.drawImage(img, x, y, cw, ch, 0, 0, w, h);
  ctx.restore();
}

/** Creates a canvas for a full page at the given resolution (pixels per millimetre). */
export function createPageCanvas(settings: Settings, pxPerMm: number): HTMLCanvasElement {
  const paper = PAPER_SIZES_MM[settings.paper];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(paper.width * pxPerMm);
  canvas.height = Math.round(paper.height * pxPerMm);
  return canvas;
}

export function renderPage(
  canvas: HTMLCanvasElement,
  page: PageLayout,
  pageIndex: number,
  pageCount: number,
  figures: Figure[],
  decoded: DecodedImages,
  settings: Settings,
  pxPerMm: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const paper = PAPER_SIZES_MM[settings.paper];

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const byId = new Map(figures.map((f) => [f.id, f]));
  for (const card of page.cards) {
    const figure = byId.get(card.figureId);
    if (!figure) continue;
    ctx.save();
    ctx.scale(pxPerMm, pxPerMm);
    if (card.rotated) {
      // Rotate 90° clockwise so the card occupies (height × width) starting at (x, y).
      ctx.translate(card.x + card.height, card.y);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(card.x, card.y);
    }
    drawCard(ctx, card, figure, decoded, settings, pxPerMm);
    ctx.restore();
  }

  // Cut lines go on last and for the page as a whole, so an edge two cards share is drawn once.
  const cuts = page.cards.flatMap((card) => {
    const figure = byId.get(card.figureId);
    return figure ? cardCutSegments(card, figure, settings) : [];
  });

  ctx.save();
  ctx.scale(pxPerMm, pxPerMm);
  drawCutSegments(ctx, mergeCutSegments(cuts), settings);
  drawFooter(ctx, paper.width, paper.height, settings, pageIndex, pageCount, pxPerMm);
  ctx.restore();
}

/**
 * Draws one unfolded card in its local coordinate system (mm, origin top-left).
 * The back half, artwork and text alike, is rotated 180°, so it reads correctly from behind once folded.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  card: PlacedCard,
  figure: Figure,
  decoded: DecodedImages,
  settings: Settings,
  pxPerMm: number,
): void {
  if (figure.shape === 'prism') {
    drawPrismCard(ctx, card, figure, decoded, settings, pxPerMm);
    return;
  }
  const { width: cardWidth, height: cardHeight } = card;
  const base = settings.baseHeightMm;
  const image = figureImageSize(figure);
  const foldY = base + image.height;
  const frontBaseY = foldY + image.height;
  const flapY = frontBaseY + base;
  const flap = flapHeightMm(settings);
  // The card can be wider than the artwork; `align` says where it sits, 0.5 being the middle.
  const align = figure.faces.front.align;
  const imageX = (cardWidth - image.width) * align;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  // Front half, standing on the front base strip.
  ctx.save();
  ctx.translate(imageX, foldY);
  drawSideArtwork(ctx, figure.front, decoded.get(figure.front.imageId), image.width, image.height);
  ctx.restore();

  // Back half, rotated 180°. Folding over the top turns it upright again and, seen from behind, also
  // swaps left and right, so the rotation's horizontal flip cancels out: whoever looks at the back sees
  // the artwork exactly as the editor shows it. Without a back the half is left blank.
  const back = flatBack(figure);
  if (back) {
    const backSize = sideSize(back, figure.heightMm);
    ctx.save();
    ctx.translate(cardWidth, foldY);
    ctx.scale(-1, -1);
    // Mirrored by the turn, so the offset is counted from the other end and the halves stay on top of
    // each other once the card is folded.
    ctx.translate((cardWidth - backSize.width) * (1 - align), 0);
    drawSideArtwork(ctx, back, decoded.get(back.imageId), backSize.width, backSize.height);
    ctx.restore();
  }

  // Front base strip.
  ctx.save();
  ctx.translate(0, frontBaseY);
  drawBaseStrip(ctx, cardWidth, base, figure, card.letter, settings, pxPerMm);
  ctx.restore();

  // Back base strip, rotated 180° around its centre.
  ctx.save();
  ctx.translate(cardWidth, base);
  ctx.rotate(Math.PI);
  drawBaseStrip(ctx, cardWidth, base, figure, card.letter, settings, pxPerMm);
  ctx.restore();

  drawFoldLine(ctx, cardWidth, foldY, settings);
  if (settings.baseStyle === 'folded') {
    // The base strips bend 90° into a foot and the flap folds under it.
    drawFoldLine(ctx, cardWidth, base, settings);
    drawFoldLine(ctx, cardWidth, frontBaseY, settings);
    drawFoldLine(ctx, cardWidth, flapY, settings);
    drawFlapHint(ctx, cardWidth, flapY, flap, pxPerMm);
  }
}

/**
 * Draws one unfolded prism: three faces in a row that fold into a triangular tube, plus an optional
 * glue tab. Side A and Side B sit next to each other, so the front edge of the figure is a clean fold
 * and the glued seam ends up behind it. Side A carries the main image; the other two carry their own
 * artwork, or stay blank.
 *
 *   |   Side A    |   Side B    |   Side C   |\ tab
 *   |   (main)    |             |            |/
 *   +-------------+------------+-------------+
 *   |            band along the bottom       |
 */
function drawPrismCard(
  ctx: CanvasRenderingContext2D,
  card: PlacedCard,
  figure: Figure,
  decoded: DecodedImages,
  settings: Settings,
  pxPerMm: number,
): void {
  const { width: cardWidth, height: cardHeight } = card;
  const faces = prismStrip(figure, settings);
  const band = prismBandMm(settings);
  const artHeight = figure.heightMm;
  const tab = glueTabMm(settings);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  for (const face of faces) {
    if (!face.side) continue;
    const art = sideSize(face.side, artHeight);
    ctx.save();
    // Mirroring is part of the side's own transform now, so every face is drawn the same way.
    // A face wider than its artwork keeps the spare room at the sides, split by the face's alignment.
    ctx.translate(face.x + (face.width - art.width) * face.align, 0);
    drawSideArtwork(ctx, face.side, decoded.get(face.side.imageId), art.width, art.height);
    ctx.restore();
  }

  if (band > 0) drawPrismBand(ctx, faces, band, artHeight, figure, card.letter, settings, pxPerMm);

  // Folds between the faces, and one more where the glue tab bends behind the first face.
  const last = faces[faces.length - 1];
  const foldXs = [...faces.slice(1).map((face) => face.x), ...(tab > 0 ? [last.x + last.width] : [])];
  for (const x of foldXs) drawVerticalFoldLine(ctx, x, cardHeight, settings);
}

/** The coloured band along the bottom of a prism, and the name and info printed in it. */
function drawPrismBand(
  ctx: CanvasRenderingContext2D,
  faces: { key: SideKey; x: number; width: number }[],
  band: number,
  bandY: number,
  figure: Figure,
  letter: string,
  settings: Settings,
  pxPerMm: number,
): void {
  const colorHex = figureColorHex(figure);
  const painted = faces.filter((face) => settings.prismBandSides[face.key]);

  for (const face of painted) {
    ctx.save();
    ctx.translate(face.x, bandY);
    if (colorHex) {
      ctx.fillStyle = colorHex;
      if (settings.prismLabel === 'edges') {
        // Marks at the folds only, so the artwork keeps a clean edge.
        const mark = Math.min(3, face.width * 0.12);
        ctx.fillRect(0, 0, mark, band);
        ctx.fillRect(face.width - mark, 0, mark, band);
      } else {
        ctx.fillRect(0, 0, face.width, band);
      }
    }
    if (settings.prismLabel === 'text') {
      const textColor = colorHex ? readableTextColor(colorHex) : '#111111';
      drawBandText(ctx, face.width, band, figure, letter, textColor, pxPerMm);
    }
    ctx.restore();
  }
}

/** Name and info centred in a band of the given size, laid out like the flat mini's base strip. */
function drawBandText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  figure: Figure,
  letter: string,
  textColor: string,
  pxPerMm: number,
): void {
  const padding = 1;
  const maxWidth = Math.max(1, width - 2 * padding);
  const name = figure.name.trim();
  const info = figure.info.trim();

  ctx.save();
  ctx.scale(1 / pxPerMm, 1 / pxPerMm);
  const px = (mm: number) => mm * pxPerMm;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  if (info) {
    drawCenteredLine(ctx, name, letter, px(width / 2), px(height * 0.36), px(maxWidth), px(Math.min(3.6, height * 0.38)), 700, pxPerMm);
    drawCenteredLine(ctx, info, '', px(width / 2), px(height * 0.75), px(maxWidth), px(Math.min(2.6, height * 0.27)), 400, pxPerMm);
  } else {
    drawCenteredLine(ctx, name, letter, px(width / 2), px(height * 0.52), px(maxWidth), px(Math.min(4.2, height * 0.45)), 700, pxPerMm);
  }
  ctx.restore();
}

/** Draws the page's cut lines, already merged, in the chosen style. */
function drawCutSegments(ctx: CanvasRenderingContext2D, segments: CutSegment[], settings: Settings): void {
  if (segments.length === 0) return;
  ctx.save();
  ctx.strokeStyle = CUT_LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH_MM;
  if (settings.cutLines === 'dashed') ctx.setLineDash([2, 1.5]);
  ctx.beginPath();
  for (const segment of segments) {
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawVerticalFoldLine(ctx: CanvasRenderingContext2D, x: number, height: number, settings: Settings): void {
  if (settings.foldLine === 'none') return;
  ctx.save();
  ctx.strokeStyle = FOLD_LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH_MM;
  ctx.beginPath();
  if (settings.foldLine === 'edge-ticks') {
    const tick = Math.min(3, height / 5);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, tick);
    ctx.moveTo(x, height - tick);
    ctx.lineTo(x, height);
  } else {
    if (settings.foldLine === 'dashed') ctx.setLineDash([1.5, 1.2]);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBaseStrip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  figure: Figure,
  letter: string,
  settings: Settings,
  pxPerMm: number,
): void {
  const colorHex = figureColorHex(figure);
  let textColor = '#111111';
  let inset = 0;

  if (colorHex) {
    ctx.fillStyle = colorHex;
    if (settings.colorStyle === 'fill') {
      ctx.fillRect(0, 0, width, height);
      textColor = readableTextColor(colorHex);
    } else {
      const stripe = Math.min(3, width * 0.12);
      ctx.fillRect(0, 0, stripe, height);
      ctx.fillRect(width - stripe, 0, stripe, height);
      inset = stripe;
    }
  }

  if (!settings.flatText) return;
  const padding = 1;
  const maxWidth = Math.max(1, width - 2 * (inset + padding));
  const centerX = width / 2;
  const name = figure.name.trim();
  const info = figure.info.trim();

  // Work in device pixels for text so fractional font sizes stay crisp.
  ctx.save();
  ctx.scale(1 / pxPerMm, 1 / pxPerMm);
  const px = (mm: number) => mm * pxPerMm;
  ctx.fillStyle = textColor;
  ctx.strokeStyle = textColor;
  ctx.textBaseline = 'middle';

  if (info) {
    drawCenteredLine(ctx, name, letter, px(centerX), px(height * 0.36), px(maxWidth), px(Math.min(3.6, height * 0.38)), 700, pxPerMm);
    drawCenteredLine(ctx, info, '', px(centerX), px(height * 0.75), px(maxWidth), px(Math.min(2.6, height * 0.27)), 400, pxPerMm);
  } else {
    drawCenteredLine(ctx, name, letter, px(centerX), px(height * 0.52), px(maxWidth), px(Math.min(4.2, height * 0.45)), 700, pxPerMm);
  }
  ctx.restore();
}

/**
 * Draws a horizontally centred line of text, optionally followed by the copy letter in bold.
 * Shrinks the line to fit and truncates the text with an ellipsis as a last resort.
 */
function drawCenteredLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  letter: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
  fontSize: number,
  weight: number,
  pxPerMm: number,
): void {
  if (!text && !letter) return;
  const minSize = 1.5 * pxPerMm;

  const measure = (size: number, content: string) => {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    const textWidth = content ? ctx.measureText(content).width : 0;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    const letterWidth = letter ? ctx.measureText(letter).width : 0;
    const gap = content && letter ? size * 0.35 : 0;
    return { textWidth, letterWidth, gap, total: textWidth + gap + letterWidth };
  };

  let size = fontSize;
  let content = text;
  let m = measure(size, content);
  if (m.total > maxWidth) {
    // Small safety factor: text width does not scale perfectly linearly with font size (hinting).
    size = Math.max(minSize, size * (maxWidth / m.total) * 0.96);
    m = measure(size, content);
  }
  while (m.total > maxWidth && content.length > 1) {
    content = content.slice(0, -1);
    m = measure(size, `${content.trimEnd()}…`);
  }
  if (content !== text) content = `${content.trimEnd()}…`;

  const startX = centerX - m.total / 2;
  ctx.textAlign = 'left';
  if (content) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    ctx.fillText(content, startX, centerY);
  }
  if (letter) {
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    ctx.fillText(letter, startX + m.textWidth + m.gap, centerY);
  }
}

/** Small assembly hint printed on the reinforcement flap (it ends up underneath the foot). */
function drawFlapHint(ctx: CanvasRenderingContext2D, width: number, y: number, height: number, pxPerMm: number): void {
  ctx.save();
  ctx.scale(1 / pxPerMm, 1 / pxPerMm);
  ctx.fillStyle = '#b0b0b0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.min(2.2, width / 12);
  ctx.font = `400 ${size * pxPerMm}px ${FONT_FAMILY}`;
  ctx.fillText('fold under · glue', (width / 2) * pxPerMm, (y + height / 2) * pxPerMm);
  ctx.restore();
}

function drawFoldLine(ctx: CanvasRenderingContext2D, width: number, y: number, settings: Settings): void {
  if (settings.foldLine === 'none') return;
  ctx.save();
  ctx.strokeStyle = FOLD_LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH_MM;
  ctx.beginPath();
  if (settings.foldLine === 'edge-ticks') {
    const tick = Math.min(3, width / 5);
    ctx.moveTo(0, y);
    ctx.lineTo(tick, y);
    ctx.moveTo(width - tick, y);
    ctx.lineTo(width, y);
  } else {
    if (settings.foldLine === 'dashed') ctx.setLineDash([1.5, 1.2]);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

export interface FooterRuler {
  x: number;
  lengthMm: number;
  tickMm: number;
  label: string;
}

export interface FooterPlan {
  rulers: FooterRuler[];
  /** Left edge of the calibration note, or null when there is no room for it. */
  noteX: number | null;
  /** Right-aligned label; empty when not even the page number fits. */
  rightLabel: string;
}

/**
 * Decides what fits into the footer strip between `left` and `right` (both in millimetres).
 * Pure so it can be tested without a canvas: `textWidthMm` measures a string at the footer font size.
 *
 * Priority when space runs short — the sheet may be as narrow as A5: the millimetre ruler and the page
 * number come first, then the inch ruler, then the full tool name, and the advisory note goes last.
 * Rulers shrink to a shorter preset before any of them is dropped.
 */
export function planFooter(
  left: number,
  right: number,
  showRulers: boolean,
  pageLabel: string,
  textWidthMm: (text: string) => number,
): FooterPlan {
  const blockWidth = (lengthMm: number, label: string) => Math.max(lengthMm, textWidthMm(label));
  const rulersOf = (preset: (typeof RULER_PRESETS)[number]) => [
    { lengthMm: preset.mm, tickMm: preset.mm / 5, label: `${preset.mm} mm` },
    { lengthMm: preset.inches * MM_PER_INCH, tickMm: MM_PER_INCH / 2, label: `${preset.inches} in` },
  ];

  // The right-hand label is reserved first, but never at the cost of the millimetre ruler.
  const shortest = RULER_PRESETS[RULER_PRESETS.length - 1];
  const brandLabel = `${BRAND} · ${pageLabel}`;
  const rightSpace = right - left - (showRulers ? blockWidth(shortest.mm, `${shortest.mm} mm`) + FOOTER_GAP_MM : 0);
  const rightLabel =
    textWidthMm(brandLabel) <= rightSpace ? brandLabel : textWidthMm(pageLabel) <= rightSpace ? pageLabel : '';
  const limit = right - (rightLabel ? textWidthMm(rightLabel) + FOOTER_GAP_MM : 0);

  if (!showRulers) return { rulers: [], noteX: null, rightLabel };

  const preset =
    RULER_PRESETS.find(
      (candidate) =>
        left + rulersOf(candidate).reduce((sum, r) => sum + blockWidth(r.lengthMm, r.label) + FOOTER_GAP_MM, 0) <=
        limit + FOOTER_GAP_MM,
    ) ?? shortest;

  const rulers: FooterRuler[] = [];
  let x = left;
  for (const ruler of rulersOf(preset)) {
    const width = blockWidth(ruler.lengthMm, ruler.label);
    if (x + width > limit) continue;
    rulers.push({ ...ruler, x });
    x += width + FOOTER_GAP_MM;
  }
  const noteX = x + textWidthMm(CALIBRATION_NOTE) <= limit ? x : null;
  return { rulers, noteX, rightLabel };
}

/**
 * Page footer: the page number and, when enabled, calibration rulers that show whether the sheet was
 * printed at 100 %. The layout is planned from measured text, so it never runs off a narrow sheet.
 */
function drawFooter(
  ctx: CanvasRenderingContext2D,
  pageWidth: number,
  pageHeight: number,
  settings: Settings,
  pageIndex: number,
  pageCount: number,
  pxPerMm: number,
): void {
  const left = settings.marginMm;
  const right = pageWidth - settings.marginMm;
  const baseY = pageHeight - settings.marginMm - 3.5;
  const fontPx = FOOTER_FONT_MM * pxPerMm;
  // measureText reports font pixels regardless of the current transform, so this works in millimetres.
  ctx.font = `400 ${fontPx}px ${FONT_FAMILY}`;
  const plan = planFooter(left, right, settings.calibrationRuler, `${pageIndex + 1}/${pageCount}`, (text) =>
    ctx.measureText(text).width / pxPerMm,
  );

  for (const ruler of plan.rulers) {
    drawRuler(ctx, ruler.x, baseY, ruler.lengthMm, ruler.tickMm);
    drawFooterText(ctx, ruler.label, ruler.x, baseY + 2.6, 'left', pxPerMm, fontPx);
  }
  if (plan.noteX !== null) drawFooterText(ctx, CALIBRATION_NOTE, plan.noteX, baseY - 0.4, 'left', pxPerMm, fontPx);
  if (plan.rightLabel) drawFooterText(ctx, plan.rightLabel, right, baseY + 2.6, 'right', pxPerMm, fontPx);
}

/** A ruler line with ticks, drawn from (x, baseY) to the right. */
function drawRuler(ctx: CanvasRenderingContext2D, x: number, baseY: number, lengthMm: number, tickMm: number): void {
  ctx.save();
  ctx.strokeStyle = FOOTER_COLOR;
  ctx.lineWidth = 0.15;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + lengthMm, baseY);
  for (let t = 0; t <= lengthMm + 0.001; t += tickMm) {
    ctx.moveTo(x + t, baseY);
    ctx.lineTo(x + t, baseY - 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Footer text. The position is in millimetres, the glyphs are drawn in device pixels to stay crisp. */
function drawFooterText(
  ctx: CanvasRenderingContext2D,
  text: string,
  xMm: number,
  yMm: number,
  align: CanvasTextAlign,
  pxPerMm: number,
  fontPx: number,
): void {
  ctx.save();
  ctx.scale(1 / pxPerMm, 1 / pxPerMm);
  ctx.font = `400 ${fontPx}px ${FONT_FAMILY}`;
  ctx.fillStyle = FOOTER_COLOR;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, xMm * pxPerMm, yMm * pxPerMm);
  ctx.restore();
}
