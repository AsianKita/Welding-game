import React, { useState, useEffect, useRef, useCallback } from 'react';

interface WeldDialProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
  unit: string;
  size?: 'mini' | 'compact' | 'standard';
}

export default function WeldDial({
  label,
  min,
  max,
  step,
  value,
  onChange,
  unit,
  size = 'standard',
}: WeldDialProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);

  const calculateValueFromCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = clientX - centerX;
      const y = clientY - centerY;

      // Calculate angle in degrees (0 deg is top)
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      angle += 90;
      if (angle < 0) angle += 360;

      // Dead zone constraint between 135 and 225 deg
      if (angle > 135 && angle < 225) {
        if (angle <= 180) {
          onChange(max);
        } else {
          onChange(min);
        }
        return;
      }

      let percentage = 0;
      if (angle <= 135) {
        percentage = (angle + 135) / 270;
      } else {
        percentage = (angle - 225) / 270;
      }

      percentage = Math.max(0, Math.min(1, percentage));
      const rawValue = min + percentage * (max - min);

      // Snap to step precision
      const inverseStep = 1 / step;
      const steppedValue = Math.round(rawValue * inverseStep) / inverseStep;

      onChange(Math.min(max, Math.max(min, Number(steppedValue.toFixed(2)))));
    },
    [min, max, step, onChange]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      calculateValueFromCoords(e.clientX, e.clientY);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, calculateValueFromCoords]);

  // Calculate rotation for visual knob (-135deg to +135deg)
  const clampedVal = Math.min(max, Math.max(min, value));
  const rotation = -135 + ((clampedVal - min) / (max - min)) * 270;

  if (size === 'mini') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs font-mono select-none">
        <span className="text-slate-400 font-bold uppercase text-[10px] w-16 truncate">{label}:</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex items-baseline gap-0.5 min-w-[50px] justify-end">
          <span className="text-amber-300 font-bold text-xs">{step < 1 ? value.toFixed(1) : Math.round(value)}</span>
          <span className="text-slate-500 text-[10px]">{unit}</span>
        </div>
      </div>
    );
  }

  const dialDiameterClass = size === 'compact' ? 'w-14 h-14' : 'w-20 h-20';
  const centerCapClass = size === 'compact' ? 'w-8 h-8' : 'w-12 h-12';
  const textSizeClass = size === 'compact' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`flex flex-col items-center select-none ${size === 'compact' ? 'gap-1' : 'gap-2'}`}>
      <span className="text-gray-300 text-xs font-mono font-bold tracking-wider uppercase">
        {label}
      </span>
      <div
        ref={dialRef}
        className={`relative ${dialDiameterClass} rounded-full bg-slate-900 border-2 sm:border-4 border-slate-700 shadow-[inset_0_4px_6px_rgba(0,0,0,0.6)] cursor-grab active:cursor-grabbing flex items-center justify-center touch-none transition-shadow hover:border-amber-500/60`}
        onPointerDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
          calculateValueFromCoords(e.clientX, e.clientY);
        }}
      >
        {/* Glow indicator track */}
        <div
          className="absolute w-full h-full pointer-events-none transition-transform duration-75 ease-out"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className={`${size === 'compact' ? 'w-1.5 h-4' : 'w-2 h-6'} bg-amber-500 mx-auto mt-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.9)]`} />
        </div>

        {/* Center cap readout */}
        <div className={`${centerCapClass} bg-slate-950 rounded-full shadow-lg flex items-center justify-center pointer-events-none border border-slate-800`}>
          <span className={`text-amber-400 font-mono font-bold ${textSizeClass}`}>
            {step < 1 ? value.toFixed(1) : Math.round(value)}
          </span>
        </div>
      </div>
      <span className="text-slate-400 text-[10px] font-mono">{unit}</span>
    </div>
  );
}
