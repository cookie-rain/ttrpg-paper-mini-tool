import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Settings, Unit } from '../types';
import { inGameMetres, inGameToMm, mmToUnit, unitStep, unitToMm } from '../lib/units';
import { METRES_PER_FOOT } from '../lib/constants';

/** Parses user input; accepts both "12.5" and "12,5". */
export function parseDecimal(raw: string): number | null {
  const normalised = raw.trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalised)) return null;
  return parseFloat(normalised);
}

/**
 * Text-based number field with its own ▲▼ buttons. Unlike <input type="number"> it accepts a decimal comma
 * as well as a dot in every browser language.
 * Valid values inside the range apply immediately (typing, buttons, arrow keys; Shift steps by 10);
 * anything else is corrected when the field loses focus or Enter is pressed.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  decimals,
  suffix,
  ariaLabel,
  compact = false,
  className = '',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step: number;
  decimals: number;
  suffix?: string;
  ariaLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  const format = (v: number) => String(Number(v.toFixed(decimals)));
  const [text, setText] = useState(format(value));
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const inRange = (v: number) => (min === undefined || v >= min - 1e-9) && (max === undefined || v <= max + 1e-9);

  // Follow value changes from elsewhere (e.g. a slider), but leave half-typed input like "12," alone.
  useEffect(() => {
    const current = parseDecimal(text);
    if (current === null || Math.abs(current - value) >= 0.5 * 10 ** -decimals) setText(format(value));
  }, [value, decimals]);

  const apply = (v: number) => {
    const next = clamp(v);
    onChange(next);
    setText(format(next));
  };

  const commit = () => {
    const parsed = parseDecimal(text);
    if (parsed === null) setText(format(value));
    else apply(parsed);
  };

  /** Moves to the next multiple of the step, so values snap to a clean grid. */
  const stepBy = (direction: 1 | -1, multiplier = 1) => {
    const size = step * multiplier;
    const current = parseDecimal(text) ?? value;
    const epsilon = size * 1e-6;
    const next =
      direction > 0 ? (Math.floor(current / size + epsilon) + 1) * size : (Math.ceil(current / size - epsilon) - 1) * size;
    apply(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1);
    }
  };

  return (
    <span className={`number-input ${compact ? 'compact' : ''} ${className}`}>
      <span className="number-input-box">
        <input
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseDecimal(e.target.value);
            if (parsed !== null && inRange(parsed)) onChange(parsed);
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span className="number-input-steppers">
          <button type="button" tabIndex={-1} aria-label="Increase" onClick={() => stepBy(1)}>
            ▲
          </button>
          <button type="button" tabIndex={-1} aria-label="Decrease" onClick={() => stepBy(-1)}>
            ▼
          </button>
        </span>
      </span>
      {suffix && <span className="unit">{suffix}</span>}
    </span>
  );
}

/** Length field that stores millimetres but shows the user's unit (mm or in). */
export function LengthInput({
  valueMm,
  unit,
  minMm,
  maxMm,
  onChange,
  ariaLabel,
  compact = false,
}: {
  valueMm: number;
  unit: Unit;
  minMm?: number;
  maxMm?: number;
  onChange: (mm: number) => void;
  ariaLabel?: string;
  compact?: boolean;
}) {
  return (
    <NumberInput
      value={mmToUnit(valueMm, unit)}
      onChange={(v) => onChange(unitToMm(v, unit))}
      min={minMm !== undefined ? mmToUnit(minMm, unit) : undefined}
      max={maxMm !== undefined ? mmToUnit(maxMm, unit) : undefined}
      step={unitStep(unit)}
      decimals={2}
      suffix={unit}
      ariaLabel={ariaLabel}
      compact={compact}
      className="size-print"
    />
  );
}

/**
 * Field for the in-game size (metres, or feet in inch mode) of a printed length.
 * Stores and reports millimetres, converting through the size category scale.
 */
export function InGameInput({
  valueMm,
  settings,
  minMm,
  maxMm,
  onChange,
  ariaLabel,
  compact = false,
}: {
  valueMm: number;
  settings: Pick<Settings, 'unit' | 'categoryHeightsMm'>;
  minMm?: number;
  maxMm?: number;
  onChange: (mm: number) => void;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const perUnit = settings.unit === 'in' ? METRES_PER_FOOT : 1;
  const toDisplay = (mm: number) => inGameMetres(mm, settings.categoryHeightsMm) / perUnit;
  return (
    <NumberInput
      value={toDisplay(valueMm)}
      onChange={(v) => onChange(inGameToMm(v * perUnit, settings.categoryHeightsMm))}
      min={minMm !== undefined ? toDisplay(minMm) : undefined}
      max={maxMm !== undefined ? toDisplay(maxMm) : undefined}
      step={settings.unit === 'in' ? 1 : 0.1}
      decimals={2}
      suffix={settings.unit === 'in' ? 'ft' : 'm'}
      ariaLabel={ariaLabel}
      compact={compact}
      className="size-ingame"
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Button that asks for a second click instead of opening a blocking confirm dialog. */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  className,
  title,
}: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      title={title}
      className={`${className ?? ''} ${armed ? 'danger' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
