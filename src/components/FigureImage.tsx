import type { CSSProperties } from 'react';
import type { Figure, StoredImage } from '../types';

/** Shows the cropped part of a figure's image at the given pixel height, using CSS only. */
export function FigureImage({
  figure,
  image,
  heightPx,
  style,
}: {
  figure: Figure;
  image: StoredImage | undefined;
  heightPx: number;
  style?: CSSProperties;
}) {
  const { crop } = figure.frontImage;
  const scale = heightPx / crop.height;
  return (
    <div
      className="figure-image"
      style={{ width: crop.width * scale, height: heightPx, position: 'relative', overflow: 'hidden', ...style }}
    >
      {image && (
        <img
          src={image.dataUrl}
          alt={figure.name}
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
  );
}
