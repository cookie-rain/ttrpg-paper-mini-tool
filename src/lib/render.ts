import type { Figure, Settings, StoredImage } from '../types';
import { BASE_COLORS, MM_PER_INCH, PAPER_SIZES_MM } from './constants';
import { readableTextColor } from './colors';
import { figureImageSize, flapHeightMm } from './geometry';
import { loadImageElement } from './image';
import type { PageLayout, PlacedCard } from './layout';

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

export type DecodedImages = Map<string, HTMLImageElement>;

/** Decodes every image used by the given figures, keyed by figure id. */
export async function decodeFigureImages(figures: Figure[], images: Record<string, StoredImage>): Promise<DecodedImages> {
  const result: DecodedImages = new Map();
  await Promise.all(
    figures.map(async (figure) => {
      const stored = images[figure.frontImage.imageId];
      if (stored) result.set(figure.id, await loadImageElement(stored.dataUrl));
    }),
  );
  return result;
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
    drawCard(ctx, card, figure, decoded.get(figure.id), settings, pxPerMm);
    ctx.restore();
  }

  ctx.save();
  ctx.scale(pxPerMm, pxPerMm);
  drawFooter(ctx, paper.width, paper.height, settings, pageIndex, pageCount, pxPerMm);
  ctx.restore();
}

/**
 * Draws one unfolded card in its local coordinate system (mm, origin top-left).
 * The back image is mirrored vertically so both halves line up exactly after folding;
 * the back text is rotated 180° so it reads correctly from behind.
 */
function drawCard(
  ctx: CanvasRenderingContext2D,
  card: PlacedCard,
  figure: Figure,
  img: HTMLImageElement | undefined,
  settings: Settings,
  pxPerMm: number,
): void {
  const { width: cardWidth, height: cardHeight } = card;
  const base = settings.baseHeightMm;
  const image = figureImageSize(figure);
  const foldY = base + image.height;
  const frontBaseY = foldY + image.height;
  const flapY = frontBaseY + base;
  const flap = flapHeightMm(settings);
  const imageX = (cardWidth - image.width) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  if (img) {
    const { x, y, width, height } = figure.frontImage.crop;
    // Front half, standing on the front base strip.
    ctx.drawImage(img, x, y, width, height, imageX, foldY, image.width, image.height);
    // Back half, mirrored across the fold line.
    ctx.save();
    ctx.translate(0, foldY);
    ctx.scale(1, -1);
    ctx.drawImage(img, x, y, width, height, imageX, 0, image.width, image.height);
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
  drawCutLines(ctx, cardWidth, cardHeight, settings);
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
  const colorHex = BASE_COLORS[figure.color].hex;
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

function drawCutLines(ctx: CanvasRenderingContext2D, width: number, height: number, settings: Settings): void {
  if (settings.cutLines === 'none') return;
  ctx.save();
  ctx.strokeStyle = CUT_LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH_MM;
  const inset = LINE_WIDTH_MM / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;
  ctx.beginPath();
  if (settings.cutLines === 'corners') {
    const len = Math.min(4, width / 4, height / 4);
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ]) {
      ctx.moveTo(cx + dx * len, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * len);
    }
  } else {
    if (settings.cutLines === 'dashed') ctx.setLineDash([2, 1.5]);
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
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
