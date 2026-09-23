import { useRef } from 'react';
import { useStore } from '../store';
import type { Figure, FigureShape, FigureSide, SideKey } from '../types';
import { PRISM_SIDES, rotateSide } from '../lib/sides';
import { CropTool } from './CropTool';

/** The pieces of artwork each shape has, in the order they are offered. */
export const SIDE_TABS: Record<FigureShape, { key: SideKey; label: string }[]> = {
  flat: [
    { key: 'front', label: 'Front' },
    { key: 'back', label: 'Back' },
  ],
  prism: PRISM_SIDES,
};

/** The tab to show: the one asked for, or the main image when the shape has no such side. */
export function activeSideTab(figure: Pick<Figure, 'shape'>, requested: SideKey): SideKey {
  return SIDE_TABS[figure.shape].some((tab) => tab.key === requested) ? requested : 'front';
}

/**
 * The artwork of a figure, one side at a time behind tabs, so a single crop tool fits the column
 * without scrolling. The main image is always there; back and a prism's front left are optional.
 */
export function ArtworkEditor({
  figure,
  active,
  onSelect,
}: {
  figure: Figure;
  active: SideKey;
  onSelect: (side: SideKey) => void;
}) {
  const current = activeSideTab(figure, active);
  const tabs = SIDE_TABS[figure.shape];

  return (
    <div className="artwork-editor">
      <div className="artwork-tabs" role="tablist" aria-label="Artwork">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`artwork-tab-${tab.key}`}
            aria-selected={tab.key === current}
            aria-controls="artwork-panel"
            className={`artwork-tab ${tab.key === current ? 'active' : ''}`}
            onClick={() => onSelect(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="artwork-panel" role="tabpanel" id="artwork-panel" aria-labelledby={`artwork-tab-${current}`}>
        <SidePanel figure={figure} which={current} />
      </div>
    </div>
  );
}

function SidePanel({ figure, which }: { figure: Figure; which: SideKey }) {
  const images = useStore((s) => s.images);
  const setSideImage = useStore((s) => s.setSideImage);
  const clearSide = useStore((s) => s.clearSide);
  const copyMainTo = useStore((s) => s.copyMainTo);
  const updateSide = useStore((s) => s.updateSide);
  const fileInput = useRef<HTMLInputElement>(null);
  const side: FigureSide | null = figure[which];
  const image = side ? images[side.imageId] : undefined;

  // A flat mini's back mirrors the main image until that is removed; every other empty side is blank.
  const mirroring = figure.shape === 'flat' && which === 'back' && figure.mirrorBack;
  const emptyText = mirroring
    ? 'No back image of its own: the main image is mirrored onto the back. Remove it to print a blank back.'
    : figure.shape === 'prism'
      ? 'No image yet: this face of the tube stays blank. “Use main” puts the main image on it, mirrored.'
      : 'Nothing on the back: it prints blank. “Use main” mirrors the main image onto it again.';

  return (
    <>
      <div className="side-actions">
        {which !== 'front' && (
          <button
            type="button"
            className="side-action"
            title="Start from the main image"
            onClick={() => copyMainTo(figure.id, which)}
          >
            Use main
          </button>
        )}
        {which !== 'front' && (side || mirroring) && (
          <button type="button" className="side-action" onClick={() => clearSide(figure.id, which)}>
            Remove
          </button>
        )}
        <button type="button" className="side-action" onClick={() => fileInput.current?.click()}>
          {side ? 'Replace' : 'Add image'}
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) setSideImage(figure.id, which, file);
        }}
      />

      {side && image ? (
        <>
          <CropTool side={side} image={image} onChange={(crop) => updateSide(figure.id, which, { crop })} />
          <TransformButtons side={side} onChange={(transform) => updateSide(figure.id, which, { transform })} />
        </>
      ) : (
        <div className="artwork-empty">
          <p className="muted small">{emptyText}</p>
        </div>
      )}
    </>
  );
}

/** Quarter turns and mirroring. The result is visible on the size stage. */
function TransformButtons({
  side,
  onChange,
}: {
  side: FigureSide;
  onChange: (transform: FigureSide['transform']) => void;
}) {
  const { transform } = side;
  return (
    <div className="button-row transform-row">
      <button type="button" title="Rotate left" aria-label="Rotate left" onClick={() => onChange(rotateSide(transform, -1))}>
        ↺
      </button>
      <button type="button" title="Rotate right" aria-label="Rotate right" onClick={() => onChange(rotateSide(transform, 1))}>
        ↻
      </button>
      <button
        type="button"
        title="Mirror left to right"
        aria-label="Mirror left to right"
        aria-pressed={transform.flipX}
        className={transform.flipX ? 'active' : ''}
        onClick={() => onChange({ ...transform, flipX: !transform.flipX })}
      >
        ⇆
      </button>
      <button
        type="button"
        title="Mirror top to bottom"
        aria-label="Mirror top to bottom"
        aria-pressed={transform.flipY}
        className={transform.flipY ? 'active' : ''}
        onClick={() => onChange({ ...transform, flipY: !transform.flipY })}
      >
        ⇅
      </button>
    </div>
  );
}
