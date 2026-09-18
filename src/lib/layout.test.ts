import { describe, expect, it } from 'vitest';
import type { Figure } from '../types';
import type { PackingMode, PaperSize } from '../types';
import { DEFAULT_SETTINGS, IN_GAME_METRES, PAPER_SIZES_MM } from './constants';
import {
  cardSize,
  effectiveDpi,
  footerReserveMm,
  glueTabMm,
  maxFigureHeightMm,
  prismBandMm,
  prismPanelWidths,
  printableArea,
  prismFaces,
  widestSideMm,
} from './geometry';
import { BRAND, CALIBRATION_NOTE, planFooter } from './render';
import {
  figureColorHex,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  readableTextColor,
  rememberColor,
  REMEMBERED_COLORS,
} from './colors';
import { BASE_COLORS, DEFAULT_CUSTOM_COLOR } from './constants';
import { stageGap } from '../components/Stage';
import { normalizeProject, useStore } from '../store';
import { figureImageIds, flatBack, IDENTITY_TRANSFORM, mirrored, printedSides, rotateSide, sideAspect } from './sides';
import { indexToLetters, nameFromFileName } from './labels';
import { layoutPages } from './layout';
import { parseDecimal } from '../components/controls';
import { formatCategoryInGame, formatInGame, inGameMetres, inGameToMm } from './units';

function footprintRect(c: { x: number; y: number; width: number; height: number; rotated: boolean }) {
  return c.rotated ? { x: c.x, y: c.y, w: c.height, h: c.width } : { x: c.x, y: c.y, w: c.width, h: c.height };
}

function side(width: number, height: number, imageId = 'img') {
  return { imageId, crop: { x: 0, y: 0, width, height }, transform: IDENTITY_TRANSFORM };
}

function figure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: overrides.id ?? 'f1',
    name: 'Goblin',
    info: '',
    count: 1,
    color: 'none',
    customColorHex: '#7a4fb8',
    shape: 'flat',
    front: side(500, 1000),
    back: null,
    left: null,
    heightMm: 35,
    ...overrides,
  };
}

describe('labels', () => {
  it('converts indices to letters', () => {
    expect(indexToLetters(0)).toBe('A');
    expect(indexToLetters(25)).toBe('Z');
    expect(indexToLetters(26)).toBe('AA');
    expect(indexToLetters(27)).toBe('AB');
  });

  it('derives names from file names', () => {
    expect(nameFromFileName('dark_elf-ranger.png')).toBe('Dark Elf Ranger');
  });
});

describe('geometry', () => {
  it('applies the minimum width and doubles the height for the fold', () => {
    const size = cardSize(figure(), DEFAULT_SETTINGS);
    expect(size.width).toBe(DEFAULT_SETTINGS.minWidthMm); // 17.5 mm image is narrower than the minimum
    expect(size.height).toBe(2 * (35 + DEFAULT_SETTINGS.baseHeightMm));
  });

  it('adds a reinforcement flap of two base strips for the folded paper foot', () => {
    const settings = { ...DEFAULT_SETTINGS, baseStyle: 'folded' as const };
    const size = cardSize(figure(), settings);
    expect(size.height).toBe(2 * (35 + settings.baseHeightMm) + 2 * settings.baseHeightMm);
  });

  it('limits the height so a figure always fits on one sheet', () => {
    const square = figure({ front: side(1000, 1000) });
    const max = maxFigureHeightMm(square, DEFAULT_SETTINGS);
    const size = cardSize({ ...square, heightMm: max }, DEFAULT_SETTINGS);
    const area = printableArea(DEFAULT_SETTINGS);
    const fitsUpright = size.width <= area.width && size.height <= area.height;
    const fitsRotated = size.height <= area.width && size.width <= area.height;
    expect(fitsUpright || fitsRotated).toBe(true);
  });
});

