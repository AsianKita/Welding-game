import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import AssemblyWorkbench, { type WorkbenchMode } from './AssemblyWorkbench';
import DialogueBox from './DialogueBox';
import HardHatBar from './HardHatBar';
import { getLevelConfig } from '../levelStore';
import {
  buildGrindSamples,
  buildWorkpieceOutline,
  getReferencePartId,
  localPointsToWorld,
} from '../geometry';
import type { AlignmentResult, DialogueLine, LevelPhase, TransformData } from '../types';
import FabricationForge, { type WeldQualityReport } from '../../components/robot/FabricationForge';

/** Table height the injected workpiece outline is flattened onto in the forge scene. */
const FORGE_DRAW_PLANE_Y = -0.195;
/** Top surface of the extruded forge workpiece, where the weld path must sit. */
const FORGE_WORKPIECE_TOP_Y = 0.07;

interface LevelManagerProps {
  levelId?: string;
  onExit?: () => void;
}

interface ActiveDialogue {
  /** Increments per trigger so repeating the same banter restarts at the first line. */
  key: number;
  lines: DialogueLine[];
  hostile: boolean;
  /** Phase to enter once the player dismisses the dialogue. */
  next?: LevelPhase;
}

/**
 * Level 1 state machine: Intro -> Assembly -> Tacking -> Grinding -> Execution -> Evaluation.
 * All text, thresholds and geometry come from the level config; this component only
 * sequences states, tracks HP and hands the assembled joint to the welding simulation.
 */
