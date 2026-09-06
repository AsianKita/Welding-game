import { useState } from 'react';
import {
  Clipboard,
  Download,
  RotateCcw,
  Save,
  Spline,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { RelativeTargetConfig, Vec3 } from '../types';

/**
 * Level-authoring panel. Only rendered while Debug Mode is active: the designer
 * arranges the placeholder parts freely, marks where the weld joint runs, hits
 * "Save", then copies/downloads the JSON straight into the level config.
 */
export function DebugPanel({
  levelId,
  targets,
  tolerance,
  weldPathLocal,
  weldAuthoring,
  onToggleWeldAuthoring,
  onUndoWeldNode,
  onClearWeldPath,
  onSaveTargetState,
  onSaveWeldPath,
  onResetParts,
  onClearOverride,
  onClose,
}: {
  levelId: string;
  targets: RelativeTargetConfig[];
  tolerance: { position: number; rotationDeg: number };
  weldPathLocal: Vec3[];
  weldAuthoring: boolean;
  onToggleWeldAuthoring: () => void;
  onUndoWeldNode: () => void;
  onClearWeldPath: () => void;
  onSaveTargetState: () => void;
  onSaveWeldPath: () => void;
  onResetParts: () => void;
  onClearOverride: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);

  const json = JSON.stringify(
    { targets, tolerance, weldPathLocal },
    null,
    2
  );

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
    <div className="pointer-events-auto flex max-h-[70vh] w-[min(92vw,20rem)] flex-col overflow-y-auto rounded-2xl border border-fuchsia-500/50 bg-slate-950/95 p-3 text-slate-200 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest text-fuchsia-400">
          Level Authoring
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close debug panel"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Weld joint authoring */}
      <button
        type="button"
        onClick={onToggleWeldAuthoring}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold uppercase tracking-wide ${
          weldAuthoring
            ? 'bg-pink-600 text-white'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <Spline size={14} />
        {weldAuthoring ? 'Placing Weld Joint…' : 'Place Weld Joint'}
      </button>
      {weldAuthoring && (
        <p className="mt-1 text-[10px] leading-snug text-slate-400">
          Click along the seam on the parts to drop weld nodes ({weldPathLocal.length}{' '}
          placed).
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <SmallButton onClick={onUndoWeldNode} icon={<Undo2 size={13} />}>
          Undo Node
        </SmallButton>
        <SmallButton onClick={onClearWeldPath} icon={<Trash2 size={13} />}>
          Clear Path
        </SmallButton>
      </div>

      <div className="my-3 h-px bg-slate-800" />

      <button
        type="button"
        onClick={() => {
          onSaveTargetState();
          flash('Target state saved');
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 py-2 text-xs font-bold uppercase tracking-wide hover:bg-fuchsia-500"
      >
        <Save size={14} /> Save Target State
      </button>
      <button
        type="button"
        onClick={() => {
          onSaveWeldPath();
          flash('Weld path saved');
        }}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-pink-700 py-2 text-xs font-bold uppercase tracking-wide hover:bg-pink-600"
      >
        <Save size={14} /> Save Weld Path
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <SmallButton onClick={copyJson} icon={<Clipboard size={13} />}>
          Copy JSON
        </SmallButton>
        <SmallButton onClick={downloadJson} icon={<Download size={13} />}>
          Download
        </SmallButton>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <SmallButton onClick={onResetParts} icon={<RotateCcw size={13} />}>
          Respawn
        </SmallButton>
        <SmallButton
          onClick={() => {
            onClearOverride();
            flash('Local override cleared');
          }}
          icon={<Trash2 size={13} />}
          danger
        >
          Clear Saved
        </SmallButton>
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

function SmallButton({
  onClick,
  icon,
  children,
  danger = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg bg-slate-800 text-[11px] font-bold hover:bg-slate-700 ${
        danger ? 'text-red-300' : 'text-slate-200'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export default DebugPanel;