describe('layoutPages', () => {
  it('creates one lettered card per copy', () => {
    const { pages } = layoutPages([figure({ count: 3 })], DEFAULT_SETTINGS);
    expect(pages).toHaveLength(1);
    expect(pages[0].cards.map((c) => c.letter)).toEqual(['A', 'B', 'C']);
  });

  describe.each(['rows', 'compact'] as const)('%s packing', (packing) => {
    const settings = { ...DEFAULT_SETTINGS, packing, gapMm: 2 };
    const mixedFigures = [
      figure({ id: 'a', count: 5, heightMm: 30 }),
      figure({ id: 'b', count: 4, heightMm: 60, front: side(1500, 1000) }),
      figure({ id: 'c', count: 7, heightMm: 20 }),
      figure({ id: 'd', count: 3, heightMm: 90 }),
    ];

    it('places every copy exactly once', () => {
      const { pages } = layoutPages(mixedFigures, settings);
      const placed = pages.flatMap((page) => page.cards.map((c) => `${c.figureId}${c.letter}`)).sort();
      const expected = mixedFigures.flatMap((f) => Array.from({ length: f.count }, (_, i) => `${f.id}${indexToLetters(i)}`)).sort();
      expect(placed).toEqual(expected);
    });

    it('keeps all cards inside the printable area and spills onto new pages', () => {
      const paper = PAPER_SIZES_MM[settings.paper];
      const { pages } = layoutPages([figure({ count: 60 }), ...mixedFigures], settings);
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        for (const r of page.cards.map(footprintRect)) {
          expect(r.x).toBeGreaterThanOrEqual(settings.marginMm - 0.01);
          expect(r.y).toBeGreaterThanOrEqual(settings.marginMm - 0.01);
          expect(r.x + r.w).toBeLessThanOrEqual(paper.width - settings.marginMm + 0.01);
          expect(r.y + r.h).toBeLessThanOrEqual(paper.height - settings.marginMm - 8 + 0.01); // 8 mm ruler
        }
      }
    });

    it('does not overlap cards and keeps the gap between them', () => {
      const { pages } = layoutPages(mixedFigures, settings);
      for (const page of pages) {
        const rects = page.cards.map(footprintRect);
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            const g = settings.gapMm - 0.01;
            const tooClose = a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
            expect(tooClose).toBe(false);
          }
        }
      }
    });
  });

  it('compact packing never needs more pages than row packing', () => {
    const figures = [
      figure({ id: 'a', count: 13, heightMm: 42 }),
      figure({ id: 'b', count: 9, heightMm: 25, front: side(1400, 1000) }),
      figure({ id: 'c', count: 11, heightMm: 70 }),
    ];
    const rows = layoutPages(figures, { ...DEFAULT_SETTINGS, packing: 'rows' });
    const compact = layoutPages(figures, { ...DEFAULT_SETTINGS, packing: 'compact' });
    expect(compact.pages.length).toBeLessThanOrEqual(rows.pages.length);
  });

  it('rotates cards that only fit sideways', () => {
    // Very wide creature: image width exceeds the page width but the card fits rotated.
    const wide = figure({ front: side(3000, 1000) });
    const heightMm = maxFigureHeightMm(wide, DEFAULT_SETTINGS);
    const { pages, oversizedFigureIds } = layoutPages([{ ...wide, heightMm }], DEFAULT_SETTINGS);
    expect(oversizedFigureIds).toEqual([]);
    expect(pages[0].cards).toHaveLength(1);
  });
});

describe('inGameMetres', () => {
  const heights = DEFAULT_SETTINGS.categoryHeightsMm;
  it('maps the category lines to their in-game sizes', () => {
    expect(inGameMetres(heights.small, heights)).toBeCloseTo(1);
    expect(inGameMetres(heights.medium, heights)).toBeCloseTo(1.8);
    expect(inGameMetres(heights.large, heights)).toBeCloseTo(IN_GAME_METRES.large);
    expect(inGameMetres(heights.huge, heights)).toBeCloseTo(5);
    expect(inGameMetres(heights.gargantuan, heights)).toBeCloseTo(10);
  });

  it('interpolates between lines and extrapolates beyond them', () => {
    expect(inGameMetres((heights.huge + heights.gargantuan) / 2, heights)).toBeCloseTo(7.5);
    expect(inGameMetres(heights.small / 2, heights)).toBeCloseTo(0.5);
    expect(inGameMetres(heights.gargantuan + (heights.gargantuan - heights.huge), heights)).toBeCloseTo(15);
  });
});

describe('formatCategoryInGame', () => {
  it('marks only the largest category as open-ended', () => {
    expect(formatCategoryInGame('gargantuan', DEFAULT_SETTINGS)).toBe('10 m+');
    expect(formatCategoryInGame('huge', DEFAULT_SETTINGS)).toBe('5 m');
  });
});

describe('inGameToMm', () => {
  it('inverts inGameMetres, including beyond the largest category', () => {
    const heights = DEFAULT_SETTINGS.categoryHeightsMm;
    for (const metres of [0.5, 1, 2.4, 3, 7.5, 10, 15, 50, 100]) {
      expect(inGameMetres(inGameToMm(metres, heights), heights)).toBeCloseTo(metres);
    }
  });
});

describe('parseDecimal', () => {
  it('accepts a decimal point or comma', () => {
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 7 ')).toBe(7);
    expect(parseDecimal(',5')).toBe(0.5);
  });

  it('rejects anything that is not a number', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('12a')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });
});

describe('in-game values keep two decimals', () => {
  it('round-trips 1.48 m without rounding', () => {
    const heights = DEFAULT_SETTINGS.categoryHeightsMm;
    const mm = inGameToMm(1.48, heights);
    expect(formatInGame(mm, heights, 'mm')).toBe('1.48 m');
    expect(formatInGame(inGameToMm(3, heights), heights, 'mm')).toBe('3 m');
  });
});

const PAPERS = Object.keys(PAPER_SIZES_MM) as PaperSize[];

describe('every paper size', () => {
  for (const paper of PAPERS) {
    for (const packing of ['rows', 'compact'] as PackingMode[]) {
      it(`${paper} / ${packing}: keeps every card inside the printable area`, () => {
        const settings = { ...DEFAULT_SETTINGS, paper, packing, gapMm: 3 };
        const area = printableArea(settings);
        const figures = [
          figure({ id: 'a', count: 9, heightMm: 30 }),
          figure({ id: 'b', count: 5, heightMm: 55, front: side(1800, 1000) }),
          figure({ id: 'c', count: 12, heightMm: 15 }),
        ].map((f) => ({ ...f, heightMm: Math.min(f.heightMm, maxFigureHeightMm(f, settings)) }));
        const { pages, oversizedFigureIds } = layoutPages(figures, settings);
        expect(oversizedFigureIds).toEqual([]);
        for (const page of pages) {
          for (const r of page.cards.map(footprintRect)) {
            expect(r.x).toBeGreaterThanOrEqual(settings.marginMm - 0.01);
            expect(r.y).toBeGreaterThanOrEqual(settings.marginMm - 0.01);
            expect(r.x + r.w).toBeLessThanOrEqual(settings.marginMm + area.width + 0.01);
            expect(r.y + r.h).toBeLessThanOrEqual(settings.marginMm + area.height + 0.01);
          }
        }
      });
    }
  }
});

