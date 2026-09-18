import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from '../lib/colors';

const PANEL_WIDTH_PX = 224;
const PANEL_HEIGHT_PX = 290;
const MARGIN_PX = 8;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Colour picker in the app's own styling. The native <input type="color"> opens an operating system
 * dialog that cannot be themed at all, so the saturation area, the hue slider and the chrome around
 * them are drawn here. Rendered into a portal so the panel's own scrolling cannot clip it.
 */
export function ColorPicker({
  value,
  anchor,
  remembered,
  onChange,
  onClose,
}: {
  value: string;
  /** Element the panel is placed under. */
  anchor: HTMLElement | null;
  /** Colours picked earlier, offered for reuse. */
  remembered: string[];
  onChange: (hex: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      // Below the swatch by default, above it when the window ends first.
      const below = rect.bottom + MARGIN_PX;
      const top = below + PANEL_HEIGHT_PX > window.innerHeight ? rect.top - PANEL_HEIGHT_PX - MARGIN_PX : below;
      const left = Math.min(Math.max(MARGIN_PX, rect.left), window.innerWidth - PANEL_WIDTH_PX - MARGIN_PX);
      setPosition({ top: Math.max(MARGIN_PX, top), left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor, onClose]);

  const apply = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setText(hex);
    onChange(hex);
  };

  /** Drags inside a box, reporting the position as two fractions from its top-left corner. */
  const track = (event: ReactPointerEvent<HTMLDivElement>, report: (x: number, y: number) => void) => {
    if (event.type === 'pointermove' && !(event.buttons & 1)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
    report(clamp01((event.clientX - rect.left) / rect.width), clamp01((event.clientY - rect.top) / rect.height));
  };

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  if (!position) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="color-picker"
      role="dialog"
      aria-label="Choose a colour"
      style={{ top: position.top, left: position.left, width: PANEL_WIDTH_PX }}
    >
      <div
        className="color-field"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        onPointerDown={(e) => track(e, (x, y) => apply({ ...hsv, s: x, v: 1 - y }))}
        onPointerMove={(e) => track(e, (x, y) => apply({ ...hsv, s: x, v: 1 - y }))}
      >
        <span className="color-handle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>

      <div
        className="color-hue"
        onPointerDown={(e) => track(e, (x) => apply({ ...hsv, h: x * 360 }))}
        onPointerMove={(e) => track(e, (x) => apply({ ...hsv, h: x * 360 }))}
      >
        <span className="color-handle" style={{ left: `${(hsv.h / 360) * 100}%`, top: '50%' }} />
      </div>

      {remembered.length > 0 && (
        <div className="color-recent" role="group" aria-label="Colours you used before">
          {remembered.map((hex) => (
            <button
              key={hex}
              type="button"
              className={`color-chip ${hex.toLowerCase() === hsvToHex(hsv).toLowerCase() ? 'active' : ''}`}
              style={{ background: hex }}
              title={hex}
              aria-label={hex}
              onClick={() => {
                setHsv(hexToHsv(hex));
                setText(hex);
                onChange(hex);
              }}
            />
          ))}
        </div>
      )}

      <div className="color-footer">
        <span className="color-preview" style={{ background: hsvToHex(hsv) }} aria-hidden="true" />
        <input
          className="color-hex"
          aria-label="Colour as a hex value"
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) {
              setHsv(hexToHsv(hex));
              onChange(hex);
            }
          }}
          onBlur={() => setText(hsvToHex(hsv))}
        />
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
