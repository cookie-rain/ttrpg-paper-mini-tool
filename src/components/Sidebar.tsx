import { useRef } from 'react';
import { useStore } from '../store';
import { BASE_COLORS } from '../lib/constants';
import { FigureImage } from './FigureImage';

export function Sidebar() {
  const figures = useStore((s) => s.figures);
  const images = useStore((s) => s.images);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const addImageFiles = useStore((s) => s.addImageFiles);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalCopies = figures.reduce((sum, f) => sum + Math.max(1, f.count), 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <h2>Figures</h2>
          <span className="muted small">
            {figures.length} {figures.length === 1 ? 'figure' : 'figures'} · {totalCopies} to print
          </span>
        </div>
        <button type="button" className="primary" onClick={() => fileInput.current?.click()}>
          + Add images
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            addImageFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {figures.length === 0 ? (
        <div className="sidebar-empty">
          <p>Drop images anywhere in the window or use “Add images”.</p>
          <p className="muted small">Transparent PNGs work best — the empty border is trimmed automatically.</p>
        </div>
      ) : (
        <ul className="figure-list">
          {figures.map((figure) => {
            const color = BASE_COLORS[figure.color].hex;
            return (
              <li key={figure.id}>
                <button
                  type="button"
                  className={`figure-list-item ${figure.id === selectedId ? 'selected' : ''}`}
                  onClick={() => select(figure.id)}
                >
                  <span className="thumb">
                    <FigureImage
                      figure={figure}
                      image={images[figure.imageId]}
                      heightPx={Math.min(44, (44 * figure.crop.height) / figure.crop.width)}
                    />
                  </span>
                  <span className="figure-list-text">
                    <span className="figure-list-name">{figure.name || 'Unnamed'}</span>
                    <span className="muted small">{figure.info || ' '}</span>
                  </span>
                  {/* Always rendered, so names do not shift when a colour is set or removed. */}
                  <span className="color-dot" style={{ background: color ?? 'transparent' }} />
                  <span className="count-badge">×{figure.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
