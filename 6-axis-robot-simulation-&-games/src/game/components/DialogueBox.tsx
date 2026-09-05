import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getPortrait } from '../levelStore';
import type { DialogueLine, LevelConfig } from '../types';

interface DialogueBoxProps {
  config: LevelConfig;
  lines: DialogueLine[];
  /** Rendered in an alarmed style when the dialogue was triggered by a mistake. */
  hostile?: boolean;
  onComplete: () => void;
}

/**
 * Modular dialogue box. Portraits are placeholders driven entirely by config:
 * when a portrait has no `src`, the initials/colour swatch is rendered instead,
 * so real art can be dropped in later without code changes.
 */
export function DialogueBox({ config, lines, hostile = false, onComplete }: DialogueBoxProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [lines]);

  const line = lines[index];
  if (!line) return null;

  const portrait = getPortrait(config, line.speaker);
  const isLast = index >= lines.length - 1;

  const advance = () => {
    if (isLast) onComplete();
    else setIndex((i) => i + 1);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-50 p-3 sm:p-4 pointer-events-none">
      <div
        className={`pointer-events-auto mx-auto max-w-2xl rounded-2xl border backdrop-blur-md shadow-2xl p-3 sm:p-4 flex gap-3 ${
          hostile
            ? 'bg-rose-950/85 border-rose-500/50'
            : 'bg-slate-950/90 border-slate-700'
        }`}
      >
        {portrait.src ? (
          <img
            src={portrait.src}
            alt={portrait.name}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-slate-700 shrink-0"
          />
        ) : (
          <div
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-slate-700 shrink-0 flex items-center justify-center font-mono font-bold text-lg text-white"
            style={{ backgroundColor: portrait.color }}
            aria-label={`${portrait.name} portrait placeholder`}
          >
            {portrait.initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-wide text-amber-400 mb-1">
            {portrait.name}
          </div>
          <p className="text-sm text-slate-100 leading-snug">{line.text}</p>
        </div>

        <button
          onClick={advance}
          className="self-end shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600"
        >
          {isLast ? 'Got it' : 'Next'} <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

export default DialogueBox;
