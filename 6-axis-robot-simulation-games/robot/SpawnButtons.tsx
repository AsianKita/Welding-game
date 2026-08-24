import { Box, Cylinder, Triangle } from "lucide-react";
import { playSpawnSound, playClickSound } from "./audio";

export type ShapeType = "cube" | "cylinder" | "pyramid";

interface SpawnButtonsProps {
  onSpawn: (type: ShapeType) => void;
  disabled?: boolean;
}

const shapes: { type: ShapeType; icon: typeof Box; label: string; color: string }[] = [
  { type: "cube", icon: Box, label: "Cube", color: "text-sky-400" },
  { type: "cylinder", icon: Cylinder, label: "Cylinder", color: "text-orange-400" },
  { type: "pyramid", icon: Triangle, label: "Pyramid", color: "text-emerald-400" },
];

export default function SpawnButtons({ onSpawn, disabled }: SpawnButtonsProps) {
  return (
    <div className="flex gap-1.5">
      {shapes.map(({ type, icon: Icon, label, color }) => (
        <button
          key={type}
          disabled={disabled}
          onClick={() => {
            playSpawnSound();
            onSpawn(type);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all font-mono text-xs tracking-wide disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          title={`Spawn ${label}`}
        >
          <Icon size={13} className={color} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
