import { describe, expect, it } from 'vitest';
import type { Figure } from '../types';
import type { PackingMode, PaperSize } from '../types';
import { DEFAULT_SETTINGS, IN_GAME_METRES, PAPER_SIZES_MM } from './constants';
import { cardSize, footerReserveMm, maxFigureHeightMm, printableArea } from './geometry';
import { BRAND, CALIBRATION_NOTE, planFooter } from './render';
import { normalizeProject } from '../store';
import { indexToLetters, nameFromFileName } from './labels';
import { layoutPages } from './layout';
import { parseDecimal } from '../components/controls';
import { formatCategoryInGame, formatInGame, inGameMetres, inGameToMm } from './units';

function footprintRect(c: { x: number; y: number; width: number; height: number; rotated: boolean }) {
  return c.rotated ? { x: c.x, y: c.y, w: c.height, h: c.width } : { x: c.x, y: c.y, w: c.width, h: c.height };
}

function figure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: overrides.id ?? 'f1',
    name: 'Goblin',
    info: '',
    count: 1,
    color: 'none',
    frontImage: { imageId: 'img', crop: { x: 0, y: 0, width: 500, height: 1000 } },
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
    const crop = { x: 0, y: 0, width: 1000, height: 1000 };
    const max = maxFigureHeightMm(crop, DEFAULT_SETTINGS);
    const size = cardSize(figure({ frontImage: { imageId: 'img', crop }, heightMm: max }), DEFAULT_SETTINGS);
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
      figure({ id: 'b', count: 4, heightMm: 60, frontImage: { imageId: 'img', crop: { x: 0, y: 0, width: 1500, height: 1000 } } }),
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
      figure({ id: 'b', count: 9, heightMm: 25, frontImage: { imageId: 'img', crop: { x: 0, y: 0, width: 1400, height: 1000 } } }),
      figure({ id: 'c', count: 11, heightMm: 70 }),
    ];
    const rows = layoutPages(figures, { ...DEFAULT_SETTINGS, packing: 'rows' });
    const compact = layoutPages(figures, { ...DEFAULT_SETTINGS, packing: 'compact' });
    expect(compact.pages.length).toBeLessThanOrEqual(rows.pages.length);
  });

  it('rotates cards that only fit sideways', () => {
    // Very wide creature: image width exceeds the page width but the card fits rotated.
    const crop = { x: 0, y: 0, width: 3000, height: 1000 };
    const heightMm = maxFigureHeightMm(crop, DEFAULT_SETTINGS);
    const { pages, oversizedFigureIds } = layoutPages([figure({ frontImage: { imageId: 'img', crop }, heightMm })], DEFAULT_SETTINGS);
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
          figure({ id: 'b', count: 5, heightMm: 55, frontImage: { imageId: 'img', crop: { x: 0, y: 0, width: 1800, height: 1000 } } }),
          figure({ id: 'c', count: 12, heightMm: 15 }),
        ].map((f) => ({ ...f, heightMm: Math.min(f.heightMm, maxFigureHeightMm(f.frontImage.crop, settings)) }));
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
    expect(figures[0].frontImage.crop).toEqual({ x: 0, y: 0, width: 100, height: 200 });
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
      project([{ id: 'ok', imageId: 'img', count: NaN, heightMm: 'tall' }, { id: 'bad', imageId: 'img', crop: { x: 0, y: 0, width: 0, height: 5 } }]),
    );
    // A zero-width crop would divide by zero in the aspect ratio, so that figure is dropped;
    // the repairable one keeps its defaults.
    expect(figures.map((f) => f.id)).toEqual(['ok']);
    expect(figures[0].count).toBe(1);
    expect(Number.isFinite(figures[0].heightMm)).toBe(true);
  });
});
