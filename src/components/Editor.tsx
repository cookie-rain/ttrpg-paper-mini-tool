import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { BaseColor, Figure, FigureShape, FigureSide, SideKey } from '../types';
import { BASE_COLORS, LOW_DPI_WARNING, MIN_FIGURE_HEIGHT_MM, PAPER_SIZES_MM, SIZE_CATEGORIES } from '../lib/constants';
import {
  cardSize,
  effectiveDpi,
  figureImageSize,
  maxFigureHeightMm,
  prismCloses,
  prismPanelWidths,
  prismStrip,
  sideSize,
} from '../lib/geometry';
import { rememberColor } from '../lib/colors';
import { flatBack, PRISM_SIDES } from '../lib/sides';
import { indexToLetters } from '../lib/labels';
import { formatInGame, formatLength } from '../lib/units';
import { ConfirmButton, Field, InGameInput, LengthInput, Measure, NumberInput, Segmented } from './controls';
import { activeSideTab, ArtworkEditor } from './ArtworkEditor';
import { ColorPicker } from './ColorPicker';
import { FaceArtwork } from './FaceArtwork';
import { FaceWidths } from './FaceWidths';
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
  const setFaceAlign = useStore((s) => s.setFaceAlign);
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
  const closes = figure.shape !== 'prism' || prismCloses(prismPanelWidths(figure, settings));
  const paperLabel = PAPER_SIZES_MM[settings.paper].label;

  // Every printed side stands on the stage, so a rotation or mirror is visible right here. The side
  // being edited is highlighted. A prism's Side B shows the mirrored main image until it has its own.
  const shownTab = activeSideTab(figure, sideTab);
  const cardWidthMm = card.width;
  const frontAlign = figure.faces.front.align;
  const stageSides: { key: SideKey; label: string; side: FigureSide | null; width: number; align: number }[] =
    figure.shape === 'prism'
      ? // Exactly the strip that gets printed, blank faces included, so all three are there to compare.
        prismStrip(figure, settings).map((face) => ({
          ...face,
          label: PRISM_SIDES.find((entry) => entry.key === face.key)!.label,
        }))
      : // Both halves of one card, so they share its width; the back is mirrored by the fold.
        [
          { key: 'front' as const, label: 'Front', side: figure.front, width: cardWidthMm, align: frontAlign },
          { key: 'back' as const, label: 'Back', side: flatBack(figure), width: cardWidthMm, align: 1 - frontAlign },
        ];

  const stageItems: StageItem[] = stageSides.map(({ key, label, side, width, align }) => {
    const sideDims = side ? sideSize(side, figure.heightMm) : { width: 0, height: figure.heightMm };
    // A prism face may be wider than its artwork; the stage shows that room and lets it be used.
    const faceWidthMm = Math.max(width, sideDims.width);
    return {
      key: `${figure.id}:${key}`,
      kind: 'figure',
      heightMm: figure.heightMm,
      widthMm: faceWidthMm,
      selected: key === shownTab,
      onClick: () => setSideTab(key),
      render: (pxPerMm) => (
        <FaceArtwork
          side={side}
          image={side ? images[side.imageId] : undefined}
          alt={`${figure.name} – ${label}`}
          heightPx={figure.heightMm * pxPerMm}
          faceWidthPx={faceWidthMm * pxPerMm}
          align={align}
          showFace
          onAlign={(next) => setFaceAlign(figure.id, key, next)}
        />
      ),
      label: (
        <>
          <strong>{label}</strong>
          <span className="size-print">
            {/* For a prism it is the face that is printed, whether or not artwork fills it. */}
            <Measure>{formatLength(faceWidthMm, settings.unit)}</Measure> ×{' '}
            <Measure>{formatLength(sideDims.height, settings.unit)}</Measure>
          </span>
          <span className="size-ingame">
            <Measure>{formatInGame(faceWidthMm, settings.categoryHeightsMm, settings.unit)}</Measure> ×{' '}
            <Measure>{formatInGame(sideDims.height, settings.categoryHeightsMm, settings.unit)}</Measure>
          </span>
        </>
      ),
    };
  });

  return (
    <div className="editor">
      <section className="panel editor-properties">
        <div className="panel-header">
          <h2>Figure</h2>
          <div className="button-row wrap">
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

        <FaceWidths figure={figure} />

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

          <p className={`size-limit small ${atMaxHeight ? 'warning-note' : 'muted'}`}>
            {atMaxHeight
              ? `Limited to ${formatLength(maxHeight, settings.unit, true)} — the largest size that fits on one ${paperLabel} sheet. `
              : `Max. ${formatLength(maxHeight, settings.unit, true)} on ${paperLabel}. `}
            Larger paper allows bigger figures:{' '}
            <button type="button" className="link" onClick={() => setView('print')}>
              change paper size
            </button>
          </p>

          {!closes && (
            <p className="warning-note small">
              One face is wider than the other two together, so the tube cannot be closed. Make the other
              faces wider, or tick “All three the same” above.
            </p>
          )}

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
              <dt>Unfolded card</dt>
              <dd>
                <Measure>{formatLength(card.width, settings.unit)}</Measure> ×{' '}
                <Measure>{formatLength(card.height, settings.unit)}</Measure>
              </dd>
            </div>
            <div>
              <dt>Print resolution</dt>
              <dd>
                {Math.round(dpi)} dpi
                {dpi < LOW_DPI_WARNING && (
                  <span className="warning-note inline small">may look blurry when printed</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
