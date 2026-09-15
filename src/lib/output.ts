import type { Figure, Settings, StoredImage } from '../types';
import { MM_PER_INCH, PAPER_SIZES_MM, PRINT_DPI } from './constants';
import { layoutPages } from './layout';
import { createPageCanvas, decodeFigureImages, renderPage } from './render';

const POINTS_PER_MM = 72 / MM_PER_INCH;

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Rendering failed'))), 'image/png');
  });
}

/** Renders every page at print resolution and returns them as PNG blobs. */
export async function renderPrintPages(
  figures: Figure[],
  images: Record<string, StoredImage>,
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob[]> {
  const { pages } = layoutPages(figures, settings);
  const decoded = await decodeFigureImages(figures, images);
  const pxPerMm = PRINT_DPI / MM_PER_INCH;
  const blobs: Blob[] = [];
  for (let i = 0; i < pages.length; i++) {
    const canvas = createPageCanvas(settings, pxPerMm);
    renderPage(canvas, pages[i], i, pages.length, figures, decoded, settings, pxPerMm);
    blobs.push(await canvasToPngBlob(canvas));
    // Release canvas memory early; print pages are large.
    canvas.width = 0;
    canvas.height = 0;
    onProgress?.(i + 1, pages.length);
  }
  return blobs;
}

export async function buildPdf(pageBlobs: Blob[], settings: Settings): Promise<Uint8Array> {
  // Loaded on demand: pdf-lib is large and only needed when exporting.
  const { PDFDocument } = await import('pdf-lib');
  const paper = PAPER_SIZES_MM[settings.paper];
  const pdf = await PDFDocument.create();
  pdf.setTitle('Paper Minis');
  pdf.setCreator('TTRPG Paper-Mini Tool');
  const width = paper.width * POINTS_PER_MM;
  const height = paper.height * POINTS_PER_MM;
  for (const blob of pageBlobs) {
    const png = await pdf.embedPng(await blob.arrayBuffer());
    const page = pdf.addPage([width, height]);
    page.drawImage(png, { x: 0, y: 0, width, height });
  }
  return pdf.save();
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Prints the rendered pages through the browser's print dialog.
 * Each page image is sized in millimetres and the @page rule removes browser margins,
 * so the output matches the PDF as long as the user prints at 100 %.
 */
export async function printPages(pageBlobs: Blob[], settings: Settings): Promise<void> {
  const paper = PAPER_SIZES_MM[settings.paper];
  const urls = pageBlobs.map((blob) => URL.createObjectURL(blob));

  const style = document.createElement('style');
  style.textContent = `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`;
  const container = document.createElement('div');
  container.className = 'print-container';

  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          // Each sheet is a fixed-size box. It is a hair shorter than the paper so rounding
          // never spills a pixel onto an extra blank page; only empty margin gets clipped.
          const sheet = document.createElement('div');
          sheet.className = 'print-sheet';
          sheet.style.width = `${paper.width}mm`;
          sheet.style.height = `${paper.height - 0.5}mm`;
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
          img.style.width = `${paper.width}mm`;
          img.style.height = `${paper.height}mm`;
          sheet.appendChild(img);
          container.appendChild(sheet);
        }),
    ),
  );

  document.head.appendChild(style);
  document.body.appendChild(container);
  document.body.classList.add('printing');

  const cleanup = () => {
    document.body.classList.remove('printing');
    container.remove();
    style.remove();
    urls.forEach((url) => URL.revokeObjectURL(url));
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
