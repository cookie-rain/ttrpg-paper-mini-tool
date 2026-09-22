import { create } from 'zustand';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type {
  BaseColor,
  CropRect,
  FaceLayout,
  Figure,
  FigureShape,
  FigureSide,
  ImageTransform,
  PrismBandSides,
  Project,
  SideKey,
  Settings,
  StoredImage,
} from './types';
import {
  BASE_COLORS,
  DEFAULT_CUSTOM_COLOR,
  MIN_FACE_WIDTH_MM,
  DEFAULT_FIGURE_HEIGHT_MM,
  DEFAULT_SETTINGS,
  LEGACY_CATEGORY_HEIGHTS_MM,
  MIN_FIGURE_HEIGHT_MM,
} from './lib/constants';
import { forgetImages, importImageFile } from './lib/image';
import { isHexColor, REMEMBERED_COLORS } from './lib/colors';
import {
  defaultFaces,
  DEFAULT_FACE,
  figureImageIds,
  fullCrop,
  IDENTITY_TRANSFORM,
  linkedFaceAligns,
  makeSide,
  mirrored,
} from './lib/sides';
import { nameFromFileName } from './lib/labels';
import { maxFigureHeightMm } from './lib/geometry';

export type View = 'editor' | 'lineup' | 'print';

/** View options of the lineup. Kept for the session only, not saved with the project. */
export interface LineupOptions {
  hiddenIds: string[];
  showSilhouettes: boolean;
  showHeightLines: boolean;
  /** Which artwork the lineup shows. Figures without a back fall back to their front. */
  showSide: 'front' | 'back';
}

/** View options of the editor. Kept for the session only, not saved with the project. */
export interface EditorOptions {
  showSilhouettes: boolean;
}

const STORAGE_KEY = 'ttrpg-paper-mini-tool/project';
const SAVE_DEBOUNCE_MS = 600;

interface AppState {
  settings: Settings;
  figures: Figure[];
  images: Record<string, StoredImage>;
  selectedId: string | null;
  view: View;
  loaded: boolean;
  lineup: LineupOptions;
  editor: EditorOptions;

  setView: (view: View) => void;
  select: (id: string | null) => void;
  updateLineup: (patch: Partial<LineupOptions>) => void;
  updateEditor: (patch: Partial<EditorOptions>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateFigure: (id: string, patch: Partial<Figure>) => void;
  addImageFiles: (files: File[]) => Promise<void>;
  /** Imports an image and puts it on one side of a figure, replacing whatever was there. */
  setSideImage: (figureId: string, which: SideKey, file: File) => Promise<void>;
  /**
   * Removes the back or front-left artwork. A missing back falls back to the mirrored front (flat) or an
   * empty face (prism); a missing front-left face falls back to the mirrored front.
   */
  clearSide: (figureId: string, which: 'back' | 'left') => void;
  /**
   * Reuses the main image on the back or front left, as a starting point for rotating or mirroring it.
   * A prism's front-left face and a flat mini's back start mirrored, so they look exactly as they did
   * before they had artwork of their own.
   */
  copyMainTo: (figureId: string, which: 'back' | 'left') => void;
  updateSide: (figureId: string, which: SideKey, patch: Partial<FigureSide>) => void;
  /**
   * Sets the printed width of one face of a prism, or clears it back to following the artwork.
   * While all faces are meant to be equally wide, the other two follow along.
   */
  setFaceWidth: (figureId: string, which: SideKey, widthMm: number | null) => void;
  /** Moves the artwork inside a face wider than itself: 0 is the left edge, 1 the right. */
  setFaceAlign: (figureId: string, which: SideKey, align: number) => void;
  duplicateFigure: (id: string) => void;
  removeFigure: (id: string) => void;
  moveFigure: (id: string, direction: -1 | 1) => void;
  clearProject: () => void;
  loadProject: (project: Project) => void;
  toProject: () => Project;
}

const newId = () => crypto.randomUUID();

export const useStore = create<AppState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  figures: [],
  images: {},
  selectedId: null,
  view: 'editor',
  loaded: false,
  lineup: { hiddenIds: [], showSilhouettes: true, showHeightLines: true, showSide: 'front' },
  editor: { showSilhouettes: true },