export default function LevelManager({ levelId = 'level_1', onExit }: LevelManagerProps) {
  const config = useMemo(() => getLevelConfig(levelId), [levelId]);
  const referencePartId = useMemo(() => getReferencePartId(config), [config]);

  const [phase, setPhase] = useState<LevelPhase>('intro');
  const [hp, setHp] = useState(config.maxHp);
  const [dialogue, setDialogue] = useState<ActiveDialogue | null>(() => ({
    key: 0,
    lines: config.script.intro ?? [],
    hostile: false,
    next: 'assembly',
  }));
  const dialogueKeyRef = useRef(0);
  const showDialogue = useCallback((next: Omit<ActiveDialogue, 'key'>) => {
    dialogueKeyRef.current += 1;
    setDialogue({ ...next, key: dialogueKeyRef.current });
  }, []);

  const [shake, setShake] = useState(false);
  const [tackedIds, setTackedIds] = useState<string[]>([]);
  const [groundSamples, setGroundSamples] = useState<number[]>([]);
  const [transforms, setTransforms] = useState<Record<string, TransformData>>({});
  const [weldReport, setWeldReport] = useState<WeldQualityReport | null>(null);
  const [runId, setRunId] = useState(0);

  const shakeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    },
    []
  );

  const grindSamples = useMemo(
    () => buildGrindSamples(config.seam, config.grinding),
    [config.seam, config.grinding]
  );

  /** Restarts the level from the intro with full HP. */
  const restartLevel = useCallback(() => {
    setHp(config.maxHp);
    setTackedIds([]);
    setGroundSamples([]);
    setWeldReport(null);
    setPhase('intro');
    setRunId((r) => r + 1);
    showDialogue({ lines: config.script.intro ?? [], hostile: false, next: 'assembly' });
  }, [config, showDialogue]);

  /**
   * Shows a banter line. Damaging banter costs 1 HP, shakes the screen and,
   * at 0 HP, drops the player into the Level Failed state.
   */
  const triggerBanter = useCallback(
    (banterId: string, damage?: boolean) => {
      const entry = config.banter[banterId];
      if (!entry) {
        console.warn(`Missing banter entry: ${banterId}`);
        return;
      }
      const dealsDamage = damage ?? entry.damage;

      if (!dealsDamage) {
        showDialogue({ lines: entry.lines, hostile: true });
        return;
      }

      setShake(true);
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(false), 450);

      const remaining = Math.max(0, hp - 1);
      setHp(remaining);

      if (remaining <= 0) {
        showDialogue({
          lines: [...entry.lines, ...(config.script.levelFailed ?? [])],
          hostile: true,
          next: 'failed',
        });
      } else {
        showDialogue({ lines: entry.lines, hostile: true });
      }
    },
    [config, hp, showDialogue]
  );

  const dismissDialogue = useCallback(() => {
    const next = dialogue?.next;
    setDialogue(null);
    if (next) setPhase(next);
  }, [dialogue]);

  const handleAligned = useCallback(
    (_result: AlignmentResult) => {
      showDialogue({
        lines: config.script.assemblyComplete ?? [],
        hostile: false,
        next: 'tacking',
      });
    },
    [config, showDialogue]
  );

  const handleMisaligned = useCallback(() => {
    triggerBanter('incorrectAssembly', true);
  }, [triggerBanter]);

  const handleTack = useCallback((tackId: string) => {
    setTackedIds((prev) => (prev.includes(tackId) ? prev : [...prev, tackId]));
  }, []);

  const allTacked = tackedIds.length >= config.tackPoints.length;

  const handleFinishTacking = useCallback(() => {
    if (!allTacked) {
      // Attempting to move on to the burn without tacking every corner.
      triggerBanter('missedTack', true);
      return;
    }
    setPhase('grinding');
  }, [allTacked, triggerBanter]);

  const handleGrindSample = useCallback((index: number) => {
    setGroundSamples((prev) => (prev.includes(index) ? prev : [...prev, index]));
  }, []);

  const grindProgress =
    grindSamples.length > 0 ? groundSamples.length / grindSamples.length : 0;

  const handleFinishGrinding = useCallback(() => {
    if (grindProgress + 1e-6 < config.grinding.requiredProgress) {
      triggerBanter('incompleteGrind');
      return;
    }
    showDialogue({
      lines: config.script.grindComplete ?? [],
      hostile: false,
      next: 'execution',
    });
  }, [config, grindProgress, triggerBanter, showDialogue]);

  /**
   * Geometry handed to the welding simulation. The joint keeps the orientation the
   * player built, but is re-centred on the forge table so it can never land off-table.
   */
  const forgeGeometry = useMemo(() => {
    if (phase !== 'execution' && phase !== 'evaluation') {
      return { points: [] as THREE.Vector3[], weldNodes: [] as THREE.Vector3[] };
    }
    const reference = transforms[referencePartId];
    const offsetX = reference?.position[0] ?? 0;
    const offsetZ = reference?.position[2] ?? 0;

    const points = buildWorkpieceOutline(config, transforms, FORGE_DRAW_PLANE_Y).map(
      (p) => new THREE.Vector3(p.x - offsetX, FORGE_DRAW_PLANE_Y, p.z - offsetZ)
    );
    const weldNodes = localPointsToWorld(config.seam, reference).map(
      (p) => new THREE.Vector3(p.x - offsetX, FORGE_WORKPIECE_TOP_Y, p.z - offsetZ)
    );
    return { points, weldNodes };
  }, [config, transforms, referencePartId, phase]);

  const handleWeldComplete = useCallback(
    (report: WeldQualityReport) => {
      setWeldReport(report);
      const passed =
        report.totalBeads >= config.evaluation.minBeadCount &&
        report.goodPercentage >= config.evaluation.minGoodWeldPercentage;

      if (passed) {
        setPhase('evaluation');
        showDialogue({ lines: config.script.success ?? [], hostile: false, next: 'success' });
      } else if (report.totalBeads < config.evaluation.minBeadCount) {
        triggerBanter('noWeld');
      } else {
        setPhase('evaluation');
        triggerBanter('badWeld', true);
      }
    },
    [config, triggerBanter, showDialogue]
  );

  // A failed weld that didn't cost the last hard hat sends the player back to the torch.
  useEffect(() => {
    if (phase === 'evaluation' && !dialogue && hp > 0) setPhase('execution');
  }, [phase, dialogue, hp]);

  const workbenchMode: WorkbenchMode =
    phase === 'tacking' ? 'tacking' : phase === 'grinding' ? 'grinding' : 'assembly';

  const hud = <HardHatBar current={hp} max={config.maxHp} />;

  const instructions =
    phase === 'assembly'
      ? 'Arrange both pieces to match the expected joint, then submit the assembly.'
      : phase === 'tacking'
        ? `Click each corner hitbox to lay a tack (${tackedIds.length}/${config.tackPoints.length}).`
        : phase === 'grinding'
          ? `Drag the grinder along the seam to prep it (${Math.round(grindProgress * 100)}%).`
          : undefined;

  const footer =
    phase === 'tacking' ? (
      <button
        onClick={handleFinishTacking}
        className="px-4 py-2 rounded-lg text-xs font-mono bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
      >
        Strike the Main Weld
      </button>
    ) : phase === 'grinding' ? (
      <div className="space-y-2">
        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all"
            style={{ width: `${Math.round(grindProgress * 100)}%` }}
          />
        </div>
        <button
          onClick={handleFinishGrinding}
          className="px-4 py-2 rounded-lg text-xs font-mono bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30"
        >
          Prep Complete
        </button>
      </div>
    ) : undefined;

  const showWorkbench =
    phase === 'intro' || phase === 'assembly' || phase === 'tacking' || phase === 'grinding';

  return (
    <div
      className="relative flex flex-col flex-1 w-full h-full bg-[#0a0a0f] text-white"
      style={shake ? { animation: 'level-shake 0.45s ease-in-out' } : undefined}
    >
      <style>{`@keyframes level-shake {
        0%, 100% { transform: translate3d(0, 0, 0); }
        20% { transform: translate3d(-10px, 4px, 0); }
        40% { transform: translate3d(9px, -5px, 0); }
        60% { transform: translate3d(-7px, 3px, 0); }
        80% { transform: translate3d(5px, -2px, 0); }
      }`}</style>

      {showWorkbench && (
        <AssemblyWorkbench
          key={`workbench-${runId}`}
          levelId={levelId}
          mode={workbenchMode}
          onBack={onExit}
          onAligned={handleAligned}
          onMisaligned={handleMisaligned}
          tackedIds={tackedIds}
          onTack={handleTack}
          grindSamples={grindSamples}
          groundSampleIndices={groundSamples}
          onGrindSample={handleGrindSample}
          onTransformsChange={setTransforms}
          hudRight={hud}
          instructions={instructions}
          footer={footer}
        />
      )}

      {(phase === 'execution' || phase === 'evaluation') && (
        <div className="relative flex flex-col flex-1">
          <FabricationForge
            key={`forge-${runId}`}
            initialPhase="execute"
            initialPoints={forgeGeometry.points}
            initialWeldNodes={forgeGeometry.weldNodes}
            hideStageControls
            onWeldComplete={handleWeldComplete}
            onBack={onExit}
          />
          <div className="absolute top-16 right-3 z-40">{hud}</div>
        </div>
      )}

      {phase === 'success' && (
        <div className="absolute inset-0 z-50 bg-[#0a0a0f]/95 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <Trophy size={44} className="text-amber-400" />
          <h2 className="text-2xl font-bold">{config.title} — Complete</h2>
          {weldReport && (
            <p className="text-sm font-mono text-slate-400">
              {Math.round(weldReport.goodPercentage * 100)}% clean bead ·{' '}
              {weldReport.goodBeads}/{weldReport.totalBeads} samples · hard hats left: {hp}/
              {config.maxHp}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={restartLevel}
              className="px-4 py-2 rounded-lg text-xs font-mono bg-slate-900 border border-slate-700 hover:bg-slate-800 flex items-center gap-1.5"
            >
              <RotateCcw size={13} /> Replay Level
            </button>
            {onExit && (
              <button
                onClick={onExit}
                className="px-4 py-2 rounded-lg text-xs font-mono bg-slate-900 border border-slate-700 hover:bg-slate-800 flex items-center gap-1.5"
              >
                <ArrowLeft size={13} /> Robot Hub
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="absolute inset-0 z-50 bg-rose-950/90 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h2 className="text-2xl font-bold">Level Failed</h2>
          <p className="text-sm font-mono text-rose-200">
            Pops sent you back to the start of the job.
          </p>
          <div className="flex gap-2">
            <button
              onClick={restartLevel}
              className="px-4 py-2 rounded-lg text-xs font-mono bg-slate-950 border border-slate-700 hover:bg-slate-900 flex items-center gap-1.5"
            >
              <RotateCcw size={13} /> Restart Level
            </button>
            {onExit && (
              <button
                onClick={onExit}
                className="px-4 py-2 rounded-lg text-xs font-mono bg-slate-950 border border-slate-700 hover:bg-slate-900 flex items-center gap-1.5"
              >
                <ArrowLeft size={13} /> Robot Hub
              </button>
            )}
          </div>
        </div>
      )}

      {dialogue && (
        <DialogueBox
          key={dialogue.key}
          config={config}
          lines={dialogue.lines}
          hostile={dialogue.hostile}
          onComplete={dismissDialogue}
        />
      )}
    </div>
  );
}
