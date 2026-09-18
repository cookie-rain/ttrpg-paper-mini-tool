import { useState } from 'react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { CropRect, FigureSide, StoredImage } from '../types';
import { findContentBounds, loadImageElement } from '../lib/image';

const MIN_CROP_PX = 4;

function toPercent(crop: CropRect, image: StoredImage): PercentCrop {
  return {
    unit: '%',
    x: (crop.x / image.width) * 100,
    y: (crop.y / image.height) * 100,
    width: (crop.width / image.width) * 100,
    height: (crop.height / image.height) * 100,
  };
}

function toPixels(crop: PercentCrop, image: StoredImage): CropRect {
  const x = Math.round((crop.x / 100) * image.width);
  const y = Math.round((crop.y / 100) * image.height);
  return {
    x,
    y,
    width: Math.max(MIN_CROP_PX, Math.min(image.width - x, Math.round((crop.width / 100) * image.width))),
    height: Math.max(MIN_CROP_PX, Math.min(image.height - y, Math.round((crop.height / 100) * image.height))),
  };
}

export function CropTool({
  side,
  image,
  onChange,
}: {
  side: FigureSide;
  image: StoredImage;
  onChange: (crop: CropRect) => void;
}) {
  // Local state while dragging; the figure is only updated when the drag ends to avoid re-rendering everything.
  const [draft, setDraft] = useState<PercentCrop | null>(null);
  const crop = draft ?? toPercent(side.crop, image);

  return (
    <div className="crop-tool">
      <div className="crop-area">
        <ReactCrop
          crop={crop}
          keepSelection
          ruleOfThirds={false}
          onChange={(_, percent) => setDraft(percent)}
          onComplete={(_, percent) => {
            setDraft(null);
            if (percent.width > 0 && percent.height > 0) onChange(toPixels(percent, image));
          }}
        >
          <img src={image.dataUrl} alt="" className="crop-image checkerboard" draggable={false} />
        </ReactCrop>
      </div>
      <span className="muted small crop-size">
        {side.crop.width} × {side.crop.height} px
      </span>
      <div className="button-row crop-actions">
        <button
          type="button"
          className="side-action"
          onClick={async () => onChange(findContentBounds(await loadImageElement(image.dataUrl)))}
          title="Crop to the visible pixels of the image"
        >
          Auto-trim
        </button>
        <button
          type="button"
          className="side-action"
          onClick={() => onChange({ x: 0, y: 0, width: image.width, height: image.height })}
        >
          Full image
        </button>
      </div>
    </div>
  );
}