  setView: (view) => set({ view }),
  updateLineup: (patch) => set((state) => ({ lineup: { ...state.lineup, ...patch } })),
  updateEditor: (patch) => set((state) => ({ editor: { ...state.editor, ...patch } })),
  select: (selectedId) => set({ selectedId }),

  updateSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch };
      // Paper or margin changes can shrink the maximum size; keep every figure printable.
      const figures = state.figures.map((f) => clampFigureHeight(f, settings));
      return { settings, figures };
    }),

  updateFigure: (id, patch) =>
    set((state) => ({
      figures: state.figures.map((f) => (f.id === id ? clampFigureHeight({ ...f, ...patch }, state.settings) : f)),
    })),

  addImageFiles: async (files) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const added: Figure[] = [];
    const addedImages: Record<string, StoredImage> = {};
    for (const file of imageFiles) {
      try {
        const imageId = newId();
        const { image, trim } = await importImageFile(file, imageId);
        addedImages[imageId] = image;
        added.push(
          clampFigureHeight(
            {
              id: newId(),
              name: nameFromFileName(file.name),
              info: '',
              count: 1,
              color: 'none',
              customColorHex: DEFAULT_CUSTOM_COLOR,
              shape: 'flat',
              front: makeSide(imageId, trim),
              back: null,
              left: null,
              heightMm: get().settings.categoryHeightsMm.medium ?? DEFAULT_FIGURE_HEIGHT_MM,
              faces: defaultFaces(),
            },
            get().settings,
          ),
        );
      } catch (error) {
        console.error(`Could not import ${file.name}`, error);
      }
    }
    if (added.length === 0) return;
    set((state) => ({
      images: { ...state.images, ...addedImages },
      figures: [...state.figures, ...added],
      selectedId: added[0].id,
    }));
  },

  setSideImage: async (figureId, which, file) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const imageId = newId();
      const { image, trim } = await importImageFile(file, imageId);
      set((state) => {
        const figures = state.figures.map((figure) =>
          figure.id === figureId
            ? clampFigureHeight({ ...figure, [which]: makeSide(imageId, trim) }, state.settings)
            : figure,
        );
        return { images: pruneImages({ ...state.images, [imageId]: image }, figures), figures };
      });
    } catch (error) {
      console.error(`Could not import ${file.name}`, error);
    }
  },

  copyMainTo: (figureId, which) =>
    set((state) => ({
      figures: state.figures.map((figure) => {
        if (figure.id !== figureId) return figure;
        // Both sides share the image; only the crop and orientation are copied, so they stay independent.
        // It starts out as the side looked before it had artwork of its own: mirrored for a prism's front
        // left and a flat mini's back. A prism's back was blank, so it just takes the main image as it is.
        const startsMirrored = which === 'left' || figure.shape === 'flat';
        const copy = startsMirrored ? mirrored(figure.front) : { ...figure.front };
        return clampFigureHeight({ ...figure, [which]: copy }, state.settings);
      }),
    })),

  clearSide: (figureId, which) =>
    set((state) => {
      const figures = state.figures.map((figure) =>
        figure.id === figureId ? clampFigureHeight({ ...figure, [which]: null }, state.settings) : figure,
      );
      return { figures, images: pruneImages(state.images, figures) };
    }),

  updateSide: (figureId, which, patch) =>
    set((state) => ({
      figures: state.figures.map((figure) => {
        const side = figure[which];
        if (figure.id !== figureId || !side) return figure;
        return clampFigureHeight({ ...figure, [which]: { ...side, ...patch } }, state.settings);
      }),
    })),

  setFaceWidth: (figureId, which, widthMm) =>
    set((state) => ({
      figures: state.figures.map((figure) => {
        if (figure.id !== figureId) return figure;
        const keys: SideKey[] = state.settings.prismWidths === 'equal' ? ['front', 'left', 'back'] : [which];
        const faces = { ...figure.faces };
        for (const key of keys) faces[key] = { ...faces[key], widthMm };
        return clampFigureHeight({ ...figure, faces }, state.settings);
      }),
    })),

  setFaceAlign: (figureId, which, align) =>
    set((state) => {
      // A flat mini's halves have to stay on top of each other, so they always move together;
      // a prism's front faces do while that is asked for.
      const linked = figureShape(state, figureId) === 'flat' || state.settings.linkFrontFaces;
      const moved = linked ? linkedFaceAligns(figureShape(state, figureId), which, align) : { [which]: align };
      return {
        figures: state.figures.map((figure) => {
          if (figure.id !== figureId) return figure;
          const faces = { ...figure.faces };
          for (const [key, value] of Object.entries(moved)) {
            faces[key as SideKey] = { ...faces[key as SideKey], align: value };
          }
          return { ...figure, faces };
        }),
      };
    }),

  duplicateFigure: (id) =>
    set((state) => {
      const index = state.figures.findIndex((f) => f.id === id);
      if (index < 0) return state;
      const copy: Figure = { ...state.figures[index], id: newId(), name: `${state.figures[index].name} (copy)` };
      const figures = [...state.figures];
      figures.splice(index + 1, 0, copy);
      return { figures, selectedId: copy.id };
    }),

  removeFigure: (id) =>
    set((state) => {
      const index = state.figures.findIndex((f) => f.id === id);
      const figures = state.figures.filter((f) => f.id !== id);
      const selectedId =
        state.selectedId === id ? (figures[Math.min(index, figures.length - 1)]?.id ?? null) : state.selectedId;
      return { figures, images: pruneImages(state.images, figures), selectedId };
    }),

  moveFigure: (id, direction) =>
    set((state) => {
      const index = state.figures.findIndex((f) => f.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.figures.length) return state;
      const figures = [...state.figures];
      [figures[index], figures[target]] = [figures[target], figures[index]];
      return { figures };
    }),

  clearProject: () =>
    set((state) => {
      forgetImages(Object.values(state.images).map((image) => image.dataUrl));
      return { figures: [], images: {}, selectedId: null };
    }),

  loadProject: (project) =>
    set((state) => {
      forgetImages(Object.values(state.images).map((image) => image.dataUrl));
      return {
        settings: migrateSettings(project.settings),
        figures: project.figures,
        images: project.images,
        selectedId: project.figures[0]?.id ?? null,
      };
    }),

  toProject: () => {
    const { settings, figures, images } = get();
    return { app: 'ttrpg-paper-mini-tool', version: 1, settings, figures, images };
  },
}));

