/** All physical lengths in this app are stored in millimetres. */

export type Unit = 'mm' | 'in';
export type PaperSize = 'a5' | 'a4' | 'a3' | 'letter' | 'legal' | 'tabloid';
export type CutLineStyle = 'solid' | 'dashed' | 'corners' | 'none';
export type FoldLineStyle = 'solid' | 'dashed' | 'edge-ticks' | 'none';
export type ColorStyle = 'fill' | 'stripes';
/** 'stand': base strips clip into a plastic stand. 'folded': strips fold out into a paper foot with a reinforcement flap. */
export type BaseStyle = 'stand' | 'folded';
/** 'rows': straight cuts only. 'compact': cards fill every gap and may rotate, to save paper. */
export type PackingMode = 'rows' | 'compact';
export type BaseColor = 'none' | 'blue' | 'red' | 'green' | 'yellow' | 'gray';
export type SizeCategory = 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

/** Crop rectangle in source image pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An imported image. Kept separate from figures so duplicates can share pixel data. */
export interface StoredImage {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface Figure {
  id: string;
  imageId: string;
  name: string;
  info: string;
  /** How many copies to print. Copies are labelled A, B, C, ... when count > 1. */
  count: number;
  color: BaseColor;
  crop: CropRect;
  /** Printed height of the (cropped) image on one side of the fold. Width follows the aspect ratio. */
  heightMm: number;
}

export interface Settings {
  unit: Unit;
  paper: PaperSize;
  marginMm: number;
  gapMm: number;
  cutLines: CutLineStyle;
  foldLine: FoldLineStyle;
  colorStyle: ColorStyle;
  baseStyle: BaseStyle;
  packing: PackingMode;
  /** Height of the base strip (one per side): clipped into the stand, or the depth of each half of a folded foot. */
  baseHeightMm: number;
  /** Minimum card width so every figure fits into a stand. */
  minWidthMm: number;
  calibrationRuler: boolean;
  /** Reference silhouette heights for the size categories. */
  categoryHeightsMm: Record<SizeCategory, number>;
}

export interface Project {
  app: 'ttrpg-paper-mini-tool';
  version: 1;
  settings: Settings;
  figures: Figure[];
  images: Record<string, StoredImage>;
}
