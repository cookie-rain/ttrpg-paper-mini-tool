import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { FigureSide, StoredImage } from '../types';
import { sideAspect } from '../lib/sides';
import { FigureImage } from './FigureImage';

/**
 * Where the artwork ends up after a drag: how far it was moved, over how much room there is to move it.
 * A face no wider than its artwork has nowhere to go, so it stays at the left edge.
 */
export function dragAlign(offsetPx: number, sparePx: number): number {
  if (sparePx <= 0) return 0;
  return Math.min(1, Math.max(0, offsetPx / sparePx));
}

/**
 * One face of a prism on the size stage: the artwork inside the face it is printed on. A face wider
 * than its artwork leaves room at the sides, and the artwork can be dragged across it to choose where
 * it sits -- the same room, and the same position, that end up on paper.
 */
export function FaceArtwork({
  side,
  image,
  alt,
  heightPx,
  faceWidthPx,
  align,
  showFace = false,
  onAlign,
}: {
  side: FigureSide | null;
  image: StoredImage | undefined;
  alt: string;
  heightPx: number;
  faceWidthPx: number;
  align: number;
  /** Marks the face out even where the artwork fills it, so all three faces of a prism are visible. */
  showFace?: boolean;
  onAlign?: (align: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const grabOffsetPx = useRef(0);
  const artWidthPx = side ? heightPx * sideAspect(side) : 0;
  const sparePx = faceWidthPx - artWidthPx;
  const movable = onAlign !== undefined && side !== null && sparePx > 1;
  const leftPx = sparePx * align;

  const alignAt = (clientX: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    return box ? dragAlign(clientX - box.left - grabOffsetPx.current, sparePx) : align;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!movable) return;
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    // Hold on to where the artwork was grabbed, so it does not jump to the pointer.
    grabOffsetPx.current = event.clientX - box.left - leftPx;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!movable || !(event.buttons & 1)) return;
    onAlign?.(alignAt(event.clientX));
  };

  return (
    <div
      ref={boxRef}
      className={`face-artwork ${showFace ? 'showing' : ''} ${movable ? 'movable' : ''}`}
      style={{ width: faceWidthPx, height: heightPx }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      title={movable ? 'Drag to move the artwork across this face' : undefined}
    >
      {side && (
        <div className="face-artwork-inner" style={{ left: leftPx }}>
          <FigureImage side={side} image={image} alt={alt} heightPx={heightPx} />
        </div>
      )}
    </div>
  );
}
