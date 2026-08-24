import { useRef, useCallback } from "react";
import { useDrag } from "@use-gesture/react";
import { playServoJogSound } from "./audio";

const JOINT_ACCENTS = [
  "border-amber-500/40 hover:border-amber-500 text-amber-300 bg-amber-950/20 active:bg-amber-900/40",
  "border-sky-500/40 hover:border-sky-500 text-sky-300 bg-sky-950/20 active:bg-sky-900/40",
  "border-emerald-500/40 hover:border-emerald-500 text-emerald-300 bg-emerald-950/20 active:bg-emerald-900/40",
  "border-purple-500/40 hover:border-purple-500 text-purple-300 bg-purple-950/20 active:bg-purple-900/40",
  "border-rose-500/40 hover:border-rose-500 text-rose-300 bg-rose-950/20 active:bg-rose-900/40",
  "border-yellow-500/40 hover:border-yellow-500 text-yellow-300 bg-yellow-950/20 active:bg-yellow-900/40",
];

const JOINT_NAMES = ["J1 Base", "J2 Shoulder", "J3 Elbow", "J4 Wrist-R", "J5 Wrist-P", "J6 Tool"];

interface JointControlsProps {
  index: number;
  onRotate: (joint: number, direction: number) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}

export default function JointControls({
  index,
  onRotate,
  onInteractionStart,
  onInteractionEnd,
}: JointControlsProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onInteractionEnd();
  }, [onInteractionEnd]);

  const startHold = useCallback(
    (dir: number) => {
      onInteractionStart();
      playServoJogSound(1 + index * 0.1);
      onRotate(index, dir);
      intervalRef.current = setInterval(() => {
        playServoJogSound(1 + index * 0.1);
        onRotate(index, dir);
      }, 50);
    },
    [index, onRotate, onInteractionStart]
  );

  const bind = useDrag(
    ({ movement: [mx], first, last, event }) => {
      event?.stopPropagation();
      if (first) onInteractionStart();
      if (Math.abs(mx) > 6) {
        const dir = mx > 0 ? 1 : -1;
        playServoJogSound(1 + index * 0.1);
        onRotate(index, dir);
      }
      if (last) onInteractionEnd();
    },
    { filterTaps: true }
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    startHold(x < rect.width / 2 ? -1 : 1);
  };

  return (
    <button
      {...bind()}
      onPointerDown={handlePointerDown}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      className={`
        relative flex items-center justify-between w-full rounded-lg border
        ${JOINT_ACCENTS[index]}
        font-mono text-xs font-bold
        select-none touch-none cursor-pointer
        transition-all duration-75
        h-11 px-2.5 shadow-sm
      `}
      style={{ WebkitTapHighlightColor: "transparent" }}
      title={`Jog Joint ${index + 1}: Click left/right half or swipe`}
    >
      <span className="text-[11px] opacity-70 hover:opacity-100 transition-opacity">◀ -</span>
      <span className="text-[11px] tracking-wider uppercase font-semibold">{JOINT_NAMES[index]}</span>
      <span className="text-[11px] opacity-70 hover:opacity-100 transition-opacity">+ ▶</span>
    </button>
  );
}
