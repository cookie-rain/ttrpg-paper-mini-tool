import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type {
  BaseStyle,
  ColorStyle,
  CutLineStyle,
  FoldLineStyle,
  PackingMode,
  PaperSize,
  PrismLabel,
} from '../types';
import { LOW_DPI_WARNING, PAPER_SIZES_MM } from '../lib/constants';
import { effectiveDpi, prismCloses, prismPanelWidths } from '../lib/geometry';
import { PRISM_SIDES } from '../lib/sides';
import { layoutPages } from '../lib/layout';
import { buildPdf, downloadBlob, printPages, renderPrintPages } from '../lib/output';
import { createPageCanvas, decodeFigureImages, renderPage } from '../lib/render';
import { Field, LengthInput, Segmented } from './controls';

/** A band that only carries colour can be as thin as a line. */
const BAND_MIN_MM = 1;
/** With a name in it the band needs room for the type. */
const TEXT_BAND_MIN_MM = 4;
const PREVIEW_WIDTH_PX = 560;
const PREVIEW_DEBOUNCE_MS = 150;

export function PrintView() {
  const figures = useStore((s) => s.figures);
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);

  const layout = useMemo(() => layoutPages(figures, settings), [figures, settings]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPrisms = figures.some((f) => f.shape === 'prism');
  const minBandMm = settings.prismLabel === 'text' ? TEXT_BAND_MIN_MM : BAND_MIN_MM;
  const hasFlat = figures.some((f) => f.shape === 'flat');
  const lowResFigures = figures.filter((f) => effectiveDpi(f) < LOW_DPI_WARNING);
  const oversized = figures.filter((f) => layout.oversizedFigureIds.includes(f.id));
  const unclosable = figures.filter(
    (f) => f.shape === 'prism' && !prismCloses(prismPanelWidths(f, settings)),
  );

  const exportPages = async (action: 'pdf' | 'print') => {
    setError(null);
    try {
      setBusy('Rendering pages…');
      const blobs = await renderPrintPages(figures, images, settings, (done, total) =>
        setBusy(`Rendering page ${done} of ${total}…`),
      );
      if (action === 'pdf') {
        setBusy('Building PDF…');
        const bytes = await buildPdf(blobs, settings);
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'paper-minis.pdf');
      } else {
        await printPages(blobs, settings);
      }
    } catch (failure) {
      console.error(failure);
      setError('Something went wrong while rendering. See the browser console for details.');
    }
    // Always release the buttons again, so a failed export can be retried straight away.
    setBusy(null);
  };

  const openFigure = (id: string) => {
    select(id);
    setView('editor');
  };

  return (
    <div className="print-view">
      <section className="panel print-settings">
        <h2>Print settings</h2>
        <Field label="Paper">
          <select value={settings.paper} onChange={(e) => updateSettings({ paper: e.target.value as PaperSize })}>
            {(Object.keys(PAPER_SIZES_MM) as PaperSize[]).map((key) => (
              <option key={key} value={key}>
                {PAPER_SIZES_MM[key].label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          group
          label="Layout"
          hint={
            settings.packing === 'rows'
              ? 'Cards in rows and columns — everything can be cut with long straight cuts.'
              : 'Cards fill every gap and may be rotated — uses less paper, but needs more individual cuts.'
          }
        >
          <Segmented<PackingMode>
            ariaLabel="Layout"
            value={settings.packing}
            options={[
              { value: 'rows', label: 'Easy to cut' },
              { value: 'compact', label: 'Save paper' },
            ]}
            onChange={(packing) => updateSettings({ packing })}
          />
        </Field>
        {(hasFlat || !hasPrisms) && (
        <Field
          group
          label="Base"
          hint={
            settings.baseStyle === 'stand'
              ? 'Base strips clip into a plastic stand.'
              : 'No stand needed: bend both base strips out 90° into a foot, then fold the extra flap under it and glue.'
          }
        >
          <Segmented<BaseStyle>
            ariaLabel="Base"
            value={settings.baseStyle}
            options={[
              { value: 'stand', label: 'For stands' },
              { value: 'folded', label: 'Folded paper foot' },
            ]}
            onChange={(baseStyle) => updateSettings({ baseStyle })}
          />
        </Field>
        )}
        {(hasFlat || !hasPrisms) && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.flatText}
              onChange={(e) => updateSettings({ flatText: e.target.checked })}
            />
            Name and info on the base
          </label>
        )}
        {hasPrisms && (
          <>
            <h3>Triangular minis</h3>
            <Field
              label="Bottom band"
              hint={
                settings.prismLabel === 'none'
                  ? 'The artwork runs all the way down to the edge the figure stands on.'
                  : 'A strip below the artwork, printed on the outside of the tube.'
              }
            >
              <select
                value={settings.prismLabel}
                onChange={(e) => {
                  const prismLabel = e.target.value as PrismLabel;
                  // A colour-only band can be a hairline; text needs room to stay readable.
                  const floor = prismLabel === 'text' ? TEXT_BAND_MIN_MM : BAND_MIN_MM;
                  updateSettings({
                    prismLabel,
                    prismLabelHeightMm: Math.max(settings.prismLabelHeightMm, floor),
                  });
                }}
              >
                <option value="text">Name and colour</option>
                <option value="stripe">Colour only</option>
                <option value="edges">Colour marks at the folds</option>
                <option value="none">Nothing</option>
              </select>
            </Field>
            {settings.prismLabel !== 'none' && (
              <>
                <Field group label="Band on">
                  <div className="band-sides">
                    {PRISM_SIDES.map(({ key, label }) => (
                      <label key={key} className="checkbox small">
                        <input
                          type="checkbox"
                          checked={settings.prismBandSides[key]}
                          onChange={(e) =>
                            updateSettings({
                              prismBandSides: { ...settings.prismBandSides, [key]: e.target.checked },
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </Field>
                <div className="field-row">
                  <Field label="Band height">
                    <LengthInput
                      valueMm={settings.prismLabelHeightMm}
                      unit={settings.unit}
                      minMm={minBandMm}
                      maxMm={20}
                      onChange={(prismLabelHeightMm) => updateSettings({ prismLabelHeightMm })}
                    />
                  </Field>
                </div>
              </>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.prismWidths === 'equal'}
                onChange={(e) => updateSettings({ prismWidths: e.target.checked ? 'equal' : 'auto' })}
              />
              All three faces the same width
            </label>
            <p className="muted small">
              {settings.prismWidths === 'equal'
                ? 'Every face takes the widest one; narrower artwork keeps its place in the middle.'
                : 'Each face is as wide as the artwork on it, so the tube follows the figure.'}
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.glueTab}
                onChange={(e) => updateSettings({ glueTab: e.target.checked })}
              />
              Glue tab for closing the tube
            </label>
            <p className="muted small">Without the tab, close the tube with a piece of tape instead.</p>
            <h3>All minis</h3>
          </>
        )}

        <Field label="Cut lines">
          <select
            value={settings.cutLines}
            onChange={(e) => updateSettings({ cutLines: e.target.value as CutLineStyle })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="corners">Corner marks only</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Field label="Fold line">
          <select
            value={settings.foldLine}
            onChange={(e) => updateSettings({ foldLine: e.target.value as FoldLineStyle })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="edge-ticks">Ticks at the edges</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Field group label="Base color style">
          <Segmented<ColorStyle>
            ariaLabel="Base color style"
            value={settings.colorStyle}
            options={[
              { value: 'fill', label: 'Filled' },
              { value: 'stripes', label: 'Side stripes' },
            ]}
            onChange={(colorStyle) => updateSettings({ colorStyle })}
          />
        </Field>
        <div className="field-row">
          <Field label="Page margin">
            <LengthInput
              valueMm={settings.marginMm}
              unit={settings.unit}
              minMm={0}
              maxMm={30}
              onChange={(marginMm) => updateSettings({ marginMm })}
            />
          </Field>
          <Field label="Gap between cards">
            <LengthInput
              valueMm={settings.gapMm}
              unit={settings.unit}
              minMm={0}
              maxMm={20}
              onChange={(gapMm) => updateSettings({ gapMm })}
            />
          </Field>
        </div>
        <div className="field-row">
          <Field label={settings.baseStyle === 'folded' ? 'Foot depth (per side)' : 'Base strip height'}>
            <LengthInput
              valueMm={settings.baseHeightMm}
              unit={settings.unit}
              minMm={5}
              maxMm={25}
              onChange={(baseHeightMm) => updateSettings({ baseHeightMm })}
            />
          </Field>
          <Field label="Minimum card width">
            <LengthInput
              valueMm={settings.minWidthMm}
              unit={settings.unit}
              minMm={10}
              maxMm={60}
              onChange={(minWidthMm) => updateSettings({ minWidthMm })}
            />
          </Field>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.calibrationRuler}
            onChange={(e) => updateSettings({ calibrationRuler: e.target.checked })}
          />
          Calibration ruler on every page
        </label>

        <div className="print-actions">
          <button
            type="button"
            className="primary"
            disabled={!!busy || layout.pages.length === 0}
            onClick={() => exportPages('pdf')}
          >
            Download PDF
          </button>
          <button type="button" disabled={!!busy || layout.pages.length === 0} onClick={() => exportPages('print')}>
            Print…
          </button>
        </div>
        {busy && <p className="muted small">{busy}</p>}
        {error && <p className="warning-note small">{error}</p>}
        <p className="muted small">Always print at 100 % / “actual size”. Check the calibration ruler after printing.</p>

        {(oversized.length > 0 || unclosable.length > 0 || lowResFigures.length > 0) && (
          <div className="warnings warning-note">
            {oversized.map((f) => (
              <p key={f.id}>
                <button type="button" className="link" onClick={() => openFigure(f.id)}>
                  {f.name || 'Unnamed'}
                </button>{' '}
                does not fit on one sheet and is skipped.
              </p>
            ))}
            {unclosable.map((f) => (
              <p key={f.id}>
                <button type="button" className="link" onClick={() => openFigure(f.id)}>
                  {f.name || 'Unnamed'}
                </button>{' '}
                has one face wider than the other two together, so its tube cannot be closed.
              </p>
            ))}
            {lowResFigures.map((f) => (
              <p key={f.id}>
                <button type="button" className="link" onClick={() => openFigure(f.id)}>
                  {f.name || 'Unnamed'}
                </button>{' '}
                has a low resolution ({Math.round(effectiveDpi(f))} dpi) and may look blurry.
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="print-preview">
        <div className="print-preview-header">
          <h2>Preview</h2>
          <span className="muted small">
            {layout.pages.length} {layout.pages.length === 1 ? 'page' : 'pages'} ·{' '}
            {layout.pages.reduce((sum, page) => sum + page.cards.length, 0)} cards
          </span>
        </div>
        {layout.pages.length === 0 ? (
          <div className="empty-state">
            <p className="muted">Nothing to print yet.</p>
          </div>
        ) : (
          <PreviewPages layout={layout} />
        )}
      </section>
    </div>
  );
}

function PreviewPages({ layout }: { layout: ReturnType<typeof layoutPages> }) {
  const figures = useStore((s) => s.figures);
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const decoded = await decodeFigureImages(figures, images);
      if (cancelled || !containerRef.current) return;
      const paper = PAPER_SIZES_MM[settings.paper];
      const pxPerMm = (PREVIEW_WIDTH_PX / paper.width) * Math.min(2, window.devicePixelRatio || 1);
      const canvases = layout.pages.map((page, index) => {
        const canvas = createPageCanvas(settings, pxPerMm);
        renderPage(canvas, page, index, layout.pages.length, figures, decoded, settings, pxPerMm);
        canvas.className = 'preview-page';
        canvas.setAttribute('aria-label', `Page ${index + 1}`);
        return canvas;
      });
      containerRef.current.replaceChildren(...canvases);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [layout, figures, images, settings]);

  return <div className="preview-pages" ref={containerRef} style={{ ['--page-width' as string]: `${PREVIEW_WIDTH_PX}px` }} />;
}
