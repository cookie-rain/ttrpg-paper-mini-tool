import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { BaseColor, Figure, FigureShape, FigureSide, SideKey } from '../types';
import { BASE_COLORS, LOW_DPI_WARNING, MIN_FIGURE_HEIGHT_MM, PAPER_SIZES_MM, SIZE_CATEGORIES } from '../lib/constants';
import { cardSize, effectiveDpi, figureImageSize, maxFigureHeightMm, sideSize } from '../lib/geometry';
import { rememberColor } from '../lib/colors';
import { flatBack, mirrored } from '../lib/sides';
import { indexToLetters } from '../lib/labels';
import { formatInGame, formatLength } from '../lib/units';
import { ConfirmButton, Field, InGameInput, LengthInput, Measure, NumberInput, Segmented } from './controls';
import { activeSideTab, ArtworkEditor } from './ArtworkEditor';
import { ColorPicker } from './ColorPicker';
import { FigureImage } from './FigureImage';
import { SizeLegend } from './SizeLegend';
import { Stage, type StageItem } from './Stage';
import { referenceLines, silhouetteRowItem } from './stageItems';

/** Smallest space between front and back. It only grows when their labels need more room. */
const STAGE_GAP_PX = 40;
const STAGE_LABEL_WIDTH_PX = 110;
/**
 * Share of the stage the figure is fitted into. The rest stays empty at either end, so the figure
 * always sits in the middle and its size never depends on how much of the backdrop it covers.
 */
const FIGURE_AREA_SHARE = 0.7;

/** The fixed palette, in the order it is offered. The custom picker follows it. */
const PRESET_COLORS = (Object.keys(BASE_COLORS) as BaseColor[]).filter((key) => key !== 'custom');