/** Fills in settings added in later versions and replaces outdated default values. */
function migrateSettings(saved: (Partial<Settings> & LegacySettings) | undefined): Settings {
  const savedHeights = saved?.categoryHeightsMm as Partial<Settings['categoryHeightsMm']> | undefined;
  const usesLegacyDefaults =
    !!savedHeights &&
    Object.entries(LEGACY_CATEGORY_HEIGHTS_MM).every(([key, mm]) => savedHeights[key as keyof typeof savedHeights] === mm);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    glueTab: saved?.glueTab === undefined ? DEFAULT_SETTINGS.glueTab : saved.glueTab === true,
    flatText: saved?.flatText === undefined ? DEFAULT_SETTINGS.flatText : saved.flatText === true,
    prismLabel: pickEnum(saved?.prismLabel, ['text', 'stripe', 'edges', 'none'], DEFAULT_SETTINGS.prismLabel),
    prismBandSides: normalizeBandSides(saved),
    prismWidths: pickEnum(saved?.prismWidths, ['auto', 'equal'], DEFAULT_SETTINGS.prismWidths),
    linkFrontFaces:
      saved?.linkFrontFaces === undefined ? DEFAULT_SETTINGS.linkFrontFaces : saved.linkFrontFaces === true,
    customColors: (Array.isArray(saved?.customColors) ? saved.customColors : [])
      .filter((color): color is string => typeof color === 'string' && isHexColor(color))
      .slice(0, REMEMBERED_COLORS),
    categoryHeightsMm: usesLegacyDefaults
      ? DEFAULT_SETTINGS.categoryHeightsMm
      : { ...DEFAULT_SETTINGS.categoryHeightsMm, ...savedHeights },
  };
}

