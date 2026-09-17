import { useId, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Figure, StoredImage } from '../types';
import { BackImageEditor } from './BackImageEditor';
import { CropTool } from './CropTool';

const SIDES = [
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
] as const;

/** Keeps both editors mounted so switching tabs does not interrupt an image import. */
export function ImageEditor({ figure, images }: { figure: Figure; images: Record<string, StoredImage> }) {
  const updateFigure = useStore((s) => s.updateFigure);
  const replaceFrontImageFile = useStore((s) => s.setFrontImageFile);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const front = images[figure.frontImage.imageId];
  const back = figure.backImage ? images[figure.backImage.imageId] : undefined;

  return (
    <>
      <h3>Image</h3>
      <div className="segmented" role="tablist" aria-label="Image side">
        {SIDES.map((option, index) => (
          <button
            key={option.value}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-${option.value}-tab`}
            aria-controls={`${id}-${option.value}-panel`}
            aria-selected={side === option.value}
            tabIndex={side === option.value ? 0 : -1}
            className={side === option.value ? 'active' : ''}
            onClick={() => setSide(option.value)}
            onKeyDown={(e) => {
              let next: number;
              if (e.key === 'ArrowRight') next = (index + 1) % SIDES.length;
              else if (e.key === 'ArrowLeft') next = (index + SIDES.length - 1) % SIDES.length;
              else if (e.key === 'Home') next = 0;
              else if (e.key === 'End') next = SIDES.length - 1;
              else return;
              e.preventDefault();
              setSide(SIDES[next].value);
              tabs.current[next]?.focus();
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {SIDES.map((option) => (
        <div
          key={option.value}
          className="image-editor-panel"
          role="tabpanel"
          id={`${id}-${option.value}-panel`}
          aria-labelledby={`${id}-${option.value}-tab`}
          hidden={side !== option.value}
          tabIndex={0}
        >
          {option.value === 'front' ? (
            front && (
              <CropTool
                key={front.id}
                crop={figure.frontImage.crop}
                image={front}
                onChange={(crop) => updateFigure(figure.id, { frontImage: { ...figure.frontImage, crop } })}
                onReplace={(file) => replaceFrontImageFile(figure.id, file)}
              />
            )
          ) : (
            <BackImageEditor figure={figure} image={back} />
          )}
        </div>
      ))}
    </>
  );
}
