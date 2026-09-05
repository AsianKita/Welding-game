import { useState } from 'react';
import { Clipboard, Download, RotateCcw, Save, Trash2 } from 'lucide-react';
import { RelativeTargetConfig } from '../types';

/**
 * Level-authoring panel. Only rendered while Debug Mode is active: the designer
 * arranges the placeholder parts freely, hits "Save Target State" and then
 * copies/downloads the JSON straight into the level config.
 */
export function DebugPanel({
  levelId,
  targets,
  tolerance,
  onSaveTargetState,
  onRotate,
  onResetParts,
  onClearOverride,
  selectedLabel,
}: {
  levelId: string;
  targets: RelativeTargetConfig[];
  tolerance: { position: number; rotationDeg: number };
  onSaveTargetState: () => void;
  onRotate: (deltaDeg: number) => void;
  onResetParts: () => void;
  onClearOverride: () => void;
  selectedLabel: string;
}) {
  const [status, setStatus] = useState<string | null>(null);

  const json = JSON.stringify({ targets, tolerance }, null, 2);

  const flash = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(null), 2000);
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
      flash('Copied JSON to clipboard');
    } catch {
      flash('Clipboard blocked - use Download');
    }
  };

  const downloadJson = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${levelId}.targets.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash('Downloaded JSON');
  };

  return (
    <div className="pointer-events-auto w-72 rounded-2xl border border-fuchsia-500/50 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur">
      <div className="text-[11px] font-black uppercase tracking-widest text-fuchsia-400">
        Debug / Level Authoring
      </div>
      <div className="mt-1 text-[11px] text-slate-400">
        Selected: <span className="text-slate-100">{selectedLabel}</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1">
        {[-45, -15, 15, 45].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onRotate(d)}
            className="rounded-md bg-slate-800 py-1 text-[11px] font-bold hover:bg-slate-700"
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          onSaveTargetState();
          flash('Target state saved');
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 py-2 text-xs font-bold uppercase tracking-wide hover:bg-fuchsia-500"
      >
        <Save size={14} /> Save Target State
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copyJson}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-[11px] font-bold hover:bg-slate-700"
        >
          <Clipboard size={13} /> Copy JSON
        </button>
        <button
          type="button"
          onClick={downloadJson}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-[11px] font-bold hover:bg-slate-700"
        >
          <Download size={13} /> Download
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onResetParts}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-[11px] font-bold hover:bg-slate-700"
        >
          <RotateCcw size={13} /> Respawn
        </button>
        <button
          type="button"
          onClick={() => {
            onClearOverride();
            flash('Local override cleared');
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-[11px] font-bold text-red-300 hover:bg-slate-700"
        >
          <Trash2 size={13} /> Clear
        </button>
      </div>

      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/60 p-2 text-[10px] leading-tight text-emerald-300">
        {json}
      </pre>

      {status && (
        <div className="mt-2 text-[11px] font-semibold text-amber-300">{status}</div>
      )}
    </div>
  );
}

export default DebugPanel;
