import React, { useEffect, useRef, useState } from 'react';

interface NumericInputProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  className?: string;
  title?: string;
  disabled?: boolean;
}

const formatValue = (value: number, decimals?: number): string => {
  if (!Number.isFinite(value)) return '';
  if (typeof decimals === 'number') return value.toFixed(decimals);
  return String(Number(value.toFixed(4)));
};

const clampValue = (value: number, min?: number, max?: number): number => {
  let next = value;
  if (typeof min === 'number' && next < min) next = min;
  if (typeof max === 'number' && next > max) next = max;
  return next;
};

/**
 * Free-typing numeric field. The text the user types is kept in local draft state, so the
 * displayed value is never rewritten (snapped back to the stored value, or clamped to the
 * min / max of the range) while an entry is still in progress. Values inside the allowed
 * range are pushed live; out-of-range or partial entries ("", "-", "1.") are only resolved
 * on blur / Enter, where the final number is clamped once.
 */
export function NumericInput({
  value,
  onCommit,
  min,
  max,
  step,
  decimals,
  className,
  title,
  disabled,
}: NumericInputProps) {
  const [draft, setDraft] = useState<string>(() => formatValue(value, decimals));
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) {
      setDraft(formatValue(value, decimals));
    }
  }, [value, decimals]);

  const handleChange = (raw: string) => {
    setDraft(raw);
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    // Only push through values that are already inside the range: clamping mid-entry is
    // exactly what makes a field jump to the min / max while the user is still typing.
    if (clampValue(parsed, min, max) !== parsed) return;
    onCommit(parsed);
  };

  const handleBlur = () => {
    editingRef.current = false;
    const parsed = parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatValue(value, decimals));
      return;
    }
    const clamped = clampValue(parsed, min, max);
    setDraft(formatValue(clamped, decimals));
    onCommit(clamped);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      step={step}
      title={title}
      disabled={disabled}
      onFocus={(e) => {
        editingRef.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          editingRef.current = false;
          setDraft(formatValue(value, decimals));
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

export default NumericInput;
