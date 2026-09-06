import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  Box,
  Bug,
  Flame,
  Hammer,
  Move3D,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import FabricationForge, {
  WeldCompletionReport,
} from '../../components/robot/FabricationForge';
import {
  DEFAULT_GRID,
  clearOverride,
  evaluateAlignment,
  loadLevel,
  rotate,
  saveTargetOverride,
  saveWeldPathOverride,
  snapPosition,
  snapRotation,
  snapToTarget,
  snapTransform,
  toEulerDegrees,
  toLocal,
  toRelative,
  toWorld,
  translate,
} from '../levelStore';
import {
  CameraPreset,
  DialogueLine,
  LevelPhase,
  PartTransform,
  RelativeTargetConfig,
  TransformSpace,
  Vec3,
} from '../types';
import DialogueBox from './DialogueBox';
import HardHatHUD from './HardHatHUD';
import DebugPanel from './DebugPanel';
import AssemblyControls from './AssemblyControls';
import PartsWorkbench, { WorkbenchTackPoint } from './PartsWorkbench';

/** Top surface height of the fabrication sim workpiece (see FabricationForge). */
const FORGE_WORKPIECE_TOP_Y = 0.07;

const CAMERA_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: 'iso', label: '3D' },
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
];

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
  // Discrete unit grid every transform snaps to, data-driven per level.
  const grid = useMemo(() => level.grid ?? DEFAULT_GRID, [level]);

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
      // Spawn on the grid so parts start on whole unit values.
      map[p.id] = snapTransform(
        {
          position: [...p.spawnPosition] as Vec3,
          rotation: toEulerDegrees(p.spawnRotationDeg),
        },
        grid
      );
    });
    return map;
  }, [level, grid]);

  const [phase, setPhase] = useState<LevelPhase>('intro');
  const [hp, setHp] = useState(level.maxHp);
  const [transforms, setTransforms] = useState<Record<string, PartTransform>>(
    spawnTransforms
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    followerParts[0]?.id ?? null
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');
  const [space, setSpace] = useState<TransformSpace>('world');
  const [moveStepCm, setMoveStepCm] = useState(10);
  const [rotateStepDeg, setRotateStepDeg] = useState(10);
  const [debugMode, setDebugMode] = useState(false);
  // Reference-marker presentation, tunable from the debug panel and hideable by
  // the player once they no longer need the axis hints.
  const [showGizmo, setShowGizmo] = useState(true);
  const [gizmoScale, setGizmoScale] = useState(0.5);
  // Weld-node authoring aids: edge snapping can be turned off entirely, and the
  // radius controls how close a click must be to an edge before it is pulled in.
  const [edgeSnap, setEdgeSnap] = useState(true);
  const [edgeSnapCm, setEdgeSnapCm] = useState(8);
  const [weldAuthoring, setWeldAuthoring] = useState(false);
  const [targets, setTargets] = useState<RelativeTargetConfig[]>(level.targets);
  const [weldPathLocal, setWeldPathLocal] = useState<Vec3[]>(level.weldPathLocal);
  const [tackedIds, setTackedIds] = useState<string[]>([]);
  const [grindProgress, setGrindProgress] = useState(0);
  const [introIndex, setIntroIndex] = useState(0);
  const [banter, setBanter] = useState<{ line: DialogueLine; angry: boolean } | null>(
    null
  );
  const [shake, setShake] = useState(false);
  const [weldReport, setWeldReport] = useState<WeldCompletionReport | null>(null);
  const [passed, setPassed] = useState(false);

  // Surface *why* a weld was rejected: report the dominant defect health so the
  // player knows which direction to move the voltage / wire-feed / travel dials.
  const weldFaultLabel = useMemo(() => {
    if (!weldReport) return '';
    const faults = Object.entries(weldReport.healthBreakdown).filter(
      ([health]) => health !== 'perfect',
    );
    if (faults.length === 0) return '';
    const [worst] = faults.sort((a, b) => b[1] - a[1]);
    const labels: Record<string, string> = {
      too_hot: 'mostly too hot — lower voltage/WFS or speed up',
      too_cold: 'mostly too cold — raise voltage/WFS or slow down',
    };
    return labels[worst[0]] ?? `mostly ${worst[0]}`;
  }, [weldReport]);
  const banterTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (banterTimer.current) window.clearTimeout(banterTimer.current);
    };
  }, []);

  // Re-seed local authoring state whenever the level config is (re)loaded.
  useEffect(() => {
    setTargets(level.targets);
    setWeldPathLocal(level.weldPathLocal);
  }, [level]);

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
    setCameraPreset('iso');
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
    return {
      partId: target.partId,
      transform: snapToTarget(anchorTransform, target, grid),
    };
  }, [phase, debugMode, anchorTransform, targets, followerParts, grid]);

  // ------------------------------------------------------------------- world
  const tackPoints: WorkbenchTackPoint[] = useMemo(() => {
    if (!anchorTransform) return [];
    // Tacks live at the ends of the seam. Deriving them from the authored weld
    // path keeps tacking, grinding and welding on the joint the designer
    // actually placed in the debug tool, instead of stale JSON coordinates.
    const radius = level.tackPoints[0]?.radius ?? 0.06;
    const locals: { id: string; local: Vec3 }[] =
      weldPathLocal.length >= 2
        ? [
            { id: 'tack_start', local: weldPathLocal[0] },
            { id: 'tack_end', local: weldPathLocal[weldPathLocal.length - 1] },
          ]
        : level.tackPoints.map((tp) => ({ id: tp.id, local: tp.local }));

    return locals.map((tp) => ({
      id: tp.id,
      world: toWorld(anchorTransform, tp.local),
      radius,
      done: tackedIds.includes(tp.id),
    }));
  }, [level.tackPoints, weldPathLocal, anchorTransform, tackedIds]);

  const weldPathWorld: Vec3[] = useMemo(() => {
    if (!anchorTransform) return [];
    return weldPathLocal.map((p) => toWorld(anchorTransform, p));
  }, [weldPathLocal, anchorTransform]);

  /** Workpiece outline handed to the fabrication sim (AABB of the tacked parts). */
  const forgePoints = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    level.parts.forEach((part) => {
      const t = transforms[part.id];
      if (!t) return;
      const half = new THREE.Vector3(part.size[0] / 2, part.size[1] / 2, part.size[2] / 2);
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(t.rotation[0]),
          THREE.MathUtils.degToRad(t.rotation[1]),
          THREE.MathUtils.degToRad(t.rotation[2]),
          'XYZ'
        )
      );
      [-1, 1].forEach((sx) =>
        [-1, 1].forEach((sy) =>
          [-1, 1].forEach((sz) => {
            const corner = new THREE.Vector3(half.x * sx, half.y * sy, half.z * sz)
              .applyQuaternion(quat)
              .add(new THREE.Vector3(...t.position));
            xs.push(corner.x);
            zs.push(corner.z);
          })
        )
      );
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
      // Keep the authored seam height so the sim welds the same joint the
      // player just ground, rather than a flat guess.
      weldPathWorld.map(
        (p) => new THREE.Vector3(p[0], p[1] || FORGE_WORKPIECE_TOP_Y, p[2])
      ),
    [weldPathWorld]
  );

  // ----------------------------------------------------------------- actions
  const handleDrag = useCallback((id: string, position: Vec3) => {
    setTransforms((prev) => ({ ...prev, [id]: { ...prev[id], position } }));
  }, []);

  /** Nudge in whole centimetres along a world or part-local axis. */
  const handleNudge = useCallback(
    (axis: 0 | 1 | 2, cm: number) => {
      const id = selectedId;
      if (!id) return;
      setTransforms((prev) => ({
        ...prev,
        // Snap to the step the player chose, not the level grid: a 1cm nudge
        // against a 5cm grid used to round straight back to where it started.
        [id]: translate(prev[id], axis, cm / 100, space, {
          ...grid,
          unitCm: Math.abs(cm) || grid.unitCm,
        }),
      }));
    },
    [selectedId, space, grid]
  );

  /** Rotate by whole degrees about a world or part-local axis. */
  const handleRotate = useCallback(
    (axis: 0 | 1 | 2, deg: number) => {
      const id = selectedId;
      if (!id) return;
      setTransforms((prev) => ({
        ...prev,
        [id]: rotate(prev[id], axis, deg, space, {
          ...grid,
          rotationDeg: Math.abs(deg) || grid.rotationDeg,
        }),
      }));
    },
    [selectedId, space, grid]
  );

  /** Debug tool: freeze the current arrangement as the level's expected state. */
  const handleSaveTargetState = useCallback(() => {
    if (!anchorTransform) return;
    const next = followerParts.map((part) => {
      const rel = toRelative(anchorTransform, transforms[part.id]);
      // Store the target on the grid so authored levels only ever contain
      // whole unit values, and the ghost lands exactly where a part can go.
      return {
        partId: part.id,
        offset: snapPosition(rel.offset, grid),
        rotationDeg: snapRotation(rel.rotationDeg, grid),
      };
    });
    setTargets(next);
    saveTargetOverride(levelId, next);
  }, [anchorTransform, followerParts, transforms, levelId, grid]);

  /** Debug tool: drop a weld node where the designer clicked on a part. */
  const handleAuthorWeldNode = useCallback(
    (world: Vec3) => {
      if (!anchorTransform) return;
      setWeldPathLocal((prev) => [...prev, toLocal(anchorTransform, world)]);
    },
    [anchorTransform]
  );

  const handleConfirmAssembly = useCallback(() => {
    if (!allAligned || !anchorTransform) {
      triggerBanter(level.dialogue.incorrectAssembly, true);
      return;
    }
    // Snap the joint exactly onto the authored state before tacking.
    setTransforms((prev) => {
      const next = { ...prev };
      targets.forEach((t) => {
        next[t.partId] = snapToTarget(anchorTransform, t, grid);
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
  }, [
    allTacked,
    grindProgress,
    level.grinding.requiredProgress,
    triggerBanter,
    level.dialogue,
  ]);

  const handleWeldComplete = useCallback(
    (report: WeldCompletionReport) => {
      setWeldReport(report);
      const minBeads = level.metrics.minBeadCount ?? 0;
      const success =
        report.beadCount >= minBeads &&
        report.goodPercentage >= level.metrics.minGoodWeldPercentage;
      setPassed(success);
      setPhase('evaluation');
      triggerBanter(
        success ? level.dialogue.success : level.dialogue.badWeld,
        !success
      );
    },
    [level.metrics, level.dialogue, triggerBanter]
  );

  // ------------------------------------------------------------------ render
  const draggableIds = debugMode
    ? level.parts.map((p) => p.id)
    : phase === 'assembly'
      ? followerParts.map((p) => p.id)
      : [];

  const showControlPad = debugMode || phase === 'assembly';

  const activeLine: DialogueLine | null =
    phase === 'intro' ? level.dialogue.intro[introIndex] ?? null : banter?.line ?? null;

  const selectedTransform = selectedId ? transforms[selectedId] : null;
  // Per-axis values, kept split so the control pad can colour each one to match
  // its axis (X red, Y green, Z blue) instead of showing one grey blob.
  const readout = selectedTransform
    ? {
        position: selectedTransform.position.map((v) => `${Math.round(v * 100)}`) as [
          string,
          string,
          string,
        ],
        rotation: selectedTransform.rotation.map((v) => `${Math.round(v)}°`) as [
          string,
          string,
          string,
        ],
      }
    : undefined;

  return (
    <div
      className={`relative flex h-full w-full flex-1 flex-col overflow-hidden bg-[#07090e] text-slate-100`}
      style={shake ? { transform: 'translate3d(3px, -3px, 0)' } : undefined}
    >
      {/* ---------------------------------------------------------- top bar */}
      <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-2 py-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to hub"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft size={15} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold leading-tight">
            {level.title}
          </div>
          <div className="font-mono text-[10px] uppercase leading-tight text-amber-400">
            {phase}
          </div>
        </div>

        {/* Camera preset buttons */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-900 p-0.5">
          {CAMERA_BUTTONS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCameraPreset(c.id)}
              className={`min-h-[30px] rounded-md px-2 text-[10px] font-bold transition-colors ${
                cameraPreset === c.id
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Player-facing toggle for the axis reference marker. */}
        {showControlPad && (
          <button
            type="button"
            onClick={() => setShowGizmo((v) => !v)}
            aria-pressed={showGizmo}
            title={showGizmo ? 'Hide axis marker' : 'Show axis marker'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              showGizmo
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Move3D size={15} />
          </button>
        )}

        <HardHatHUD hp={hp} maxHp={level.maxHp} />

        <button
          type="button"
          onClick={() => setDebugMode((d) => !d)}
          aria-label="Toggle debug mode"
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-bold uppercase ${
            debugMode
              ? 'border-fuchsia-500 bg-fuchsia-600/30 text-fuchsia-200'
              : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
          }`}
        >
          <Bug size={13} />
          <span className="hidden sm:inline">Debug</span>
        </button>
      </div>

      {/* -------------------------------------------------------- viewport */}
      <div className="relative min-h-0 flex-1">
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
            cameraPreset={cameraPreset}
            tackPoints={phase === 'tacking' ? tackPoints : []}
            onTack={handleTack}
            weldPath={
              phase === 'tacking' || phase === 'grinding' || weldAuthoring
                ? weldPathWorld
                : []
            }
            ghost={ghost}
            grinding={phase === 'grinding'}
            onGrind={handleGrind}
            grindProgress={grindProgress}
            aligned={allAligned && phase !== 'assembly'}
            weldAuthoring={debugMode && weldAuthoring}
            onAuthorWeldNode={handleAuthorWeldNode}
            grid={grid}
            space={space}
            showGizmo={showGizmo}
            gizmoScale={gizmoScale}
            edgeSnap={edgeSnap}
            edgeSnapCm={edgeSnapCm}
          />
        )}

        {/* Floating dialogue sits above the viewport, clear of the docks. */}
        {activeLine && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-2">
            <DialogueBox
              line={activeLine}
              portraits={level.portraits}
              angry={Boolean(banter?.angry) && phase !== 'intro'}
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
          </div>
        )}

        {/* Debug authoring panel floats over the viewport, below the top bar. */}
        {debugMode && phase !== 'execution' && (
          <div className="absolute right-2 top-2 z-30">
            <DebugPanel
              levelId={levelId}
              targets={targets}
              tolerance={level.tolerance}
              weldPathLocal={weldPathLocal}
              weldAuthoring={weldAuthoring}
              gizmoScale={gizmoScale}
              onGizmoScaleChange={setGizmoScale}
              showGizmo={showGizmo}
              onToggleGizmo={() => setShowGizmo((v) => !v)}
              edgeSnap={edgeSnap}
              onToggleEdgeSnap={() => setEdgeSnap((v) => !v)}
              edgeSnapCm={edgeSnapCm}
              onEdgeSnapCmChange={setEdgeSnapCm}
              onToggleWeldAuthoring={() => setWeldAuthoring((w) => !w)}
              onUndoWeldNode={() => setWeldPathLocal((p) => p.slice(0, -1))}
              onClearWeldPath={() => setWeldPathLocal([])}
              onSaveTargetState={handleSaveTargetState}
              onSaveWeldPath={() => saveWeldPathOverride(levelId, weldPathLocal)}
              onResetParts={() => setTransforms(spawnTransforms())}
              onClearOverride={() => {
                clearOverride(levelId);
                setReloadKey((k) => k + 1);
              }}
              onClose={() => setDebugMode(false)}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------ bottom dock */}
      {phase !== 'execution' && (
        <div className="relative z-30 shrink-0 space-y-2 border-t border-slate-800 bg-slate-950/95 p-2">
          {showControlPad && (
            <AssemblyControls
              parts={debugMode ? level.parts : followerParts}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNudge={handleNudge}
              onRotate={handleRotate}
              space={space}
              onSpaceChange={setSpace}
              moveStepCm={moveStepCm}
              onMoveStepChange={setMoveStepCm}
              rotateStepDeg={rotateStepDeg}
              onRotateStepChange={setRotateStepDeg}
              readout={readout}
            />
          )}

          {phase === 'assembly' && (
            <StageBar>
              <AlignmentReadout
                aligned={allAligned}
                error={alignment[0]}
                tolerance={level.tolerance}
              />
              <ActionButton onClick={handleConfirmAssembly} icon={<Hammer size={14} />}>
                Ready to Tack
              </ActionButton>
            </StageBar>
          )}

          {phase === 'tacking' && (
            <StageBar>
              <span className="text-[11px] text-slate-400">
                Tap the glowing corners · Tacks {tackedIds.length}/
                {level.tackPoints.length}
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
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[11px] text-slate-400">Prep</span>
                <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-800 sm:w-40">
                  <div
                    className="h-full bg-cyan-400 transition-[width]"
                    style={{ width: `${Math.round(grindProgress * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-[11px] text-cyan-300">
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
                  {weldFaultLabel && ` · ${weldFaultLabel}`}
                </span>
              )}
              <ActionButton onClick={restartLevel} icon={<RotateCcw size={14} />}>
                {passed ? 'Replay' : 'Restart'}
              </ActionButton>
            </StageBar>
          )}
        </div>
      )}
    </div>
  );
}

function AlignmentReadout({
  aligned,
  error,
  tolerance,
}: {
  aligned: boolean;
  error?: { positionError: number; rotationError: number };
  tolerance: { position: number; rotationDeg: number };
}) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <Box size={13} className={aligned ? 'text-emerald-400' : 'text-slate-500'} />
      <span className={aligned ? 'text-emerald-400' : 'text-slate-400'}>
        off {Math.round(error.positionError * 100)}cm /{' '}
        {Math.round(error.rotationError)}°
      </span>
      <span className="hidden text-slate-600 sm:inline">
        (need ≤{Math.round(tolerance.position * 100)}cm / {tolerance.rotationDeg}°)
      </span>
    </div>
  );
}

function StageBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 sm:gap-3">
      {children}
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
      className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-xs font-bold uppercase tracking-wide text-slate-950 hover:bg-amber-400 active:bg-amber-300"
    >
      {icon}
      {children}
    </button>
  );
}

export default LevelManager;
