import { DialogueLine, PortraitConfig } from '../types';

/**
 * Modular dialogue box. Portraits and text are supplied entirely by the level
 * config; a coloured placeholder swatch is drawn whenever no image is set so
 * final art can be dropped in later without code changes.
 */
export function DialogueBox({
  line,
  portraits,
  angry = false,
  onAdvance,
  advanceLabel = 'Next',
}: {
  line: DialogueLine;
  portraits: Record<string, PortraitConfig>;
  angry?: boolean;
  onAdvance?: () => void;
  advanceLabel?: string;
}) {
  const portrait = portraits[line.portrait || line.speaker];
  const name = portrait?.name || line.speaker;
  const color = portrait?.color || '#f59e0b';

  return (
    <div
      className={`pointer-events-auto w-full max-w-2xl rounded-2xl border-2 p-4 shadow-2xl backdrop-blur ${
        angry
          ? 'border-red-500/70 bg-red-950/80'
          : 'border-amber-500/60 bg-slate-950/85'
      }`}
    >
      <div className="flex gap-4">
        <div
          className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-white/20 flex items-center justify-center text-2xl font-black text-slate-900"
          style={{ backgroundColor: color }}
        >
          {portrait?.image ? (
            <img
              src={portrait.image}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>{name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-400">
            {name}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-100">{line.text}</p>
          {onAdvance && (
            <button
              type="button"
              onClick={onAdvance}
              className="mt-3 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-950 hover:bg-amber-400"
            >
              {advanceLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DialogueBox;
