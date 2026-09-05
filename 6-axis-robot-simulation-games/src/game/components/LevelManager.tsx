import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowLeft, Bug, Flame, Hammer, RotateCcw, Wrench } from 'lucide-react';
import FabricationForge, {
  WeldCompletionReport,
} from '../../components/robot/FabricationForge';
import {
  clearOverride,
  evaluateAlignment,
  loadLevel,
  normalizeDeg,
  saveOverride,
  snapToTarget,
  toRelative,
  toWorld,
} from '../levelStore';
import {
  DialogueLine,
  LevelPhase,
  PartTransform,
  RelativeTargetConfig,
  Vec3,
} from '../types';
import DialogueBox from './DialogueBox';
import HardHatHUD from './HardHatHUD';
import DebugPanel from './DebugPanel';
import PartsWorkbench, { WorkbenchTackPoint } from './PartsWorkbench';

/** Top surface height of the fabrication sim workpiece (see FabricationForge). */
const FORGE_WORKPIECE_TOP_Y = 0.07;

export interface LevelManagerProps {
  levelId?: string;
  onBack?: () => void;
}

/**
 * Level 1 game loop: Intro -> Assembly -> Tacking -> Grinding -> Execution ->
 * Evaluation. All text, art, tolerances and pass/fail thresholds come from the
 * level JSON so levels can be authored and balanced without code edits.
 */