export function Editor() {
  const figure = useStore((s) => s.figures.find((f) => f.id === s.selectedId));
  const figures = useStore((s) => s.figures);
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const updateFigure = useStore((s) => s.updateFigure);
  const updateSettings = useStore((s) => s.updateSettings);
  const duplicateFigure = useStore((s) => s.duplicateFigure);
  const removeFigure = useStore((s) => s.removeFigure);
  const moveFigure = useStore((s) => s.moveFigure);
  const setView = useStore((s) => s.setView);
  const editorOptions = useStore((s) => s.editor);
  const pickerAnchor = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Which piece of artwork the tabs show. Shared with the stage, which highlights it. */
  const [sideTab, setSideTab] = useState<SideKey>('front');
  const updateEditor = useStore((s) => s.updateEditor);

  if (!figure) {
    return (
      <div className="empty-state">
        <h2>No figure selected</h2>
        <p className="muted">Add or drop images to create paper minis, then pick one from the list.</p>
      </div>
    );
  }

  const update = (patch: Partial<Figure>) => updateFigure(figure.id, patch);
  const maxHeight = maxFigureHeightMm(figure, settings);
  const size = figureImageSize(figure);
  const card = cardSize(figure, settings);
  const dpi = effectiveDpi(figure);
  const others = figures.filter((f) => f.id !== figure.id);
  // The figure must fit on one sheet, so the chosen paper size limits the height.
  const atMaxHeight = figure.heightMm >= maxHeight - 0.05;
  const paperLabel = PAPER_SIZES_MM[settings.paper].label;

  // Every printed side stands on the stage, so a rotation or mirror is visible right here. The side
  // being edited is highlighted. A prism's front left shows the mirrored main image until it has its own.
  const shownTab = activeSideTab(figure, sideTab);
  const backSize = figure.back ? sideSize(figure.back, figure.heightMm) : null;
  const stageSides: { key: SideKey; label: string; side: FigureSide }[] =
    figure.shape === 'prism'
      ? [
          { key: 'front', label: 'Front right', side: figure.front },
          { key: 'left', label: 'Front left', side: figure.left ?? mirrored(figure.front) },
          ...(figure.back ? [{ key: 'back' as const, label: 'Back', side: figure.back }] : []),
        ]
      : [
          // A flat mini always has a back: its own artwork, or the main image mirrored.
          { key: 'front', label: 'Front', side: figure.front },
          { key: 'back', label: 'Back', side: flatBack(figure) },
        ];

  const stageItems: StageItem[] = stageSides.map(({ key, label, side }) => {
    const sideDims = sideSize(side, figure.heightMm);
    return {
      key: `${figure.id}:${key}`,
      kind: 'figure',
      heightMm: figure.heightMm,
      widthMm: sideDims.width,
      selected: key === shownTab,
      onClick: () => setSideTab(key),
      render: (pxPerMm) => (
        <FigureImage
          side={side}
          image={images[side.imageId]}
          alt={`${figure.name} – ${label}`}
          heightPx={figure.heightMm * pxPerMm}
        />
      ),
      label: (
        <>
          <strong>{label}</strong>
          <span className="size-print">
            <Measure>{formatLength(sideDims.width, settings.unit)}</Measure> ×{' '}
            <Measure>{formatLength(sideDims.height, settings.unit)}</Measure>
          </span>
          {key === 'front' && (
            <span className="size-ingame">
              <Measure>{formatInGame(sideDims.height, settings.categoryHeightsMm, settings.unit)}</Measure>
            </span>
          )}
        </>
      ),
    };
  });

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
            <ConfirmButton confirmLabel="Delete?" onConfirm={() => removeFigure(figure.id)}>
              Delete
            </ConfirmButton>
          </div>
        </div>

        <Field
          group
          label="Shape"
          hint={
            figure.shape === 'prism'
              ? figure.back
                ? 'Three faces folded into a triangular tube. It stands on its own, no base needed.'
                : 'Three faces folded into a triangular tube. Its back face is still empty.'
              : 'One strip folded at the top, standing in a plastic stand or on a paper foot.'
          }
        >
          <Segmented<FigureShape>
            ariaLabel="Shape"
            value={figure.shape}
            options={[
              { value: 'flat', label: '▭ Flat' },
              { value: 'prism', label: '△ Triangular' },
            ]}
            onChange={(shape) => update({ shape })}
          />
        </Field>

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
        <Field group label="Base color">
          <div className="swatches">
            <div className="swatch-group" role="radiogroup" aria-label="Base color">
              {PRESET_COLORS.map((key) => (
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
            <button
              type="button"
              ref={pickerAnchor}
              className={`swatch custom ${figure.color === 'custom' ? 'active' : ''}`}
              title="Custom colour"
              aria-label="Custom base color"
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              onClick={() => {
                update({ color: 'custom' });
                setPickerOpen((open) => !open);
              }}
            >
              {/* The wheel always says what the button is for; the badge says which colour is on the figure. */}
              {figure.color === 'custom' && (
                <span className="swatch-badge" style={{ background: figure.customColorHex }} aria-hidden="true" />
              )}
            </button>
            {pickerOpen && (
              <ColorPicker
                value={figure.customColorHex}
                anchor={pickerAnchor.current}
                remembered={settings.customColors}
                onChange={(customColorHex) => update({ color: 'custom', customColorHex })}
                onClose={() => {
                  // Remembered on closing, so dragging across the field does not fill the row with near-misses.
                  updateSettings({ customColors: rememberColor(settings.customColors, figure.customColorHex) });
                  setPickerOpen(false);
                }}
              />
            )}
          </div>
        </Field>

        <h3>Artwork</h3>
        <ArtworkEditor figure={figure} active={sideTab} onSelect={setSideTab} />
      </section>

      <section className="panel editor-size">
        <div className="panel-header">
          <h2>Size</h2>
          <SizeLegend />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={editorOptions.showSilhouettes}
              onChange={(e) => updateEditor({ showSilhouettes: e.target.checked })}
            />
            Silhouettes
          </label>
        </div>

        <Stage
          leading={editorOptions.showSilhouettes ? silhouetteRowItem(settings) : undefined}
          items={stageItems}
          fit="all"
          labelHeight={62}
          labelWidthPx={STAGE_LABEL_WIDTH_PX}
          fixedGapPx={STAGE_GAP_PX}
          centerItems
          leadingBehind
          itemAreaShare={FIGURE_AREA_SHARE}
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
                <Measure>{formatLength(size.width, settings.unit)}</Measure> ×{' '}
                <Measure>{formatLength(size.height, settings.unit)}</Measure>
              </dd>
            </div>
            <div>
              <dt>In-game height</dt>
              <dd className="size-ingame">
                <Measure>{formatInGame(size.height, settings.categoryHeightsMm, settings.unit)}</Measure>
              </dd>
            </div>
            <div>
              <dt>In-game width</dt>
              <dd className="size-ingame">
                <Measure>{formatInGame(size.width, settings.categoryHeightsMm, settings.unit)}</Measure>
                {backSize && Math.abs(backSize.width - size.width) > 0.05 && (
                  <>
                    <span className="muted small"> front · </span>
                    <Measure>{formatInGame(backSize.width, settings.categoryHeightsMm, settings.unit)}</Measure>
                    <span className="muted small"> back</span>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Unfolded card</dt>
              <dd>
                <Measure>{formatLength(card.width, settings.unit)}</Measure> ×{' '}
                <Measure>{formatLength(card.height, settings.unit)}</Measure>
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