describe('planFooter', () => {
  // Canvas text measuring is not available here, so the font is modelled by a width per character.
  // 1.5 mm/char is well above any real sans-serif at the 2.4 mm footer size.
  const measurer = (mmPerChar: number) => (text: string) => text.length * mmPerChar;

  it('never places anything past the right margin, on any sheet and any font width', () => {
    for (const paper of PAPERS) {
      for (const margin of [0, 6, 15, 30]) {
        for (const mmPerChar of [0.8, 1.1, 1.5]) {
          for (const showRulers of [true, false]) {
            const width = PAPER_SIZES_MM[paper].width;
            const left = margin;
            const right = width - margin;
            const textWidth = measurer(mmPerChar);
            const plan = planFooter(left, right, showRulers, '1/2', textWidth);
            const where = `${paper} margin=${margin} ${mmPerChar}mm/char rulers=${showRulers}`;

            for (const ruler of plan.rulers) {
              expect(ruler.x, where).toBeGreaterThanOrEqual(left - 0.01);
              const blockWidth = Math.max(ruler.lengthMm, textWidth(ruler.label));
              expect(ruler.x + blockWidth, where).toBeLessThanOrEqual(right + 0.01);
            }
            if (plan.noteX !== null) {
              expect(plan.noteX + textWidth(CALIBRATION_NOTE), where).toBeLessThanOrEqual(right + 0.01);
            }
            if (plan.rightLabel) {
              expect(right - textWidth(plan.rightLabel), where).toBeGreaterThanOrEqual(left - 0.01);
            }
          }
        }
      }
    }
  });

  it('never lets the blocks overlap each other', () => {
    const textWidth = measurer(1.2);
    for (const paper of PAPERS) {
      const right = PAPER_SIZES_MM[paper].width - 6;
      const plan = planFooter(6, right, true, '1/2', textWidth);
      const spans = plan.rulers.map((r) => [r.x, r.x + Math.max(r.lengthMm, textWidth(r.label))] as const);
      if (plan.noteX !== null) spans.push([plan.noteX, plan.noteX + textWidth(CALIBRATION_NOTE)] as const);
      if (plan.rightLabel) spans.push([right - textWidth(plan.rightLabel), right] as const);
      spans.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) expect(spans[i][0], paper).toBeGreaterThanOrEqual(spans[i - 1][1] - 0.01);
    }
  });

  it('keeps the millimetre ruler and the page number even on the narrowest sheet', () => {
    // A5 cannot fit the full-length rulers plus every label, but the essentials must survive.
    const plan = planFooter(6, 142, true, '1/2', measurer(1.5));
    expect(plan.rulers.length).toBeGreaterThanOrEqual(1);
    expect(plan.rulers[0].label).toMatch(/mm$/);
    expect(plan.rightLabel).not.toBe('');
  });

  it('drops the tool name before the page number when space is tight', () => {
    // 20 mm fits "3/7" (4.5 mm) but not the full name (40.5 mm).
    const narrow = planFooter(0, 20, false, '3/7', measurer(1.5));
    expect(narrow.rightLabel).toBe('3/7');
    const wide = planFooter(0, 300, false, '3/7', measurer(1.5));
    expect(wide.rightLabel).toBe(`${BRAND} · 3/7`);
  });
});

describe('footerReserveMm', () => {
  it('always reserves space, so the page number can never sit on top of a card', () => {
    expect(footerReserveMm({ ...DEFAULT_SETTINGS, calibrationRuler: true })).toBeGreaterThan(0);
    expect(footerReserveMm({ ...DEFAULT_SETTINGS, calibrationRuler: false })).toBeGreaterThan(0);
  });
});

describe('normalizeProject', () => {
  const image = { id: 'img', dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 200 };
  const project = (figures: unknown[]) => ({
    app: 'ttrpg-paper-mini-tool',
    version: 1,
    settings: DEFAULT_SETTINGS,
    figures,
    images: { img: image },
  });

  it('rejects files from other apps', () => {
    expect(() => normalizeProject({ app: 'something-else' })).toThrow(/not a TTRPG/);
  });

  it('fills in missing figure fields instead of crashing later', () => {
    const { figures } = normalizeProject(project([{ id: 'f1', imageId: 'img' }]));
    expect(figures).toHaveLength(1);
    expect(figures[0].front.crop).toEqual({ x: 0, y: 0, width: 100, height: 200 });
    expect(figures[0].front.transform).toEqual(IDENTITY_TRANSFORM);
    expect(figures[0].shape).toBe('flat');
    expect(figures[0].back).toBeNull();
    expect(figures[0].count).toBe(1);
    expect(figures[0].color).toBe('none');
    expect(Number.isFinite(figures[0].heightMm)).toBe(true);
  });

  it('drops figures whose image is missing', () => {
    const { figures } = normalizeProject(project([{ id: 'f1', imageId: 'img' }, { id: 'f2', imageId: 'gone' }]));
    expect(figures.map((f) => f.id)).toEqual(['f1']);
  });

  it('reports a damaged file rather than silently opening an empty project', () => {
    expect(() => normalizeProject(project([{ id: 'f1', imageId: 'gone' }]))).toThrow(/damaged/);
  });

  it('repairs values that would otherwise produce NaN geometry', () => {
    const { figures } = normalizeProject(
      project([{ id: 'ok', imageId: 'img', count: NaN, heightMm: 'tall' }, { id: 'bad', imageId: 'img', front: side(0, 5) }]),
    );
    // A zero-width crop would divide by zero in the aspect ratio, so that figure is dropped;
    // the repairable one keeps its defaults.
    expect(figures.map((f) => f.id)).toEqual(['ok']);
    expect(figures[0].count).toBe(1);
    expect(Number.isFinite(figures[0].heightMm)).toBe(true);
  });
});

