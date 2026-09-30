import { useId, type CSSProperties } from 'react';
import type { FigureSide, StoredImage } from '../types';
import { isQuarterTurned } from '../lib/sides';

/**
 * Shows the cropped, rotated and mirrored artwork of one side at the given pixel height, using CSS only.
 * The crop is applied by an oversized image inside a clipping box; the transform is a CSS transform
 * on that box, so nothing has to be redrawn.
 *
 * An outline is grown by an SVG filter rather than drawn: `feMorphology` is the same operation the
 * printed outline uses, so it follows the artwork's own shape and scales with the element instead of
 * being rebuilt at every size. Its kernel is a square where printing measures true distance, which
 * rounds sharp corners a little more on paper than on screen; at these thicknesses nothing else differs.
 */
export function FigureImage({
  side,
  image,
  alt = '',
  heightPx,
  outlinePx = 0,
  outlineColor = '#000000',
  style,
}: {
  side: FigureSide;
  image: StoredImage | undefined;
  alt?: string;
  heightPx: number;
  /** How far the outline reaches past the artwork, in pixels. Zero for no outline. */
  outlinePx?: number;
  outlineColor?: string;
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
  // Ids have to survive being put in a url(), and useId's own punctuation does not.
  const filterId = `figure-outline-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const outlined = outlinePx > 0.25;

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
      {outlined && (
        <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
          <filter
            id={filterId}
            // The grown edge falls outside the artwork's own box, so the filter region has to be roomier.
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feMorphology operator="dilate" radius={outlinePx} in="SourceAlpha" result="grown" />
            <feFlood floodColor={outlineColor} />
            <feComposite in2="grown" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: boxWidth,
          height: boxHeight,
          overflow: 'hidden',
          transform: cssTransform,
          filter: outlined ? `url(#${filterId})` : undefined,
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
