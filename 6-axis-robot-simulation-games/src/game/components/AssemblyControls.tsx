import { Move3D, RotateCw } from 'lucide-react';
import { PartConfig, TransformSpace } from '../types';

/**
 * Compact, touch-first transform pad for the assembly phase.
 *
 * There are no text inputs and no free sliders: step size is picked from three
 * discrete speeds (low / med / high) so every adjustment lands on a whole-number
 * unit value. Axis colours match the Fusion-style gizmo drawn in the viewport -
 * X red, Y green, Z blue - so a button's effect is obvious at a glance.
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

/** Low / medium / high speed choices, shared by movement and rotation. */
export const STEP_CHOICES = [1, 10, 25] as const;

const AXES: {
  axis: 0 | 1 | 2;
  label: string;
  hint: string;
  text: string;
  ring: string;
}[] = [
  { axis: 0, label: 'X', hint: 'left / right', text: 'text-red-400', ring: 'bg-red-500/15' },
  { axis: 1, label: 'Y', hint: 'down / up', text: 'text-green-400', ring: 'bg-green-500/15' },
  { axis: 2, label: 'Z', hint: 'back / fwd', text: 'text-blue-400', ring: 'bg-blue-500/15' },
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
      className={`pointer-events-auto w-full rounded-xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl backdrop-blur ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-1">
        {parts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`min-h-[26px] rounded-md px-2 text-[10px] font-bold transition-colors ${
              selectedId === p.id
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}

        {readout && (
          <span className="font-mono text-[9px] text-slate-500">
            {readout.position} · {readout.rotation}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5 rounded-md bg-slate-900 p-0.5">
          {(['world', 'local'] as TransformSpace[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpaceChange(s)}
              title={
                s === 'local'
                  ? 'Move/rotate along the part\u2019s own axes'
                  : 'Move/rotate along the table axes'
              }
              className={`min-h-[24px] rounded px-1.5 text-[9px] font-bold uppercase transition-colors ${
                space === s ? 'bg-fuchsia-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {s === 'local' ? 'Perp' : 'World'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <AxisGroup
          icon={<Move3D size={11} />}
          title="Move"
          unit="cm"
          step={moveStepCm}
          onStepChange={onMoveStepChange}
          onNudge={(axis, sign) => onNudge(axis, sign * moveStepCm)}
        />
        <AxisGroup
          icon={<RotateCw size={11} />}
          title="Rotate"
          unit="°"
          step={rotateStepDeg}
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
  onStepChange,
  onNudge,
}: {
  icon: React.ReactNode;
  title: string;
  unit: string;
  step: number;
  onStepChange: (v: number) => void;
  onNudge: (axis: 0 | 1 | 2, sign: 1 | -1) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
          {icon}
          {title}
        </span>
        <div className="ml-auto flex gap-0.5">
          {STEP_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onStepChange(choice)}
              aria-pressed={step === choice}
              aria-label={`${title} step ${choice}${unit}`}
              className={`min-h-[22px] w-9 rounded font-mono text-[9px] font-bold transition-colors ${
                step === choice
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {choice}
              {unit}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {AXES.map(({ axis, label, hint, text, ring }) => (
          <div key={label} className={`flex items-center gap-1 rounded ${ring} p-0.5`}>
            <span className={`w-3 text-center text-[9px] font-black ${text}`} title={hint}>
              {label}
            </span>
            <button
              type="button"
              onClick={() => onNudge(axis, -1)}
              aria-label={`${title} ${label} minus ${step}${unit}`}
              className="min-h-[28px] flex-1 rounded bg-slate-800 text-xs font-black text-slate-200 active:bg-amber-500 active:text-slate-950 sm:hover:bg-slate-700"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => onNudge(axis, 1)}
              aria-label={`${title} ${label} plus ${step}${unit}`}
              className="min-h-[28px] flex-1 rounded bg-slate-800 text-xs font-black text-slate-200 active:bg-amber-500 active:text-slate-950 sm:hover:bg-slate-700"
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AssemblyControls;
