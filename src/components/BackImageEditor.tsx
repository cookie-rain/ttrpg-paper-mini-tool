import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../store';
import type { Figure, ImageFit, StoredImage } from '../types';
import { CropTool } from './CropTool';
import { Field } from './controls';

export function BackImageEditor({ figure, image }: { figure: Figure; image: StoredImage | undefined }) {
  const updateFigure = useStore((s) => s.updateFigure);
  const setBackImageFile = useStore((s) => s.setBackImageFile);
  const removeBackImage = useStore((s) => s.removeBackImage);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = figure.backImage;

  const add = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    try {
      await setBackImageFile(figure.id, file);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load the back image.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {back && image ? (
        <>
          <CropTool
            key={image.id}
            crop={back.crop}
            image={image}
            onChange={(crop) => updateFigure(figure.id, { backImage: { ...back, crop } })}
            onReplace={(file) => setBackImageFile(figure.id, file)}
          />
          <Field label="Resize back image" hint="Uses the front image’s printed width and height. Check Print to see both sides.">
            <select
              value={back.fit}
              onChange={(e) => updateFigure(figure.id, { backImage: { ...back, fit: e.target.value as ImageFit } })}
            >
              <option value="contain">Fit — whole image with empty space</option>
              <option value="cover">Fill — crop edges to fit</option>
              <option value="stretch">Stretch — match width and height</option>
            </select>
          </Field>
          <div className="button-row">
            <button type="button" onClick={() => removeBackImage(figure.id)}>
              Remove back image
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">The front image is duplicated on the back. Add an optional back image to use different artwork.</p>
          <div className="button-row">
            <button type="button" disabled={loading} onClick={() => fileInput.current?.click()}>
              {loading ? 'Loading…' : 'Add back image'}
            </button>
          </div>
        </>
      )}
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={add} />
      {error && <p className="warning-text small" role="alert">{error}</p>}
    </>
  );
}