describe('sides', () => {
  it('swaps the aspect ratio on a quarter turn', () => {
    const upright = side(500, 1000);
    expect(sideAspect(upright)).toBeCloseTo(0.5);
    expect(sideAspect({ ...upright, transform: { ...IDENTITY_TRANSFORM, quarterTurns: 1 } })).toBeCloseTo(2);
    expect(sideAspect({ ...upright, transform: { ...IDENTITY_TRANSFORM, quarterTurns: 2 } })).toBeCloseTo(0.5);
  });

  it('wraps rotation around instead of running off the end', () => {
    expect(rotateSide({ ...IDENTITY_TRANSFORM, quarterTurns: 3 }, 1).quarterTurns).toBe(0);
    expect(rotateSide({ ...IDENTITY_TRANSFORM, quarterTurns: 0 }, -1).quarterTurns).toBe(3);
  });

  it('sizes the card by the widest side, not just the front', () => {
    const narrowFront = figure({ front: side(500, 1000), heightMm: 40 });
    const withWideBack = { ...narrowFront, back: side(1500, 1000, 'img2') };
    expect(widestSideMm(narrowFront)).toBeCloseTo(20);
    expect(widestSideMm(withWideBack)).toBeCloseTo(60);
    expect(cardSize(withWideBack, DEFAULT_SETTINGS).width).toBeCloseTo(60);
  });

  it('reports the resolution of the coarsest side', () => {
    const f = figure({ front: side(1000, 2000), back: side(100, 200, 'img2'), heightMm: 50 });
    // The back has a tenth of the pixels, so it decides.
    expect(effectiveDpi(f)).toBeCloseTo(effectiveDpi({ ...f, front: f.back!, back: null }));
  });

  it('keeps a figure printable when a rotated side is the wide one', () => {
    const f = figure({ front: { ...side(500, 1000), transform: { ...IDENTITY_TRANSFORM, quarterTurns: 1 } } });
    const max = maxFigureHeightMm(f, DEFAULT_SETTINGS);
    const card = cardSize({ ...f, heightMm: max }, DEFAULT_SETTINGS);
    const area = printableArea(DEFAULT_SETTINGS);
    const fits = (card.width <= area.width && card.height <= area.height) ||
      (card.height <= area.width && card.width <= area.height);
    expect(fits).toBe(true);
  });
});

describe('migration to front/back sides', () => {
  const image = { id: 'img', dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 200 };
  const image2 = { id: 'img2', dataUrl: 'data:image/png;base64,BBBB', width: 300, height: 400 };
  const project = (figures: unknown[], images: Record<string, unknown> = { img: image }) => ({
    app: 'ttrpg-paper-mini-tool',
    version: 1,
    settings: DEFAULT_SETTINGS,
    figures,
    images,
  });

  it('moves a pre-prism figure onto the front side untouched', () => {
    const legacy = { id: 'f1', imageId: 'img', crop: { x: 5, y: 7, width: 50, height: 90 }, heightMm: 42 };
    const { figures } = normalizeProject(project([legacy]));
    expect(figures[0].front).toEqual({
      imageId: 'img',
      crop: { x: 5, y: 7, width: 50, height: 90 },
      transform: IDENTITY_TRANSFORM,
    });
    expect(figures[0].shape).toBe('flat');
    expect(figures[0].back).toBeNull();
    expect(figures[0].heightMm).toBe(42);
  });

  it('round-trips a figure that already has both sides', () => {
    const modern = {
      id: 'f1',
      shape: 'prism',
      front: { imageId: 'img', crop: { x: 0, y: 0, width: 100, height: 200 }, transform: IDENTITY_TRANSFORM },
      back: {
        imageId: 'img2',
        crop: { x: 0, y: 0, width: 300, height: 400 },
        transform: { quarterTurns: 1, flipX: true, flipY: false },
      },
    };
    const { figures } = normalizeProject(project([modern], { img: image, img2: image2 }));
    expect(figures[0].shape).toBe('prism');
    expect(figures[0].back?.imageId).toBe('img2');
    expect(figures[0].back?.transform).toEqual({ quarterTurns: 1, flipX: true, flipY: false });
  });

  it('drops a back side whose image is gone but keeps the figure', () => {
    const f = { id: 'f1', front: { imageId: 'img', crop: { x: 0, y: 0, width: 10, height: 10 } }, back: { imageId: 'gone' } };
    const { figures } = normalizeProject(project([f]));
    expect(figures).toHaveLength(1);
    expect(figures[0].back).toBeNull();
  });

  it('repairs a broken transform instead of trusting it', () => {
    const f = {
      id: 'f1',
      front: { imageId: 'img', crop: { x: 0, y: 0, width: 10, height: 10 }, transform: { quarterTurns: 9, flipX: 'yes' } },
    };
    const { figures } = normalizeProject(project([f]));
    expect(figures[0].front.transform).toEqual({ quarterTurns: 1, flipX: false, flipY: false });
  });

  it('falls back to defaults for unknown prism settings', () => {
    const { settings } = normalizeProject({
      ...project([]),
      settings: { ...DEFAULT_SETTINGS, prismLabel: 'sideways', prismWidths: 42, glueTab: 'yes' },
    });
    expect(settings.prismLabel).toBe(DEFAULT_SETTINGS.prismLabel);
    expect(settings.prismWidths).toBe(DEFAULT_SETTINGS.prismWidths);
    expect(settings.glueTab).toBe(false);
  });

  it('gives projects saved before prisms the current prism defaults', () => {
    const { settings } = normalizeProject({ ...project([]), settings: { paper: 'a4' } });
    expect(settings.prismLabel).toBe(DEFAULT_SETTINGS.prismLabel);
    expect(settings.glueTab).toBe(DEFAULT_SETTINGS.glueTab);
  });
});

