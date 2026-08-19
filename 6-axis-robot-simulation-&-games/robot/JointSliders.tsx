import { useState, useCallback } from "react";
import { JOINT_LIMITS } from "./RobotModel";
import { playServoJogSound } from "./audio";

const JOINT_ACCENTS = [
  { border: "border-amber-500/40", text: "text-amber-300", track: "accent-amber-400", bg: "bg-amber-950/20" },
  { border: "border-sky-500/40", text: "text-sky-300", track: "accent-sky-400", bg: "bg-sky-950/20" },
  { border: "border-emerald-500/40", text: "text-emerald-300", track: "accent-emerald-400", bg: "bg-emerald-950/20" },
  { border: "border-purple-500/40", text: "text-purple-300", track: "accent-purple-400", bg: "bg-purple-950/20" },
  { border: "border-rose-500/40", text: "text-rose-300", track: "accent-rose-400", bg: "bg-rose-950/20" },
  { border: "border-yellow-500/40", text: "text-yellow-300", track: "accent-yellow-400", bg: "bg-yellow-950/20" },
];

const JOINT_NAMES = ["J1 Base", "J2 Shoulder", "J3 Elbow", "J4 Wrist-R", "J5 Wrist-P", "J6 Tool"];

interface JointSlidersProps {
  jointAngles: number[];
  onChangeJoint: (jointIndex: number, newAngle: number) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}

export default function JointSliders({
  jointAngles,
  onChangeJoint,
  onInteractionStart,
  onInteractionEnd,
}: JointSlidersProps) {
  const handleChange = useCallback(
    (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      onChangeJoint(index, val);
    },
    [onChangeJoint]
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {jointAngles.map((angle, i) => {
        const [min, max] = JOINT_LIMITS[i];
        const deg = ((angle * 180) / Math.PI).toFixed(0);
        const minDeg = ((min * 180) / Math.PI).toFixed(0);
        const maxDeg = ((max * 180) / Math.PI).toFixed(0);
        const style = JOINT_ACCENTS[i];

        return (
          <div
            key={i}
            className={`flex flex-col gap-1.5 p-2 rounded-lg border ${style.border} ${style.bg} backdrop-blur-sm shadow-sm`}
          >
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className={`${style.text} font-bold tracking-wide uppercase`}>
                {JOINT_NAMES[i]}
              </span>
              <span className="text-white font-semibold tabular-nums">{deg}°</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={0.01}
              value={angle}
              onPointerDown={onInteractionStart}
              onPointerUp={onInteractionEnd}
              onTouchStart={onInteractionStart}
              onTouchEnd={onInteractionEnd}
              onChange={(e) => {
                playServoJogSound(1 + i * 0.1);
                handleChange(i, e);
              }}
              className={`w-full h-2 rounded-lg bg-slate-800 appearance-none cursor-pointer ${style.track}`}
            />
            <div className="flex items-center justify-between font-mono text-[9px] text-slate-500">
              <span>{minDeg}°</span>
              <span>{maxDeg}°</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
