import { useStore } from '../store';
import { MIN_FIGURE_HEIGHT_MM, SIZE_CATEGORIES } from '../lib/constants';
import { figureImageSize, maxFigureHeightMm } from '../lib/geometry';
import { formatCategoryInGame, formatLength } from '../lib/units';
import { Field, InGameInput, LengthInput } from './controls';
import { FigureImage } from './FigureImage';
import { SizeLegend } from './SizeLegend';
import { Stage, type StageItem } from './Stage';
import { referenceLines, silhouetteRowItem } from './stageItems';

/** In the lineup the figures may walk further in front of the dragon than in the editor. */
const LINEUP_FIGURE_OVERLAP = 0.5;

export function Lineup() {
  const figures = useStore((s) => s.figures);
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const updateFigure = useStore((s) => s.updateFigure);
  const updateSettings = useStore((s) => s.updateSettings);
  const lineup = useStore((s) => s.lineup);
  const updateLineup = useStore((s) => s.updateLineup);

  const hidden = new Set(lineup.hiddenIds);
  const visibleFigures = figures.filter((f) => !hidden.has(f.id));
  const setHidden = (id: string, isHidden: boolean) =>
    updateLineup({
      hiddenIds: isHidden ? [...lineup.hiddenIds, id] : lineup.hiddenIds.filter((hiddenId) => hiddenId !== id),
    });

  const items: StageItem[] = visibleFigures.map<StageItem>((figure) => {
      const size = figureImageSize(figure);
      return {
        key: figure.id,
        kind: 'figure',
        heightMm: figure.heightMm,
        widthMm: size.width,
        selected: figure.id === selectedId,
        onClick: () => select(figure.id),
        render: (pxPerMm) => (
          <FigureImage figure={figure} image={images[figure.imageId]} heightPx={figure.heightMm * pxPerMm} />
        ),
        label: (
          <>
            <button
              type="button"
              className="link"
              onDoubleClick={() => setView('editor')}
              onClick={() => select(figure.id)}
            >
              <strong>{figure.name || 'Unnamed'}</strong>
            </button>
            <span className="size-print small" title="Print size">
              {formatLength(size.width, settings.unit)} × {formatLength(size.height, settings.unit)}
            </span>
            <LengthInput
              compact
              ariaLabel={`Print height of ${figure.name}`}
              valueMm={figure.heightMm}
              unit={settings.unit}
              minMm={MIN_FIGURE_HEIGHT_MM}
              maxMm={maxFigureHeightMm(figure.crop, settings)}
              onChange={(heightMm) => {
                select(figure.id);
                updateFigure(figure.id, { heightMm });
              }}
            />
            <InGameInput
              compact
              ariaLabel={`In-game height of ${figure.name}`}
              valueMm={figure.heightMm}
              settings={settings}
              minMm={MIN_FIGURE_HEIGHT_MM}
              maxMm={maxFigureHeightMm(figure.crop, settings)}
              onChange={(heightMm) => {
                select(figure.id);
                updateFigure(figure.id, { heightMm });
              }}
            />
            <button type="button" className="link muted small" onClick={() => setHidden(figure.id, true)}>
              Hide
            </button>
          </>
        ),
      };
  });

  return (
    <div className="lineup">
      <section className="panel lineup-stage">
        <div className="panel-header">
          <h2>Lineup</h2>
          <SizeLegend />
          <div className="button-row wrap">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={lineup.showSilhouettes}
                onChange={(e) => updateLineup({ showSilhouettes: e.target.checked })}
              />
              Silhouettes
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={lineup.showHeightLines}
                onChange={(e) => updateLineup({ showHeightLines: e.target.checked })}
              />
              Height lines
            </label>
          </div>
        </div>
        {items.length === 0 && !lineup.showSilhouettes ? (
          <div className="empty-state">
            <p className="muted">Nothing to show. Add figures or enable them on the right.</p>
          </div>
        ) : (
          <Stage
            leading={lineup.showSilhouettes ? silhouetteRowItem(settings, LINEUP_FIGURE_OVERLAP) : undefined}
            items={items}
            labelHeight={122}
            labelWidthPx={96}
            fit="leading"
            referenceLines={lineup.showHeightLines ? referenceLines(settings) : []}
          />
        )}
        <p className="muted small">
          Click a figure to select it, double-click its name to open it in the editor. One grid square is 1 inch. The
          maximum figure size depends on the paper size in the print settings.
        </p>
      </section>

      <div className="lineup-side">
        <section className="panel">
          <div className="panel-header">
            <h2>Figures</h2>
            <div className="button-row">
              <button type="button" onClick={() => updateLineup({ hiddenIds: [] })}>
                All
              </button>
              <button type="button" onClick={() => updateLineup({ hiddenIds: figures.map((f) => f.id) })}>
                None
              </button>
            </div>
          </div>
          {figures.length === 0 ? (
            <p className="muted small">No figures yet.</p>
          ) : (
            <ul className="visibility-list">
              {figures.map((figure) => (
                <li key={figure.id}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={!hidden.has(figure.id)}
                      onChange={(e) => setHidden(figure.id, !e.target.checked)}
                    />
                    <span className="visibility-name">{figure.name || 'Unnamed'}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Hiding only affects the lineup, not printing.</p>
        </section>

        <section className="panel">
          <h2>Size references</h2>
          <p className="muted small">
            Print heights of the reference lines and their in-game size. A guide only — every figure can be any size.
          </p>
          {SIZE_CATEGORIES.map((category) => (
            <Field key={category.id} label={`${category.label} (${category.squares}×${category.squares})`}>
              <span className="button-row">
                <LengthInput
                  valueMm={settings.categoryHeightsMm[category.id]}
                  unit={settings.unit}
                  minMm={MIN_FIGURE_HEIGHT_MM}
                  maxMm={200}
                  onChange={(mm) =>
                    updateSettings({ categoryHeightsMm: { ...settings.categoryHeightsMm, [category.id]: mm } })
                  }
                />
                <span className="size-ingame small">
                  = {formatCategoryInGame(category.id, settings)}
                </span>
              </span>
            </Field>
          ))}
        </section>
      </div>
    </div>
  );
}
