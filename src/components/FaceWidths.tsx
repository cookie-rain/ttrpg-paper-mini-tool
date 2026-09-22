import { useStore } from '../store';
import type { Figure, SideKey } from '../types';
import { MIN_FACE_WIDTH_MM } from '../lib/constants';
import { cardSize, faceArtworkWidthMm, prismPanelWidths, printableArea, widestSideMm } from '../lib/geometry';
import { PRISM_SIDES } from '../lib/sides';
import { formatInGame } from '../lib/units';
import { Field, LengthInput, Measure } from './controls';

/**
 * The printed width of a figure's faces, under the stage they belong to, each with the size it stands
 * for in the game. A face can be made wider than its artwork -- to keep a slim prism face long enough to
 * reach around the tube, or simply to give a flat mini a broader card -- but never narrower, which would
 * push the artwork off it. A flat mini is one card, so it has one width.
 */
export function FaceWidths({ figure }: { figure: Figure }) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const prism = figure.shape === 'prism';
  const widths = prismPanelWidths(figure, settings);
  const faces: { key: SideKey; label: string; widthMm: number; floorMm: number }[] = prism
    ? PRISM_SIDES.map(({ key, label }) => ({
        key,
        label,
        widthMm: widths[key],
        floorMm: faceArtworkWidthMm(figure, key),
      }))
    : [
        {
          key: 'front',
          label: 'Card width',
          widthMm: cardSize(figure, settings).width,
          // The stand minimum widens a flat card just as its artwork does.
          floorMm: Math.max(widestSideMm(figure), settings.minWidthMm),
        },
      ];

  return (
    <section className="face-widths">
      {prism && (
        <div className="face-width-options">
          <label className="checkbox small">
            <input
              type="checkbox"
              checked={settings.prismWidths === 'equal'}
              onChange={(e) => updateSettings({ prismWidths: e.target.checked ? 'equal' : 'auto' })}
            />
            All faces the same width
          </label>
          <label className="checkbox small">
            <input
              type="checkbox"
              checked={settings.linkFrontFaces}
              onChange={(e) => updateSettings({ linkFrontFaces: e.target.checked })}
            />
            Move Side A and B together
          </label>
        </div>
      )}

      {faces.map(({ key, label, widthMm, floorMm }) => (
        <FaceWidthField
          key={key}
          figure={figure}
          which={key}
          label={label}
          widthMm={widthMm}
          floorMm={floorMm}
        />
      ))}
    </section>
  );
}

function FaceWidthField({
  figure,
  which,
  label,
  widthMm,
  floorMm,
}: {
  figure: Figure;
  which: SideKey;
  label: string;
  widthMm: number;
  floorMm: number;
}) {
  const settings = useStore((s) => s.settings);
  const setFaceWidth = useStore((s) => s.setFaceWidth);
  const setFaceAlign = useStore((s) => s.setFaceAlign);
  const widened = widthMm > floorMm + 0.05;
  const centred = Math.abs(figure.faces[which].align - 0.5) < 0.001;

  return (
    <Field
      label={
        // Both links stay put and grey out when there is nothing to undo, so the row never jumps.
        <span className="face-width-label">
          {label}
          <button
            type="button"
            className="link small"
            disabled={!widened}
            title="Back to the narrowest this can be"
            onClick={() => setFaceWidth(figure.id, which, null)}
          >
            reset
          </button>
          <button
            type="button"
            className="link small"
            disabled={!widened || centred}
            title="Put the artwork back in the middle"
            onClick={() => setFaceAlign(figure.id, which, 0.5)}
          >
            centre
          </button>
        </span>
      }
      hint={
        <span className="size-ingame">
          <Measure>{formatInGame(widthMm, settings.categoryHeightsMm, settings.unit)}</Measure> ×{' '}
          <Measure>{formatInGame(figure.heightMm, settings.categoryHeightsMm, settings.unit)}</Measure>
        </span>
      }
    >
      <LengthInput
        ariaLabel={`${label} of ${figure.name || 'this figure'}`}
        valueMm={widthMm}
        unit={settings.unit}
        minMm={Math.max(MIN_FACE_WIDTH_MM, floorMm)}
        maxMm={printableArea(settings).width}
        onChange={(mm) => setFaceWidth(figure.id, which, mm <= floorMm + 0.05 ? null : mm)}
      />
    </Field>
  );
}
