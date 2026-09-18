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
export type BaseColor = 'none' | 'blue' | 'red' | 'green' | 'yellow' | 'gray' | 'custom';
/**
 * 'flat': one strip folded at the top, standing in a plastic stand or on a paper foot.
 * 'prism': three panels folded into a triangular tube that stands on its own.
 */
export type FigureShape = 'flat' | 'prism';
/**
 * What is printed in the band along the bottom of a prism, which has no base strip.
 * Printing is single-sided, so everything sits on the outside of the tube.
 */
export type PrismLabel = 'text' | 'stripe' | 'edges' | 'none';
/** Whether the band covers only the back face or runs around all three faces. */
export type PrismLabelPlacement = 'back' | 'around';
/** 'auto': each prism face is as wide as the artwork on it. 'equal': all three faces share the widest. */
export type PrismWidths = 'auto' | 'equal';
export type SizeCategory = 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

/** Crop rectangle in source image pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Quarter turns clockwise plus mirroring, applied to the cropped artwork before it is printed. */
export interface ImageTransform {
  /** Number of 90° turns clockwise: 0, 1, 2 or 3. */
  quarterTurns: 0 | 1 | 2 | 3;
  /** Mirrored left to right. Applied after the rotation. */
  flipX: boolean;
  /** Mirrored top to bottom. Applied after the rotation. */
  flipY: boolean;
}

/** Which piece of a figure's artwork is meant: the main image, the back, or a prism's front-left face. */
export type SideKey = 'front' | 'back' | 'left';

/** One piece of artwork on a figure: which image, which part of it, and how it is oriented. */
export interface FigureSide {
  imageId: string;
  crop: CropRect;
  transform: ImageTransform;
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
  name: string;
  info: string;
  /** How many copies to print. Copies are labelled A, B, C, ... when count > 1. */
  count: number;
  color: BaseColor;
  /** The colour used when `color` is 'custom'. Kept while another colour is picked, so it can come back. */
  customColorHex: string;
  shape: FigureShape;
  /** The main image: the front of a flat mini, and a prism's front-right face. */
  front: FigureSide;
  /**
   * Artwork for the back. A flat mini without one shows `front` mirrored; a prism without one leaves its
   * back face empty.
   */
  back: FigureSide | null;
  /**
   * Artwork for a prism's front-left face; the front-right face shows `front`. Without it the left face
   * shows `front` mirrored. Flat minis ignore it, but keep it so switching shape back restores it.
   */
  left: FigureSide | null;
  /** Printed height of the artwork. Width follows the aspect ratio. */
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
  /** Minimum card width so every figure fits into a stand. Flat minis only. */
  minWidthMm: number;
  /** Print name, info and copy letter on the base strips. Flat minis only; prisms use `prismLabel`. */
  flatText: boolean;
  /** Print a trapezoid glue tab for closing a prism. Without it the tube is taped shut instead. */
  glueTab: boolean;
  prismLabel: PrismLabel;
  prismLabelPlacement: PrismLabelPlacement;
  /** Height of that band. Ignored when `prismLabel` is 'none'. */
  prismLabelHeightMm: number;
  prismWidths: PrismWidths;
  /** Custom colours picked earlier, most recent first, offered again in the colour picker. */
  customColors: string[];
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
