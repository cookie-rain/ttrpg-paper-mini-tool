import type { CSSProperties } from 'react';
import type { FigureSide, StoredImage } from '../types';
import { isQuarterTurned } from '../lib/sides';

/**
 * Shows the cropped, rotated and mirrored artwork of one side at the given pixel height, using CSS only.
 * The crop is applied by an oversized image inside a clipping box; the transform is a CSS transform
 * on that box, so nothing has to be redrawn.
 */
export function FigureImage({
  side,
  image,
  alt = '',
  heightPx,
  style,
}: {
  side: FigureSide;
  image: StoredImage | undefined;
  alt?: string;
  heightPx: number;
  style?: CSSProperties;
}) {
  const { crop, transform } = side;
  // The height given is the height after rotating, so a quarter-turned side is scaled by its width.
  const turned = isQuarterTurned(transform);
  const scale = heightPx / (turned ? crop.width : crop.height);
  const boxWidth = crop.width * scale;
  const boxHeight = crop.height * scale;
  const cssTransform = [
    `rotate(${transform.quarterTurns * 90}deg)`,
    `scale(${transform.flipX ? -1 : 1}, ${transform.flipY ? -1 : 1})`,
  ].join(' ');

  return (
    <div
      className="figure-image"
      style={{
        width: turned ? boxHeight : boxWidth,
        height: turned ? boxWidth : boxHeight,
        position: 'relative',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: boxWidth,
          height: boxHeight,
          overflow: 'hidden',
          transform: cssTransform,
        }}
      >
        {image && (
          <img
            src={image.dataUrl}
            alt={alt}
            draggable={false}
            style={{
              position: 'absolute',
              left: -crop.x * scale,
              top: -crop.y * scale,
              width: image.width * scale,
              height: image.height * scale,
              maxWidth: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
