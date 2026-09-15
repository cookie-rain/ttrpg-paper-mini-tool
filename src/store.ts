import { create } from 'zustand';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type { BaseColor, CropRect, Figure, Project, Settings, StoredImage } from './types';
import {
  BASE_COLORS,
  DEFAULT_FIGURE_HEIGHT_MM,
  DEFAULT_SETTINGS,
  LEGACY_CATEGORY_HEIGHTS_MM,
  MIN_FIGURE_HEIGHT_MM,
} from './lib/constants';
import { forgetImages, importImageFile } from './lib/image';
import { nameFromFileName } from './lib/labels';
import { maxFigureHeightMm } from './lib/geometry';

export type View = 'editor' | 'lineup' | 'print';

/** View options of the lineup. Kept for the session only, not saved with the project. */
export interface LineupOptions {
  hiddenIds: string[];
  showSilhouettes: boolean;
  showHeightLines: boolean;
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

  setView: (view: View) => void;
  select: (id: string | null) => void;
  updateLineup: (patch: Partial<LineupOptions>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateFigure: (id: string, patch: Partial<Figure>) => void;
  addImageFiles: (files: File[]) => Promise<void>;
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
  lineup: { hiddenIds: [], showSilhouettes: true, showHeightLines: true },

  setView: (view) => set({ view }),
  updateLineup: (patch) => set((state) => ({ lineup: { ...state.lineup, ...patch } })),
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
              imageId,
              name: nameFromFileName(file.name),
              info: '',
              count: 1,
              color: 'none',
              crop: trim,
              heightMm: get().settings.categoryHeightsMm.medium ?? DEFAULT_FIGURE_HEIGHT_MM,
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
function migrateSettings(saved: Partial<Settings> | undefined): Settings {
  const savedHeights = saved?.categoryHeightsMm as Partial<Settings['categoryHeightsMm']> | undefined;
  const usesLegacyDefaults =
    !!savedHeights &&
    Object.entries(LEGACY_CATEGORY_HEIGHTS_MM).every(([key, mm]) => savedHeights[key as keyof typeof savedHeights] === mm);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    categoryHeightsMm: usesLegacyDefaults
      ? DEFAULT_SETTINGS.categoryHeightsMm
      : { ...DEFAULT_SETTINGS.categoryHeightsMm, ...savedHeights },
  };
}

function clampFigureHeight(figure: Figure, settings: Settings): Figure {
  const max = maxFigureHeightMm(figure.crop, settings);
  return figure.heightMm > max ? { ...figure, heightMm: max } : figure;
}

function pruneImages(images: Record<string, StoredImage>, figures: Figure[]): Record<string, StoredImage> {
  const used = new Set(figures.map((f) => f.imageId));
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

/** Repairs one figure from a project file. Returns null when it has no usable image or crop. */
function normalizeFigure(raw: unknown, images: Record<string, StoredImage>): Figure | null {
  if (!raw || typeof raw !== 'object') return null;
  const figure = raw as Partial<Figure>;
  const image = typeof figure.imageId === 'string' ? images[figure.imageId] : undefined;
  if (!image) return null;
  const crop = (figure.crop ?? {}) as Partial<CropRect>;
  const width = Math.round(finite(crop.width, image.width));
  const height = Math.round(finite(crop.height, image.height));
  if (width < 1 || height < 1) return null;
  return {
    id: typeof figure.id === 'string' && figure.id ? figure.id : newId(),
    imageId: image.id,
    name: typeof figure.name === 'string' ? figure.name : '',
    info: typeof figure.info === 'string' ? figure.info : '',
    count: Math.min(999, Math.max(1, Math.round(finite(figure.count, 1)))),
    color: (figure.color as BaseColor) in BASE_COLORS ? (figure.color as BaseColor) : 'none',
    crop: { x: Math.round(finite(crop.x, 0)), y: Math.round(finite(crop.y, 0)), width, height },
    heightMm: Math.max(MIN_FIGURE_HEIGHT_MM, finite(figure.heightMm, DEFAULT_FIGURE_HEIGHT_MM)),
  };
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
