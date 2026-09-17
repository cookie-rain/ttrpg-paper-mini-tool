import { useRef, useState, type ChangeEvent } from 'react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { CropRect, Figure, StoredImage } from '../types';
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
  figure,
  image,
  onChange,
  onReplace,
}: {
  figure: Figure;
  image: StoredImage;
  onChange: (crop: CropRect) => void;
  onReplace: (file: File) => Promise<void>;
}) {
  // Local state while dragging; the figure is only updated when the drag ends to avoid re-rendering everything.
  const [draft, setDraft] = useState<PercentCrop | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replacing = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crop = draft ?? toPercent(figure.frontImage.crop, image);

  const replace = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || replacing.current) return;
    replacing.current = true;
    setLoading(true);
    setError(null);
    try {
      await onReplace(file);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not replace the front image.');
    } finally {
      replacing.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="crop-tool">
      <div className="crop-area checkerboard">
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
          <img src={image.dataUrl} alt="" className="crop-image" draggable={false} />
        </ReactCrop>
      </div>
      <div className="button-row wrap">
        <button type="button" disabled={loading} onClick={() => fileInput.current?.click()}>
          {loading ? 'Replacing…' : 'Replace image'}
        </button>
        <button
          type="button"
          onClick={async () => onChange(findContentBounds(await loadImageElement(image.dataUrl)))}
          title="Crop to the visible pixels of the image"
        >
          Auto-trim
        </button>
        <button type="button" onClick={() => onChange({ x: 0, y: 0, width: image.width, height: image.height })}>
          Full image
        </button>
        <span className="muted small">
          {figure.frontImage.crop.width} × {figure.frontImage.crop.height} px
        </span>
      </div>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={replace} />
      {error && <p className="warning-text small" role="alert">{error}</p>}
    </div>
  );
}