export function LevelManager({ levelId = 'level1', onBack }: LevelManagerProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const level = useMemo(() => loadLevel(levelId), [levelId, reloadKey]);

  const anchorPart = useMemo(
    () => level.parts.find((p) => p.anchor) || level.parts[0],
    [level]
  );
  const followerParts = useMemo(
    () => level.parts.filter((p) => p.id !== anchorPart.id),
    [level, anchorPart]
  );

  const spawnTransforms = useCallback((): Record<string, PartTransform> => {
    const map: Record<string, PartTransform> = {};
    level.parts.forEach((p) => {
      map[p.id] = {
        position: [...p.spawnPosition] as Vec3,
        rotationDeg: p.spawnRotationDeg ?? 0,
      };
    });
    return map;
  }, [level]);

  const [phase, setPhase] = useState<LevelPhase>('intro');
  const [hp, setHp] = useState(level.maxHp);
  const [transforms, setTransforms] = useState<Record<string, PartTransform>>(
    spawnTransforms
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    followerParts[0]?.id ?? null
  );
  const [debugMode, setDebugMode] = useState(false);
  const [targets, setTargets] = useState<RelativeTargetConfig[]>(level.targets);
  const [tackedIds, setTackedIds] = useState<string[]>([]);
  const [grindProgress, setGrindProgress] = useState(0);
  const [introIndex, setIntroIndex] = useState(0);
  const [banter, setBanter] = useState<{ line: DialogueLine; angry: boolean } | null>(
    null
  );
  const [shake, setShake] = useState(false);
  const [weldReport, setWeldReport] = useState<WeldCompletionReport | null>(null);
  const [passed, setPassed] = useState(false);
  const banterTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (banterTimer.current) window.clearTimeout(banterTimer.current);
    };
  }, []);

  const restartLevel = useCallback(() => {
    setPhase('intro');
    setHp(level.maxHp);
    setTransforms(spawnTransforms());
    setTackedIds([]);
    setGrindProgress(0);
    setIntroIndex(0);
    setBanter(null);
    setWeldReport(null);
    setPassed(false);
  }, [level.maxHp, spawnTransforms]);

  /**
   * Shows a line of Pops' banter. When `damaging` is true the player also loses a
   * hard hat and the screen shakes; running out ends the level.
   */
  const triggerBanter = useCallback(
    (lines: DialogueLine[], damaging: boolean) => {
      const line = lines[Math.floor(Math.random() * lines.length)];
      if (!line) return;
      setBanter({ line, angry: damaging });
      if (banterTimer.current) window.clearTimeout(banterTimer.current);
      banterTimer.current = window.setTimeout(() => setBanter(null), 5000);

      if (!damaging) return;
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
      setHp((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) {
          setPhase('failed');
          setBanter({ line: level.dialogue.levelFailed[0], angry: true });
        }
        return next;
      });
    },
    [level.dialogue.levelFailed]
  );

  // ---------------------------------------------------------------- alignment
  const anchorTransform = transforms[anchorPart.id];

  const alignment = useMemo(() => {
    return followerParts.map((part) => {
      const target = targets.find((t) => t.partId === part.id);
      const follower = transforms[part.id];
      if (!target || !follower || !anchorTransform) {
        return { partId: part.id, aligned: false, positionError: 0, rotationError: 0 };
      }
      return {
        partId: part.id,
        ...evaluateAlignment(anchorTransform, follower, target, level.tolerance),
      };
    });
  }, [followerParts, targets, transforms, anchorTransform, level.tolerance]);

  const allAligned = alignment.length > 0 && alignment.every((a) => a.aligned);

  const ghost = useMemo(() => {
    if (phase !== 'assembly' || debugMode || !anchorTransform) return null;
    const target = targets.find((t) => t.partId === followerParts[0]?.id);
    if (!target) return null;
    return { partId: target.partId, transform: snapToTarget(anchorTransform, target) };
  }, [phase, debugMode, anchorTransform, targets, followerParts]);

  // ------------------------------------------------------------------- world
  const tackPoints: WorkbenchTackPoint[] = useMemo(() => {
    if (!anchorTransform) return [];
    return level.tackPoints.map((tp) => ({
      id: tp.id,
      world: toWorld(anchorTransform, tp.local),
      radius: tp.radius ?? 0.06,
      done: tackedIds.includes(tp.id),
    }));
  }, [level.tackPoints, anchorTransform, tackedIds]);

  const weldPathWorld: Vec3[] = useMemo(() => {
    if (!anchorTransform) return [];
    return level.weldPathLocal.map((p) => toWorld(anchorTransform, p));
  }, [level.weldPathLocal, anchorTransform]);

  /** Workpiece outline handed to the fabrication sim (AABB of the tacked parts). */
  const forgePoints = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    level.parts.forEach((part) => {
      const t = transforms[part.id];
      if (!t) return;
      const hx = part.size[0] / 2;
      const hz = part.size[2] / 2;
      const rad = (t.rotationDeg * Math.PI) / 180;
      [
        [-hx, -hz],
        [hx, -hz],
        [hx, hz],
        [-hx, hz],
      ].forEach(([cx, cz]) => {
        xs.push(t.position[0] + cx * Math.cos(rad) + cz * Math.sin(rad));
        zs.push(t.position[2] - cx * Math.sin(rad) + cz * Math.cos(rad));
      });
    });
    if (xs.length === 0) return [];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return [
      new THREE.Vector3(minX, 0, minZ),
      new THREE.Vector3(maxX, 0, minZ),
      new THREE.Vector3(maxX, 0, maxZ),
      new THREE.Vector3(minX, 0, maxZ),
    ];
  }, [level.parts, transforms]);

  const forgeWeldNodes = useMemo(
    () =>
      weldPathWorld.map(
        (p) => new THREE.Vector3(p[0], FORGE_WORKPIECE_TOP_Y, p[2])
      ),
    [weldPathWorld]
  );

  // ----------------------------------------------------------------- actions
  const handleDrag = useCallback((id: string, position: Vec3) => {
    setTransforms((prev) => ({ ...prev, [id]: { ...prev[id], position } }));
  }, []);

  const handleRotate = useCallback(
    (delta: number) => {
      const id = selectedId;
      if (!id) return;
      setTransforms((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          rotationDeg: normalizeDeg(prev[id].rotationDeg + delta),
        },
      }));
    },
    [selectedId]
  );

  /** Debug tool: freeze the current arrangement as the level's expected state. */
  const handleSaveTargetState = useCallback(() => {
    if (!anchorTransform) return;
    const next = followerParts.map((part) => {
      const rel = toRelative(anchorTransform, transforms[part.id]);
      return { partId: part.id, offset: rel.offset, rotationDeg: rel.rotationDeg };
    });
    setTargets(next);
    saveOverride(levelId, next);
  }, [anchorTransform, followerParts, transforms, levelId]);

  const handleConfirmAssembly = useCallback(() => {
    if (!allAligned || !anchorTransform) {
      triggerBanter(level.dialogue.incorrectAssembly, true);
      return;
    }
    // Snap the joint exactly onto the authored state before tacking.
    setTransforms((prev) => {
      const next = { ...prev };
      targets.forEach((t) => {
        next[t.partId] = snapToTarget(anchorTransform, t);
      });
      return next;
    });
    setPhase('tacking');
  }, [allAligned, anchorTransform, targets, triggerBanter, level.dialogue]);

  const handleTack = useCallback((id: string) => {
    setTackedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const allTacked = tackedIds.length >= level.tackPoints.length;

  const handleStartGrinding = useCallback(() => {
    if (!allTacked) {
      triggerBanter(level.dialogue.missedTack, true);
      return;
    }
    setPhase('grinding');
  }, [allTacked, triggerBanter, level.dialogue]);

  const handleGrind = useCallback(
    (seconds: number) => {
      setGrindProgress((prev) =>
        Math.min(1, prev + seconds / Math.max(0.1, level.grinding.durationSeconds))
      );
    },
    [level.grinding.durationSeconds]
  );

  const handleStartExecution = useCallback(() => {
    if (!allTacked) {
      triggerBanter(level.dialogue.missedTack, true);
      return;
    }
    if (grindProgress < level.grinding.requiredProgress) {
      triggerBanter(level.dialogue.skippedGrind, true);
      return;
    }
    setPhase('execution');
  }, [allTacked, grindProgress, level.grinding.requiredProgress, triggerBanter, level.dialogue]);

  const handleWeldComplete = useCallback(
    (report: WeldCompletionReport) => {
      setWeldReport(report);
      const minBeads = level.metrics.minBeadCount ?? 0;
      const success =
        report.beadCount >= minBeads &&
        report.goodPercentage >= level.metrics.minGoodWeldPercentage;
      setPassed(success);
      setPhase('evaluation');
      if (success) {
        triggerBanter(level.dialogue.success, false);
      } else {
        triggerBanter(level.dialogue.badWeld, true);
      }
    },
    [level.metrics, level.dialogue, triggerBanter]
  );

  // ------------------------------------------------------------------ render
  const draggableIds = debugMode
    ? level.parts.map((p) => p.id)
    : phase === 'assembly'
      ? followerParts.map((p) => p.id)
      : [];

  const activeLine: DialogueLine | null =
    phase === 'intro' ? level.dialogue.intro[introIndex] ?? null : banter?.line ?? null;

  const selectedLabel =
    level.parts.find((p) => p.id === selectedId)?.label ?? 'None';

  return (
    <div
      className={`relative flex h-full w-full flex-1 flex-col bg-[#07090e] text-slate-100 ${
        shake ? 'animate-pulse' : ''
      }`}
      style={shake ? { transform: 'translate3d(2px, -2px, 0)' } : undefined}
    >
      {/* Top bar: back, title, hard hats, debug toggle */}
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-40 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
              title="Back to hub"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-950/85 px-3 py-1.5 text-xs font-bold">
            {level.title}
            <span className="ml-2 font-mono text-[10px] uppercase text-amber-400">
              {phase}
            </span>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <HardHatHUD hp={hp} maxHp={level.maxHp} />
          <button
            type="button"
            onClick={() => setDebugMode((d) => !d)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-wide ${
              debugMode
                ? 'border-fuchsia-500 bg-fuchsia-600/30 text-fuchsia-200'
                : 'border-slate-800 bg-slate-950/85 text-slate-300 hover:text-white'
            }`}
          >
            <Bug size={14} /> Debug
          </button>
        </div>
      </div>

      {/* Stage viewport */}
      <div className="relative flex-1">
        {phase === 'execution' ? (
          <FabricationForge
            onBack={onBack}
            initialPhase="execute"
            initialPoints={forgePoints}
            initialWeldNodes={forgeWeldNodes}
            hideStageControls
            onWeldComplete={handleWeldComplete}
          />
        ) : (
          <PartsWorkbench
            parts={level.parts}
            transforms={transforms}
            draggableIds={draggableIds}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDrag={handleDrag}
            tackPoints={phase === 'tacking' ? tackPoints : []}
            onTack={handleTack}
            weldPath={
              phase === 'tacking' || phase === 'grinding' ? weldPathWorld : []
            }
            ghost={ghost}
            grinding={phase === 'grinding'}
            onGrind={handleGrind}
            aligned={allAligned && phase !== 'assembly'}
          />
        )}
      </div>

      {/* Debug authoring panel */}
      {debugMode && phase !== 'execution' && (
        <div className="absolute right-2 top-16 z-40">
          <DebugPanel
            levelId={levelId}
            targets={targets}
            tolerance={level.tolerance}
            selectedLabel={selectedLabel}
            onRotate={handleRotate}
            onSaveTargetState={handleSaveTargetState}
            onResetParts={() => setTransforms(spawnTransforms())}
            onClearOverride={() => {
              clearOverride(levelId);
              setReloadKey((k) => k + 1);
              setTargets(loadLevel(levelId).targets);
            }}
          />
        </div>
      )}

      {/* Bottom stage controls & dialogue */}
      <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-40 flex flex-col items-center gap-3 px-3">
        {activeLine && (
          <DialogueBox
            line={activeLine}
            portraits={level.portraits}
            angry={banter?.angry && phase !== 'intro'}
            onAdvance={
              phase === 'intro'
                ? () => {
                    if (introIndex + 1 < level.dialogue.intro.length) {
                      setIntroIndex(introIndex + 1);
                    } else {
                      setPhase('assembly');
                      if (level.dialogue.assemblyHint) {
                        triggerBanter(level.dialogue.assemblyHint, false);
                      }
                    }
                  }
                : undefined
            }
            advanceLabel={
              introIndex + 1 < level.dialogue.intro.length ? 'Next' : "Let's work"
            }
          />
        )}

        {phase === 'assembly' && !debugMode && (
          <StageBar>
            <span className="text-[11px] text-slate-400">
              Drag the plate, rotate with the buttons, match the ghost outline.
            </span>
            <RotateButtons onRotate={handleRotate} />
            <ActionButton onClick={handleConfirmAssembly} icon={<Hammer size={14} />}>
              Ready to Tack
            </ActionButton>
          </StageBar>
        )}

        {phase === 'tacking' && (
          <StageBar>
            <span className="text-[11px] text-slate-400">
              Tacks: {tackedIds.length}/{level.tackPoints.length}
            </span>
            <ActionButton onClick={handleStartGrinding} icon={<Wrench size={14} />}>
              Grind the Joint
            </ActionButton>
            <ActionButton onClick={handleStartExecution} icon={<Flame size={14} />}>
              Strike an Arc
            </ActionButton>
          </StageBar>
        )}

        {phase === 'grinding' && (
          <StageBar>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Prep Progress</span>
              <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-cyan-400 transition-[width]"
                  style={{ width: `${Math.round(grindProgress * 100)}%` }}
                />
              </div>
              <span className="font-mono text-[11px] text-cyan-300">
                {Math.round(grindProgress * 100)}%
              </span>
            </div>
            <ActionButton onClick={handleStartExecution} icon={<Flame size={14} />}>
              Strike an Arc
            </ActionButton>
          </StageBar>
        )}

        {(phase === 'evaluation' || phase === 'failed') && (
          <StageBar>
            <span
              className={`text-xs font-bold uppercase tracking-widest ${
                phase === 'failed' || !passed ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {phase === 'failed'
                ? 'Level Failed'
                : passed
                  ? 'Level Complete'
                  : 'Weld Rejected'}
            </span>
            {weldReport && (
              <span className="font-mono text-[11px] text-slate-400">
                {Math.round(weldReport.goodPercentage * 100)}% good /{' '}
                {weldReport.beadCount} beads (need{' '}
                {Math.round(level.metrics.minGoodWeldPercentage * 100)}%)
              </span>
            )}
            <ActionButton onClick={restartLevel} icon={<RotateCcw size={14} />}>
              {passed ? 'Replay Level' : 'Restart Level'}
            </ActionButton>
          </StageBar>
        )}
      </div>
    </div>
  );
}

function StageBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-2.5 shadow-2xl backdrop-blur">
      {children}
    </div>
  );
}

function RotateButtons({ onRotate }: { onRotate: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[-45, -15, 15, 45].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onRotate(d)}
          className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold hover:bg-slate-700"
        >
          {d > 0 ? `+${d}°` : `${d}°`}
        </button>
      ))}
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-950 hover:bg-amber-400"
    >
      {icon}
      {children}
    </button>
  );
}

export default LevelManager;
