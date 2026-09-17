import { useStore } from '../store';
import type { BaseColor, Figure } from '../types';
import { BASE_COLORS, LOW_DPI_WARNING, MIN_FIGURE_HEIGHT_MM, PAPER_SIZES_MM, SIZE_CATEGORIES } from '../lib/constants';
import { cardSize, effectiveDpi, figureImageSize, maxFigureHeightMm } from '../lib/geometry';
import { indexToLetters } from '../lib/labels';
import { formatInGame, formatLength } from '../lib/units';
import { ConfirmButton, Field, InGameInput, LengthInput, NumberInput } from './controls';
import { ImageEditor } from './ImageEditor';
import { FigureImage } from './FigureImage';
import { SizeLegend } from './SizeLegend';
import { Stage, type StageItem } from './Stage';
import { referenceLines, silhouetteRowItem } from './stageItems';

export function Editor() {
  const figure = useStore((s) => s.figures.find((f) => f.id === s.selectedId));
  const figures = useStore((s) => s.figures);
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const updateFigure = useStore((s) => s.updateFigure);
  const duplicateFigure = useStore((s) => s.duplicateFigure);
  const removeFigure = useStore((s) => s.removeFigure);
  const moveFigure = useStore((s) => s.moveFigure);
  const setView = useStore((s) => s.setView);

  if (!figure) {
    return (
      <div className="empty-state">
        <h2>No figure selected</h2>
        <p className="muted">Add or drop images to create paper minis, then pick one from the list.</p>
      </div>
    );
  }

  const image = images[figure.frontImage.imageId];
  const update = (patch: Partial<Figure>) => updateFigure(figure.id, patch);
  const maxHeight = maxFigureHeightMm(figure.frontImage.crop, settings);
  const size = figureImageSize(figure);
  const card = cardSize(figure, settings);
  const dpi = effectiveDpi(figure);
  const others = figures.filter((f) => f.id !== figure.id);
  // The figure must fit on one sheet, so the chosen paper size limits the height.
  const atMaxHeight = figure.heightMm >= maxHeight - 0.05;
  const paperLabel = PAPER_SIZES_MM[settings.paper].label;

  const stageItems: StageItem[] = [
    {
      key: figure.id,
      kind: 'figure',
      heightMm: figure.heightMm,
      widthMm: size.width,
      selected: true,
      render: (pxPerMm) => <FigureImage figure={figure} image={image} heightPx={figure.heightMm * pxPerMm} />,
      label: (
        <>
          <strong>{figure.name || 'Unnamed'}</strong>
          <span className="size-print">
            {formatLength(size.width, settings.unit)} × {formatLength(size.height, settings.unit)}
          </span>
          <span className="size-ingame">{formatInGame(size.height, settings.categoryHeightsMm, settings.unit)}</span>
        </>
      ),
    },
  ];

  return (
    <div className="editor">
      <section className="panel editor-properties">
        <div className="panel-header">
          <h2>Figure</h2>
          <div className="button-row">
            <button type="button" onClick={() => moveFigure(figure.id, -1)} title="Move up in the list">
              ↑
            </button>
            <button type="button" onClick={() => moveFigure(figure.id, 1)} title="Move down in the list">
              ↓
            </button>
            <button type="button" onClick={() => duplicateFigure(figure.id)}>
              Duplicate
            </button>
            <ConfirmButton confirmLabel="Really delete?" onConfirm={() => removeFigure(figure.id)}>
              Delete
            </ConfirmButton>
          </div>
        </div>

        <Field label="Name (line 1)">
          <input type="text" value={figure.name} maxLength={60} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Info (line 2)">
          <input
            type="text"
            value={figure.info}
            maxLength={80}
            placeholder="e.g. Tier 1 · Bruiser"
            onChange={(e) => update({ info: e.target.value })}
          />
        </Field>

        <div className="field-row">
          <Field
            label="Copies"
            hint={figure.count > 1 ? `Labelled A – ${indexToLetters(figure.count - 1)}` : 'No letter for a single copy'}
          >
            <NumberInput
              ariaLabel="Copies"
              className="count-input"
              value={figure.count}
              min={1}
              max={999}
              step={1}
              decimals={0}
              onChange={(count) => update({ count: Math.round(count) })}
            />
          </Field>
          <Field label="Base color">
            <div className="swatches" role="radiogroup" aria-label="Base color">
              {(Object.keys(BASE_COLORS) as BaseColor[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={figure.color === key}
                  title={BASE_COLORS[key].label}
                  className={`swatch ${figure.color === key ? 'active' : ''} ${key === 'none' ? 'none' : ''}`}
                  style={{ background: BASE_COLORS[key].hex ?? undefined }}
                  onClick={() => update({ color: key })}
                />
              ))}
            </div>
          </Field>
        </div>

        <ImageEditor key={figure.id} figure={figure} images={images} />
      </section>

      <section className="panel editor-size">
        <div className="panel-header">
          <h2>Size</h2>
          <SizeLegend />
        </div>

        <Stage
          leading={silhouetteRowItem(settings)}
          items={stageItems}
          fit="all"
          labelHeight={62}
          referenceLines={referenceLines(settings)}
        />

        <div className="size-controls">
          <div className="size-slider-row">
            <input
              type="range"
              className="size-slider"
              aria-label="Figure height"
              min={MIN_FIGURE_HEIGHT_MM}
              max={maxHeight}
              step={0.5}
              value={figure.heightMm}
              onChange={(e) => update({ heightMm: parseFloat(e.target.value) })}
            />
            <LengthInput
              ariaLabel="Figure height (print size)"
              valueMm={figure.heightMm}
              unit={settings.unit}
              minMm={MIN_FIGURE_HEIGHT_MM}
              maxMm={maxHeight}
              onChange={(heightMm) => update({ heightMm })}
            />
            <span className="muted small" aria-hidden="true">
              =
            </span>
            <InGameInput
              ariaLabel="Figure height (in-game size)"
              valueMm={figure.heightMm}
              settings={settings}
              minMm={MIN_FIGURE_HEIGHT_MM}
              maxMm={maxHeight}
              onChange={(heightMm) => update({ heightMm })}
            />
          </div>

          <p className={`size-limit small ${atMaxHeight ? 'warning-text' : 'muted'}`}>
            {atMaxHeight
              ? `Limited to ${formatLength(maxHeight, settings.unit, true)} — the largest size that fits on one ${paperLabel} sheet. `
              : `Max. ${formatLength(maxHeight, settings.unit, true)} on ${paperLabel}. `}
            Larger paper allows bigger figures:{' '}
            <button type="button" className="link" onClick={() => setView('print')}>
              change paper size
            </button>
          </p>

          <div className="button-row wrap">
            <span className="muted small">Set height to:</span>
            {SIZE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => update({ heightMm: settings.categoryHeightsMm[category.id] })}
              >
                {category.label}
              </button>
            ))}
            {others.length > 0 && (
              <select
                aria-label="Match height of another figure"
                value=""
                onChange={(e) => {
                  const other = others.find((f) => f.id === e.target.value);
                  if (other) update({ heightMm: other.heightMm });
                }}
              >
                <option value="">Match height of…</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name || 'Unnamed'} ({formatLength(other.heightMm, settings.unit)})
                  </option>
                ))}
              </select>
            )}
          </div>

          <dl className="facts">
            <div>
              <dt>Print size</dt>
              <dd className="size-print">
                {formatLength(size.width, settings.unit)} × {formatLength(size.height, settings.unit)}
              </dd>
            </div>
            <div>
              <dt>In-game height</dt>
              <dd className="size-ingame">{formatInGame(size.height, settings.categoryHeightsMm, settings.unit)}</dd>
            </div>
            <div>
              <dt>In-game width</dt>
              <dd className="size-ingame">{formatInGame(size.width, settings.categoryHeightsMm, settings.unit)}</dd>
            </div>
            <div>
              <dt>Unfolded card</dt>
              <dd>
                {formatLength(card.width, settings.unit)} × {formatLength(card.height, settings.unit)}
              </dd>
            </div>
            <div>
              <dt>Print resolution</dt>
              <dd className={dpi < LOW_DPI_WARNING ? 'warning-text' : ''}>
                {Math.round(dpi)} dpi{dpi < LOW_DPI_WARNING ? ' — may look blurry' : ''}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