describe('prism geometry', () => {
  const prism = (overrides: Partial<Figure> = {}) =>
    figure({ shape: 'prism', front: side(500, 1000), heightMm: 40, ...overrides });

  it('lays out three faces plus the glue tab', () => {
    const f = prism({ back: side(1000, 1000, 'img2') });
    const { right, left, back } = prismPanelWidths(f, DEFAULT_SETTINGS);
    expect(right).toBeCloseTo(20); // the main image: 500/1000 * 40
    expect(back).toBeCloseTo(40); // 1000/1000 * 40
    expect(left).toBeCloseTo(right); // no artwork of its own: the main image mirrored
    const card = cardSize(f, DEFAULT_SETTINGS);
    expect(card.width).toBeCloseTo(right + left + back + glueTabMm(DEFAULT_SETTINGS));
    expect(card.height).toBeCloseTo(40 + prismBandMm(DEFAULT_SETTINGS));
  });

  it('reuses the front width for the back face when there is no back artwork', () => {
    const { right, back } = prismPanelWidths(prism(), DEFAULT_SETTINGS);
    expect(back).toBeCloseTo(right);
  });

  it('squares the tube off in equal-width mode', () => {
    const f = prism({ back: side(1000, 1000, 'img2') });
    const settings = { ...DEFAULT_SETTINGS, prismWidths: 'equal' as const };
    const { left, back, right } = prismPanelWidths(f, settings);
    expect(left).toBeCloseTo(40);
    expect(back).toBeCloseTo(40);
    expect(right).toBeCloseTo(40);
    expect(cardSize(f, settings).width).toBeCloseTo(3 * 40 + glueTabMm(settings));
  });

  it('drops the glue tab from the width when it is switched off', () => {
    const f = prism();
    const withTab = cardSize(f, DEFAULT_SETTINGS).width;
    const without = cardSize(f, { ...DEFAULT_SETTINGS, glueTab: false }).width;
    expect(withTab - without).toBeCloseTo(glueTabMm(DEFAULT_SETTINGS));
  });

  it('adds no band height when nothing is printed along the bottom', () => {
    const f = prism();
    expect(cardSize(f, { ...DEFAULT_SETTINGS, prismLabel: 'none' }).height).toBeCloseTo(f.heightMm);
  });

  it('keeps a prism at its maximum height on the sheet', () => {
    for (const prismWidths of ['auto', 'equal'] as const) {
      for (const glueTab of [true, false]) {
        for (const paper of PAPERS) {
          const settings = { ...DEFAULT_SETTINGS, paper, prismWidths, glueTab };
          const f = prism({ back: side(1400, 1000, 'img2') });
          const max = maxFigureHeightMm(f, settings);
          const card = cardSize({ ...f, heightMm: max }, settings);
          const area = printableArea(settings);
          const fits =
            (card.width <= area.width + 0.01 && card.height <= area.height + 0.01) ||
            (card.height <= area.width + 0.01 && card.width <= area.height + 0.01);
          expect(fits, `${paper}/${prismWidths}/tab=${glueTab}`).toBe(true);
        }
      }
    }
  });

  it('is wider and shorter than the same figure printed flat', () => {
    const f = prism({ back: side(500, 1000, 'img2') });
    const asPrism = cardSize(f, DEFAULT_SETTINGS);
    const asFlat = cardSize({ ...f, shape: 'flat' }, DEFAULT_SETTINGS);
    expect(asPrism.width).toBeGreaterThan(asFlat.width);
    expect(asPrism.height).toBeLessThan(asFlat.height);
  });

  it('packs prisms onto pages like any other card', () => {
    const figures = [prism({ id: 'p', count: 8 }), figure({ id: 'f', count: 4 })];
    const { pages, oversizedFigureIds } = layoutPages(figures, DEFAULT_SETTINGS);
    expect(oversizedFigureIds).toEqual([]);
    const placed = pages.flatMap((page) => page.cards.map((c) => c.figureId));
    expect(placed.filter((id) => id === 'p')).toHaveLength(8);
    expect(placed.filter((id) => id === 'f')).toHaveLength(4);
  });
});