function clampFigureHeight(figure: Figure, settings: Settings): Figure {
  const max = maxFigureHeightMm(figure, settings);
  return figure.heightMm > max ? { ...figure, heightMm: max } : figure;
}

/** The shape of one figure, for decisions that depend on it. */
function figureShape(state: { figures: Figure[] }, figureId: string): FigureShape {
  return state.figures.find((figure) => figure.id === figureId)?.shape ?? 'flat';
}

function pruneImages(images: Record<string, StoredImage>, figures: Figure[]): Record<string, StoredImage> {
  const used = new Set(figures.flatMap(figureImageIds));
  forgetImages(Object.entries(images).filter(([id]) => !used.has(id)).map(([, image]) => image.dataUrl));
  return Object.fromEntries(Object.entries(images).filter(([id]) => used.has(id)));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeImage(raw: unknown, id: string): StoredImage | null {
  if (!raw || typeof raw !== 'object') return null;
  const image = raw as Partial<StoredImage>;
  if (typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/')) return null;
  const width = Math.round(finite(image.width, 0));
  const height = Math.round(finite(image.height, 0));
  if (width < 1 || height < 1) return null;
  return { id, dataUrl: image.dataUrl, width, height };
}

/**
 * Which faces carry the band. Projects saved before each face could be picked separately stored either
 * "the back only" or "all the way round"; both still read as the faces they meant.
 */
function normalizeBandSides(saved: (Partial<Settings> & LegacySettings) | undefined): PrismBandSides {
  const sides = saved?.prismBandSides;
  if (sides && typeof sides === 'object') {
    return {
      front: sides.front === true,
      left: sides.left === true,
      back: sides.back === true,
    };
  }
  if (saved?.prismLabelPlacement === 'back') return { front: false, left: false, back: true };
  if (saved?.prismLabelPlacement === 'around') return { front: true, left: true, back: true };
  return { ...DEFAULT_SETTINGS.prismBandSides };
}

/** Settings as earlier versions stored them. */
interface LegacySettings {
  /** Before each face could be picked separately. */
  prismLabelPlacement?: unknown;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeTransform(raw: unknown): ImageTransform {
  if (!raw || typeof raw !== 'object') return IDENTITY_TRANSFORM;
  const transform = raw as Partial<ImageTransform>;
  const turns = Math.round(finite(transform.quarterTurns, 0));
  return {
    quarterTurns: ((((turns % 4) + 4) % 4) as ImageTransform['quarterTurns']),
    flipX: transform.flipX === true,
    flipY: transform.flipY === true,
  };
}

/** Reads one side of a figure. Returns null when its image is missing or its crop is unusable. */
function normalizeSide(raw: unknown, images: Record<string, StoredImage>): FigureSide | null {
  if (!raw || typeof raw !== 'object') return null;
  const side = raw as Partial<FigureSide>;
  const image = typeof side.imageId === 'string' ? images[side.imageId] : undefined;
  if (!image) return null;
  const crop = (side.crop ?? fullCrop(image)) as Partial<CropRect>;
  const width = Math.round(finite(crop.width, image.width));
  const height = Math.round(finite(crop.height, image.height));
  if (width < 1 || height < 1) return null;
  return {
    imageId: image.id,
    crop: { x: Math.round(finite(crop.x, 0)), y: Math.round(finite(crop.y, 0)), width, height },
    transform: normalizeTransform(side.transform),
  };
}

/** Figure fields as they were stored by earlier versions. */
interface LegacyFigure {
  /** Before artwork moved into `front` and `back`. */
  imageId?: unknown;
  crop?: unknown;
  /** The prism's second front face, before it was named `left`. */
  right?: unknown;
}

/** Repairs one figure from a project file. Returns null when it has no usable artwork. */
function normalizeFigure(raw: unknown, images: Record<string, StoredImage>): Figure | null {
  if (!raw || typeof raw !== 'object') return null;
  const figure = raw as Partial<Figure> & LegacyFigure;
  // Projects saved before prisms existed kept a single image directly on the figure.
  const legacy = { imageId: figure.imageId, crop: figure.crop };
  const front = normalizeSide(figure.front ?? legacy, images);
  if (!front) return null;
  return {
    id: typeof figure.id === 'string' && figure.id ? figure.id : newId(),
    name: typeof figure.name === 'string' ? figure.name : '',
    info: typeof figure.info === 'string' ? figure.info : '',
    count: Math.min(999, Math.max(1, Math.round(finite(figure.count, 1)))),
    color: (figure.color as BaseColor) in BASE_COLORS ? (figure.color as BaseColor) : 'none',
    customColorHex: /^#[0-9a-f]{6}$/i.test(String(figure.customColorHex))
      ? String(figure.customColorHex)
      : DEFAULT_CUSTOM_COLOR,
    shape: pickEnum<FigureShape>(figure.shape, ['flat', 'prism'], 'flat'),
    front,
    back: normalizeSide(figure.back, images),
    // Saved as `right` on this branch before the two front faces swapped names.
    left: normalizeSide(figure.left ?? figure.right, images),
    heightMm: Math.max(MIN_FIGURE_HEIGHT_MM, finite(figure.heightMm, DEFAULT_FIGURE_HEIGHT_MM)),
    faces: normalizeFaces(figure.faces),
  };
}

/** Reads the per-face widths and alignments, filling in anything missing or unusable. */
function normalizeFaces(raw: unknown): Record<SideKey, FaceLayout> {
  const saved = (raw ?? {}) as Partial<Record<SideKey, Partial<FaceLayout>>>;
  const faces = defaultFaces();
  for (const key of ['front', 'left', 'back'] as SideKey[]) {
    const face = saved[key];
    const width = finite(face?.widthMm, 0);
    faces[key] = {
      widthMm: width >= MIN_FACE_WIDTH_MM ? width : null,
      align: Math.min(1, Math.max(0, finite(face?.align, DEFAULT_FACE.align))),
    };
  }
  return faces;
}

/**
 * Turns parsed JSON into a project the app can actually render: unusable figures and images are dropped
 * and missing fields get their defaults, so a damaged file never takes the whole editor down.
 */
export function normalizeProject(data: unknown): Project {
  const raw = (data ?? {}) as Partial<Project>;
  if (raw.app !== 'ttrpg-paper-mini-tool') throw new Error('This file is not a TTRPG Paper-Mini Tool project.');
  const images: Record<string, StoredImage> = {};
  for (const [id, value] of Object.entries(raw.images ?? {})) {
    const image = normalizeImage(value, id);
    if (image) images[id] = image;
  }
  const settings = migrateSettings(raw.settings);
  const figures = (Array.isArray(raw.figures) ? raw.figures : [])
    .map((figure) => normalizeFigure(figure, images))
    .filter((figure): figure is Figure => figure !== null)
    .map((figure) => clampFigureHeight(figure, settings));
  if (figures.length === 0 && Array.isArray(raw.figures) && raw.figures.length > 0) {
    throw new Error('This project file is damaged: none of its figures could be read.');
  }
  return { app: 'ttrpg-paper-mini-tool', version: 1, settings, figures, images: pruneImages(images, figures) };
}

export function parseProject(json: string): Project {
  return normalizeProject(JSON.parse(json));
}

/** Removes the auto-saved project and stops saving, so a state the app cannot render can be escaped. */
export async function clearSavedProject(): Promise<void> {
  suspended = true;
  await idbDel(STORAGE_KEY);
}

/** Set by clearSavedProject() so a pending debounced save cannot write the discarded project back. */
let suspended = false;

/** Restores the last session from IndexedDB and keeps saving changes in the background. */
export async function initPersistence(): Promise<void> {
  try {
    const saved = await idbGet<unknown>(STORAGE_KEY);
    // Images may already have been dropped onto the window while this was loading; never discard those.
    if (saved && useStore.getState().figures.length === 0) useStore.getState().loadProject(normalizeProject(saved));
  } catch (error) {
    console.warn('Could not restore saved project', error);
  }
  useStore.setState({ loaded: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  useStore.subscribe((state, previous) => {
    if (state.figures === previous.figures && state.settings === previous.settings && state.images === previous.images) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (suspended) return;
      idbSet(STORAGE_KEY, useStore.getState().toProject()).catch((error) =>
        console.warn('Could not save project', error),
      );
    }, SAVE_DEBOUNCE_MS);
  });
}
