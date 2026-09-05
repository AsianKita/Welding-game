import { HardHat } from 'lucide-react';

interface HardHatBarProps {
  current: number;
  max: number;
}

/** "Thick Skin" HP readout: one hard hat per remaining hit point. */
export function HardHatBar({ current, max }: HardHatBarProps) {
  return (
    <div
      className="flex items-center gap-1"
      role="status"
      aria-label={`${current} of ${max} hard hats remaining`}
    >
      {Array.from({ length: max }).map((_, i) => {
        const alive = i < current;
        return (
          <span
            key={i}
            className={`p-1.5 rounded-lg border transition-all ${
              alive
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-900 text-slate-700 border-slate-800 opacity-60'
            }`}
          >
            <HardHat size={16} />
          </span>
        );
      })}
    </div>
  );
}

export default HardHatBar;
