import { HardHat } from 'lucide-react';

/** "Thick Skin" HP readout: one hard hat per remaining hit point. */
export function HardHatHUD({ hp, maxHp }: { hp: number; maxHp: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Thick Skin
      </span>
      {Array.from({ length: maxHp }).map((_, i) => (
        <HardHat
          key={i}
          size={20}
          className={
            i < hp ? 'text-amber-400' : 'text-slate-700 opacity-50'
          }
          aria-label={i < hp ? 'Hard hat remaining' : 'Hard hat lost'}
        />
      ))}
    </div>
  );
}

export default HardHatHUD;