describe('back artwork on flat minis', () => {
  it('sizes the card by the back when the back is the wider image', () => {
    const f = figure({ front: side(400, 1000), back: side(900, 1000, 'img2'), heightMm: 40 });
    expect(cardSize(f, DEFAULT_SETTINGS).width).toBeCloseTo(36);
    expect(cardSize({ ...f, back: null }, DEFAULT_SETTINGS).width).toBe(DEFAULT_SETTINGS.minWidthMm);
  });

  it('keeps both sides on the sheet at the maximum height', () => {
    const f = figure({ front: side(400, 1000), back: side(2600, 1000, 'img2') });
    const max = maxFigureHeightMm(f, DEFAULT_SETTINGS);
    const card = cardSize({ ...f, heightMm: max }, DEFAULT_SETTINGS);
    const area = printableArea(DEFAULT_SETTINGS);
    const fits =
      (card.width <= area.width + 0.01 && card.height <= area.height + 0.01) ||
      (card.height <= area.width + 0.01 && card.width <= area.height + 0.01);
    expect(fits).toBe(true);
  });

  it('accounts for a rotated back side when sizing the card', () => {
    const upright = side(300, 1000, 'img2');
    const turned = { ...upright, transform: { ...IDENTITY_TRANSFORM, quarterTurns: 1 as const } };
    const f = figure({ front: side(300, 1000), heightMm: 30 });
    expect(cardSize({ ...f, back: turned }, DEFAULT_SETTINGS).width).toBeGreaterThan(
      cardSize({ ...f, back: upright }, DEFAULT_SETTINGS).width,
    );
  });
});

describe('copying the front onto the back', () => {
  it('shares the image but keeps the two sides independent afterwards', () => {
    const front = { imageId: 'img', crop: { x: 1, y: 2, width: 30, height: 40 }, transform: IDENTITY_TRANSFORM };
    const copied = { ...front };
    expect(copied).toEqual(front);
    // Mirroring the copy must not reach back into the original.
    const mirrored = { ...copied, transform: { ...copied.transform, flipX: true } };
    expect(front.transform.flipX).toBe(false);
    expect(mirrored.transform.flipX).toBe(true);
    expect(mirrored.imageId).toBe(front.imageId);
  });

  it('counts a shared image only once, so removing one side keeps it', () => {
    const f = figure({ front: side(100, 200), back: side(100, 200) });
    expect(figureImageIds(f)).toEqual(['img']);
  });
});

describe('stageGap', () => {
  const LABEL = 110;
  const FIXED = 40;

  it('keeps neighbouring labels apart at every item width', () => {
    for (const w of [0, 4, 12, 30, 60, 90, 118, 200, 400]) {
      // Each label is centred on its item, so the centres must be at least one label apart.
      const centreDistance = w + stageGap([w, w], 16, LABEL, FIXED);
      expect(centreDistance, `width ${w}`).toBeGreaterThanOrEqual(LABEL);
    }
  });

  it('holds the gap steady once the images are wider than their labels', () => {
    for (const w of [130, 160, 240, 400]) expect(stageGap([w, w], 16, LABEL, FIXED)).toBe(FIXED);
  });

  it('opens the gap only for images narrower than their labels', () => {
    expect(stageGap([20, 20], 16, LABEL, FIXED)).toBeGreaterThan(FIXED);
    expect(stageGap([300, 300], 16, LABEL, FIXED)).toBe(FIXED);
  });

  it('falls back to the label rule when no fixed gap is asked for', () => {
    expect(stageGap([20, 20], 16, LABEL)).toBe(stageGap([20, 20], 16, LABEL, 0));
  });
});

describe('custom base colour', () => {
  it('resolves presets from the palette and custom from the figure', () => {
    expect(figureColorHex(figure({ color: 'blue' }))).toBe(BASE_COLORS.blue.hex);
    expect(figureColorHex(figure({ color: 'none' }))).toBeNull();
    expect(figureColorHex(figure({ color: 'custom', customColorHex: '#123456' }))).toBe('#123456');
  });

  it('keeps the custom colour while another one is picked', () => {
    const picked = figure({ color: 'custom', customColorHex: '#123456' });
    const switched = { ...picked, color: 'red' as const };
    expect(figureColorHex(switched)).toBe(BASE_COLORS.red.hex);
    expect(figureColorHex({ ...switched, color: 'custom' })).toBe('#123456');
  });

  it('still picks readable text on a custom colour', () => {
    expect(readableTextColor('#ffffff')).toBe('#111111');
    expect(readableTextColor('#000000')).toBe('#ffffff');
  });

  describe('when loading a project', () => {
    const image = { id: 'img', dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 200 };
    const load = (fields: Record<string, unknown>) =>
      normalizeProject({
        app: 'ttrpg-paper-mini-tool',
        version: 1,
        settings: DEFAULT_SETTINGS,
        figures: [{ id: 'f1', imageId: 'img', ...fields }],
        images: { img: image },
      }).figures[0];

    it('gives figures saved before custom colours the default', () => {
      expect(load({}).customColorHex).toBe(DEFAULT_CUSTOM_COLOR);
    });

    it('keeps a valid colour and replaces anything else', () => {
      expect(load({ customColorHex: '#AbCdEf' }).customColorHex).toBe('#AbCdEf');
      for (const bad of ['red', '#12345', 'javascript:alert(1)', 42, null]) {
        expect(load({ customColorHex: bad }).customColorHex, String(bad)).toBe(DEFAULT_CUSTOM_COLOR);
      }
    });

    it('accepts custom as a colour choice', () => {
      expect(load({ color: 'custom' }).color).toBe('custom');
      expect(load({ color: 'chartreuse' }).color).toBe('none');
    });
  });
});

