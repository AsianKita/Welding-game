import { Move3D, RotateCw } from 'lucide-react';
import { PartConfig, TransformSpace } from '../types';

/**
 * Touch-first transform pad for the assembly phase.
 *
 * Deliberately has no text inputs: every adjustment is a button tap or a slider
 * drag, and every value is a whole number (centimetres for movement, degrees
 * for rotation) so parts land on predictable values.
 */
export interface AssemblyControlsProps {
  parts: PartConfig[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Position in whole centimetres, per world/local axis. */
  onNudge: (axis: 0 | 1 | 2, cm: number) => void;
  /** Rotation in whole degrees, per world/local axis. */
  onRotate: (axis: 0 | 1 | 2, deg: number) => void;
  space: TransformSpace;
  onSpaceChange: (space: TransformSpace) => void;
  moveStepCm: number;
  onMoveStepChange: (cm: number) => void;
  rotateStepDeg: number;
  onRotateStepChange: (deg: number) => void;
  /** Live readout of the selected part. */
  readout?: { position: string; rotation: string };
  disabled?: boolean;
}

const AXES: { axis: 0 | 1 | 2; label: string; hint: string; color: string }[] = [
  { axis: 0, label: 'X', hint: 'left / right', color: 'text-rose-300' },
  { axis: 1, label: 'Y', hint: 'down / up', color: 'text-emerald-300' },
  { axis: 2, label: 'Z', hint: 'back / fwd', color: 'text-sky-300' },
];

export function AssemblyControls({
  parts,
  selectedId,
  onSelect,
  onNudge,
  onRotate,
  space,
  onSpaceChange,
  moveStepCm,
  onMoveStepChange,
  rotateStepDeg,
  onRotateStepChange,
  readout,
  disabled = false,
}: AssemblyControlsProps) {
  return (
    <div
      className={`pointer-events-auto w-full rounded-2xl border border-slate-800 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur sm:p-3 ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      {/* Part selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Part
        </span>
        {parts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`min-h-[34px] rounded-lg px-2.5 text-[11px] font-bold transition-colors ${
              selectedId === p.id
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1 rounded-lg bg-slate-900 p-0.5">
          {(['world', 'local'] as TransformSpace[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpaceChange(s)}
              title={
                s === 'local'
                  ? 'Move/rotate along the part\u2019s own axes (perpendicular to its face)'
                  : 'Move/rotate along the table axes'
              }
              className={`min-h-[30px] rounded-md px-2 text-[10px] font-bold uppercase transition-colors ${
                space === s
                  ? 'bg-fuchsia-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {s === 'local' ? 'Perp' : 'World'}
            </button>
          ))}
        </div>
      </div>

      {readout && (
        <div className="mt-1.5 font-mono text-[10px] text-slate-500">
          pos {readout.position} · rot {readout.rotation}
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Movement */}
        <AxisGroup
          icon={<Move3D size={13} />}
          title="Move"
          unit="cm"
          step={moveStepCm}
          min={1}
          max={25}
          onStepChange={onMoveStepChange}
          onNudge={(axis, sign) => onNudge(axis, sign * moveStepCm)}
        />

        {/* Rotation */}
        <AxisGroup
          icon={<RotateCw size={13} />}
          title="Rotate"
          unit="°"
          step={rotateStepDeg}
          min={1}
          max={90}
          onStepChange={onRotateStepChange}
          onNudge={(axis, sign) => onRotate(axis, sign * rotateStepDeg)}
        />
      </div>
    </div>
  );
}

function AxisGroup({
  icon,
  title,
  unit,
  step,
  min,
  max,
  onStepChange,
  onNudge,
}: {
  icon: React.ReactNode;
  title: string;
  unit: string;
  step: number;
  min: number;
  max: number;
  onStepChange: (v: number) => void;
  onNudge: (axis: 0 | 1 | 2, sign: 1 | -1) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {icon}
          {title}
        </span>
        {/* Whole-number step slider: no typing, always an integer. */}
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={step}
          onChange={(e) => onStepChange(parseInt(e.target.value, 10))}
          aria-label={`${title} step in ${unit}`}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-500"
        />
        <span className="w-10 shrink-0 text-right font-mono text-[11px] font-bold text-amber-300">
          {step}
          {unit}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {AXES.map(({ axis, label, hint, color }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className={`text-[9px] font-bold ${color}`} title={hint}>
              {label}
            </span>
            <div className="flex w-full gap-1">
              <button
                type="button"
                onClick={() => onNudge(axis, -1)}
                aria-label={`${title} ${label} minus ${step}${unit}`}
                className="min-h-[36px] flex-1 rounded-lg bg-slate-800 text-sm font-black text-slate-200 active:bg-amber-500 active:text-slate-950 sm:hover:bg-slate-700"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onNudge(axis, 1)}
                aria-label={`${title} ${label} plus ${step}${unit}`}
                className="min-h-[36px] flex-1 rounded-lg bg-slate-800 text-sm font-black text-slate-200 active:bg-amber-500 active:text-slate-950 sm:hover:bg-slate-700"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AssemblyControls;