describe('colour conversion', () => {
  it('round-trips every hue back to the same hex', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#7a4fb8', '#e3bf4a', '#123456', '#8c8c8c']) {
      expect(hsvToHex(hexToHsv(hex)), hex).toBe(hex);
    }
  });

  it('places the primaries on the hue circle where they belong', () => {
    expect(hexToHsv('#ff0000').h).toBeCloseTo(0);
    expect(hexToHsv('#00ff00').h).toBeCloseTo(120);
    expect(hexToHsv('#0000ff').h).toBeCloseTo(240);
    expect(hexToHsv('#ffff00').h).toBeCloseTo(60);
  });

  it('reports grey as unsaturated and black as dark', () => {
    expect(hexToHsv('#8c8c8c').s).toBeCloseTo(0);
    expect(hexToHsv('#000000').v).toBeCloseTo(0);
    expect(hexToHsv('#ffffff').v).toBeCloseTo(1);
  });

  it('survives values outside the usual ranges', () => {
    expect(hsvToHex({ h: 400, s: 1, v: 1 })).toBe(hsvToHex({ h: 40, s: 1, v: 1 }));
    expect(hsvToHex({ h: -20, s: 1, v: 1 })).toBe(hsvToHex({ h: 340, s: 1, v: 1 }));
    expect(hsvToHex({ h: 0, s: 2, v: 2 })).toBe('#ff0000');
    expect(hsvToHex({ h: 0, s: -1, v: -1 })).toBe('#000000');
  });

  it('accepts what people actually type into a hex field', () => {
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef');
    expect(normalizeHex('abcdef')).toBe('#abcdef');
    expect(normalizeHex('  #f0a  ')).toBe('#ff00aa');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('rebeccapurple')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

describe('remembered custom colours', () => {
  it('puts the newest first', () => {
    expect(rememberColor(['#111111'], '#222222')).toEqual(['#222222', '#111111']);
  });

  it('moves a colour up instead of listing it twice', () => {
    expect(rememberColor(['#111111', '#222222', '#333333'], '#222222')).toEqual([
      '#222222',
      '#111111',
      '#333333',
    ]);
  });

  it('ignores the spelling when comparing', () => {
    expect(rememberColor(['#AABBCC'], '#aabbcc')).toEqual(['#aabbcc']);
  });

  it('forgets the oldest once the row is full', () => {
    let colors: string[] = [];
    for (let i = 0; i < REMEMBERED_COLORS + 3; i++) {
      colors = rememberColor(colors, `#0000${i.toString(16).padStart(2, '0')}`);
    }
    expect(colors).toHaveLength(REMEMBERED_COLORS);
    expect(colors[0]).toBe(`#0000${(REMEMBERED_COLORS + 2).toString(16).padStart(2, '0')}`);
  });

  it('drops anything unusable when a project is loaded', () => {
    const { settings } = normalizeProject({
      app: 'ttrpg-paper-mini-tool',
      version: 1,
      settings: { ...DEFAULT_SETTINGS, customColors: ['#123456', 'red', 42, null, '#abcdef'] },
      figures: [],
      images: {},
    });
    expect(settings.customColors).toEqual(['#123456', '#abcdef']);
  });
});

describe('prism front-left face', () => {
  const prism = (overrides: Partial<Figure> = {}) =>
    figure({ shape: 'prism', front: side(500, 1000), heightMm: 40, ...overrides });

  it('takes its own width once it has artwork', () => {
    const f = prism({ left: side(1500, 1000, 'img3') });
    const { right, left } = prismPanelWidths(f, DEFAULT_SETTINGS);
    expect(right).toBeCloseTo(20); // the main image
    expect(left).toBeCloseTo(60);
    expect(cardSize(f, DEFAULT_SETTINGS).width).toBeCloseTo(20 + 20 + 60 + glueTabMm(DEFAULT_SETTINGS));
  });

  it('counts the widest of all three in equal-width mode', () => {
    const f = prism({ back: side(800, 1000, 'img2'), left: side(1500, 1000, 'img3') });
    const settings = { ...DEFAULT_SETTINGS, prismWidths: 'equal' as const };
    expect(cardSize(f, settings).width).toBeCloseTo(3 * 60 + glueTabMm(settings));
  });

  it('still fits the sheet at its maximum height with a wide front-left face', () => {
    for (const paper of PAPERS) {
      const settings = { ...DEFAULT_SETTINGS, paper };
      const f = prism({ back: side(900, 1000, 'img2'), left: side(2000, 1000, 'img3') });
      const card = cardSize({ ...f, heightMm: maxFigureHeightMm(f, settings) }, settings);
      const area = printableArea(settings);
      const fits =
        (card.width <= area.width + 0.01 && card.height <= area.height + 0.01) ||
        (card.height <= area.width + 0.01 && card.width <= area.height + 0.01);
      expect(fits, paper).toBe(true);
    }
  });

  it('is printed only while the figure is a prism, but kept either way', () => {
    const left = side(700, 1000, 'img3');
    const asPrism = prism({ left });
    const asFlat = { ...asPrism, shape: 'flat' as const };
    expect(printedSides(asPrism)).toContain(left);
    expect(printedSides(asFlat)).not.toContain(left);
    // The image stays referenced, so switching back to a prism finds the face intact.
    expect(figureImageIds(asFlat)).toContain('img3');
  });

  it('leaves the flat card size alone', () => {
    const flat = figure({ front: side(500, 1000), left: side(3000, 1000, 'img3'), heightMm: 40 });
    expect(cardSize(flat, DEFAULT_SETTINGS)).toEqual(cardSize({ ...flat, left: null }, DEFAULT_SETTINGS));
  });

  it('starts as the main image mirrored when copied from it', () => {
    const front = side(500, 1000);
    expect(mirrored(front).transform.flipX).toBe(true);
    expect(mirrored(mirrored(front)).transform).toEqual(front.transform);
    expect(mirrored(front).imageId).toBe(front.imageId);
  });

  it('survives a project round trip and is dropped when its image is gone', () => {
    const image = { id: 'img', dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 200 };
    const load = (fields: Record<string, unknown>) =>
      normalizeProject({
        app: 'ttrpg-paper-mini-tool',
        version: 1,
        settings: DEFAULT_SETTINGS,
        figures: [{ id: 'f1', shape: 'prism', front: { imageId: 'img' }, ...fields }],
        images: { img: image },
      }).figures[0];
    const mirroredSide = { imageId: 'img', transform: { quarterTurns: 0, flipX: true, flipY: false } };
    expect(load({ left: mirroredSide }).left?.transform.flipX).toBe(true);
    expect(load({ left: { imageId: 'missing' } }).left).toBeNull();
    expect(load({}).left).toBeNull();
    // Saved earlier on this branch under its old name.
    expect(load({ right: mirroredSide }).left?.transform.flipX).toBe(true);
  });
});

describe('text on flat minis', () => {
  it('defaults to printing it, and projects saved before keep doing so', () => {
    expect(DEFAULT_SETTINGS.flatText).toBe(true);
    const { settings } = normalizeProject({
      app: 'ttrpg-paper-mini-tool',
      version: 1,
      settings: { paper: 'a4' },
      figures: [],
      images: {},
    });
    expect(settings.flatText).toBe(true);
  });

  it('does not change the card size when switched off', () => {
    const f = figure();
    expect(cardSize(f, { ...DEFAULT_SETTINGS, flatText: false })).toEqual(cardSize(f, DEFAULT_SETTINGS));
  });
});

describe('flat mini back, seen from behind', () => {
  it('defaults to the main image mirrored', () => {
    const f = figure({ front: side(500, 1000) });
    expect(flatBack(f).transform.flipX).toBe(true);
    expect(flatBack(f).imageId).toBe(f.front.imageId);
  });

  it('uses its own artwork once it has some, as it is', () => {
    const back = side(400, 1000, 'img2');
    expect(flatBack(figure({ back }))).toBe(back);
  });

  describe('"Use main"', () => {
    const run = (shape: 'flat' | 'prism', which: 'back' | 'left') => {
      const f = figure({ id: 'x', shape });
      useStore.setState({ figures: [f], settings: DEFAULT_SETTINGS });
      useStore.getState().copyMainTo('x', which);
      return useStore.getState().figures[0][which]!;
    };

    it('starts a flat back mirrored, so it looks as it did without artwork', () => {
      expect(run('flat', 'back').transform.flipX).toBe(true);
    });

    it('starts a prism front-left face mirrored for the same reason', () => {
      expect(run('prism', 'left').transform.flipX).toBe(true);
    });

    it('copies the main image unchanged onto a prism back, which was blank', () => {
      expect(run('prism', 'back').transform.flipX).toBe(false);
    });
  });
});

describe('prism strip order', () => {
  const f = figure({
    shape: 'prism',
    front: side(500, 1000),
    left: side(700, 1000, 'img3'),
    back: side(900, 1000, 'img2'),
    heightMm: 40,
  });

  it('prints front right, front left, then the back', () => {
    // The two front faces meet in a plain fold at the figure's front edge; the glued seam closes the
    // tube at the back instead.
    expect(prismFaces(f, DEFAULT_SETTINGS).map((face) => face.key)).toEqual(['front', 'left', 'back']);
  });

  it('lays the faces edge to edge from the left', () => {
    const faces = prismFaces(f, DEFAULT_SETTINGS);
    expect(faces.map((face) => Math.round(face.x))).toEqual([0, 20, 48]);
    expect(faces.map((face) => Math.round(face.width))).toEqual([20, 28, 36]);
  });

  it('fills the front-left face with the mirrored main image until it has its own', () => {
    const face = prismFaces({ ...f, left: null }, DEFAULT_SETTINGS).find((candidate) => candidate.key === 'left')!;
    expect(face.side?.imageId).toBe(f.front.imageId);
    expect(face.side?.transform.flipX).toBe(true);
  });

  it('leaves the back face blank without back artwork', () => {
    expect(prismFaces({ ...f, back: null }, DEFAULT_SETTINGS).find((face) => face.key === 'back')!.side).toBeNull();
  });
});
