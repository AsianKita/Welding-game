import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  ArrowLeft,
  Bug,
  Check,
  ClipboardCopy,
  Eye,
  EyeOff,
  Magnet,
  RotateCcw,
  Ruler,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import PlaceholderPart from './PlaceholderPart';
import { evaluateAlignment } from '../alignment';
import {
  clearTargetState,
  getLevelConfig,
  loadTargetState,
  parseTargetState,
  saveTargetState,
  serializeTargetState,
} from '../levelStore';
import type { AlignmentResult, AlignmentTolerance, TargetState, TransformData } from '../types';

const DEG = 180 / Math.PI;
const ROTATION_STEP_DEG = 15;

interface AssemblyWorkbenchProps {
  levelId?: string;
  onBack?: () => void;
  /** Fired when the arrangement matches the authored target (drives State 1 -> State 2 later). */
  onAligned?: (result: AlignmentResult) => void;
  /** Fired when the player submits a wrong arrangement (drives TriggerBanter + HP loss later). */
  onMisaligned?: (result: AlignmentResult) => void;
}

function spawnTransforms(levelId: string): Record<string, TransformData> {
  const config = getLevelConfig(levelId);
  const map: Record<string, TransformData> = {};
  config.parts.forEach((part) => {
    map[part.id] = {
      position: [...part.spawn.position] as [number, number, number],
      rotation: [...part.spawn.rotation] as [number, number, number],
    };
  });
  return map;
}

/**
 * Assembly workbench + level-authoring Debug Tool.
 *
 * Play Mode: drag/rotate the placeholder parts and submit them for validation
 * against the saved "Expected Orientation".
 * Debug Mode: arrange the parts freely and press "Save Target State" to record
 * that arrangement as the expected orientation for the level.
 */
export default function AssemblyWorkbench({
  levelId = 'level_1',
  onBack,
  onAligned,
  onMisaligned,
}: AssemblyWorkbenchProps) {
  const config = useMemo(() => getLevelConfig(levelId), [levelId]);

  const [transforms, setTransforms] = useState<Record<string, TransformData>>(() =>
    spawnTransforms(levelId)
  );
  const [selectedPartId, setSelectedPartId] = useState<string>(config.parts[0]?.id ?? '');
  const [debugMode, setDebugMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [tolerance, setTolerance] = useState<AlignmentTolerance>(config.tolerance);
  const [targetState, setTargetState] = useState<TargetState | null>(() => loadTargetState(levelId));
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [status, setStatus] = useState<string>('');
  const [importText, setImportText] = useState<string>('');
  const [showImport, setShowImport] = useState(false);

  const statusTimer = useRef<number | null>(null);

  const flashStatus = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(''), 3200);
  }, []);

  useEffect(
    () => () => {
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
    },
    []
  );

  useEffect(() => {
    setTransforms(spawnTransforms(levelId));
    setTargetState(loadTargetState(levelId));
    setTolerance(getLevelConfig(levelId).tolerance);
    setResult(null);
  }, [levelId]);

  const handleDrag = useCallback((partId: string, position: [number, number, number]) => {
    setTransforms((prev) => ({ ...prev, [partId]: { ...prev[partId], position } }));
  }, []);

  const setAxis = useCallback(
    (partId: string, kind: 'position' | 'rotation', axis: 0 | 1 | 2, value: number) => {
      if (!Number.isFinite(value)) return;
      setTransforms((prev) => {
        const current = prev[partId];
        if (!current) return prev;
        const next = [...current[kind]] as [number, number, number];
        next[axis] = value;
        return { ...prev, [partId]: { ...current, [kind]: next } };
      });
    },
    []
  );

  const nudgeRotation = useCallback(
    (axis: 0 | 1 | 2, deltaDeg: number) => {
      setTransforms((prev) => {
        const current = prev[selectedPartId];
        if (!current) return prev;
        const next = [...current.rotation] as [number, number, number];
        next[axis] += deltaDeg / DEG;
        return { ...prev, [selectedPartId]: { ...current, rotation: next } };
      });
    },
    [selectedPartId]
  );

  const nudgeHeight = useCallback(
    (delta: number) => {
      setTransforms((prev) => {
        const current = prev[selectedPartId];
        if (!current) return prev;
        const next = [...current.position] as [number, number, number];
        next[1] = Number((next[1] + delta).toFixed(4));
        return { ...prev, [selectedPartId]: { ...current, position: next } };
      });
    },
    [selectedPartId]
  );

  // Keyboard: `~` toggles Debug Mode, Q/E yaw, R/F pitch, Z/X roll, PageUp/Down height.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === '`' || key === '~') {
        setDebugMode((d) => !d);
        return;
      }
      const step = e.shiftKey ? ROTATION_STEP_DEG / 3 : ROTATION_STEP_DEG;
      if (key === 'q') nudgeRotation(1, -step);
      else if (key === 'e') nudgeRotation(1, step);
      else if (key === 'r') nudgeRotation(0, -step);
      else if (key === 'f') nudgeRotation(0, step);
      else if (key === 'z') nudgeRotation(2, -step);
      else if (key === 'x') nudgeRotation(2, step);
      else if (e.key === 'PageUp') nudgeHeight(0.02);
      else if (e.key === 'PageDown') nudgeHeight(-0.02);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nudgeRotation, nudgeHeight]);

  const handleSaveTargetState = () => {
    const next: TargetState = {
      levelId,
      parts: Object.fromEntries(
        Object.entries(transforms).map(([id, t]) => [
          id,
          {
            position: t.position.map((n) => Number(n.toFixed(4))) as [number, number, number],
            rotation: t.rotation.map((n) => Number(n.toFixed(6))) as [number, number, number],
          },
        ])
      ),
      note: targetState?.note,
    };
    if (saveTargetState(next)) {
      setTargetState({ ...next, savedAt: new Date().toISOString() });
      flashStatus('Target state saved as the expected orientation for this level.');
    } else {
      flashStatus('Could not save target state (storage unavailable).');
    }
  };

  const handleClearOverride = () => {
    clearTargetState(levelId);
    setTargetState(loadTargetState(levelId));
    flashStatus('Local override cleared — level JSON default restored.');
  };

  const handleCopyJson = async () => {
    if (!targetState) return;
    const json = serializeTargetState(targetState);
    try {
      await navigator.clipboard.writeText(json);
      flashStatus('Target state JSON copied — paste it into level1.json.');
    } catch {
      console.log(json);
      flashStatus('Clipboard blocked — JSON logged to the console instead.');
    }
  };

  const handleImport = () => {
    try {
      const parsed = parseTargetState(JSON.parse(importText), levelId);
      if (!parsed) {
        flashStatus('Import failed: not a valid target state.');
        return;
      }
      saveTargetState(parsed);
      setTargetState(parsed);
      setImportText('');
      setShowImport(false);
      flashStatus('Target state imported.');
    } catch {
      flashStatus('Import failed: invalid JSON.');
    }
  };

  const handleLoadTargetIntoScene = () => {
    if (!targetState) return;
    setTransforms((prev) => {
      const next = { ...prev };
      Object.entries(targetState.parts).forEach(([id, t]) => {
        if (next[id]) {
          next[id] = {
            position: [...t.position] as [number, number, number],
            rotation: [...t.rotation] as [number, number, number],
          };
        }
      });
      return next;
    });
    flashStatus('Loaded saved target state into the scene.');
  };

  const handleResetParts = () => {
    setTransforms(spawnTransforms(levelId));
    setResult(null);
    flashStatus('Parts returned to their spawn transforms.');
  };

  const handleCheckAlignment = () => {
    const evaluation = evaluateAlignment(transforms, targetState, tolerance);
    setResult(evaluation);
    if (evaluation.aligned) {
      flashStatus('Alignment accepted.');
      onAligned?.(evaluation);
    } else {
      flashStatus('Alignment rejected.');
      onMisaligned?.(evaluation);
    }
  };

  const liveResult = useMemo(
    () => evaluateAlignment(transforms, targetState, tolerance),
    [transforms, targetState, tolerance]
  );

  const selectedTransform = transforms[selectedPartId];

  return (
    <div className="relative flex flex-col flex-1 w-full h-full bg-[#0a0a0f] text-white">
      <div className="relative flex-1 min-h-[320px]">
        <Canvas
          shadows
          camera={{ position: [2.6, 2.1, 3.2], fov: 45 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          className="touch-none"
        >
          <ambientLight intensity={0.35} />
          <directionalLight position={[4, 6, 3]} intensity={1.5} castShadow />
          <pointLight position={[-3, 3, -2]} intensity={0.45} color="#38bdf8" />

          {/* Workbench surface */}
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[6, 4]} />
            <meshStandardMaterial color="#111827" roughness={0.9} metalness={0.1} />
          </mesh>
          <gridHelper args={[6, 24, '#334155', '#1e293b']} position={[0, 0.002, 0]} />
          <ContactShadows position={[0, 0.004, 0]} opacity={0.5} scale={8} blur={2.2} far={3} />

          {/* Ghost preview of the authored expected orientation */}
          {showGhost &&
            targetState &&
            config.parts.map((part) =>
              targetState.parts[part.id] ? (
                <PlaceholderPart
                  key={`ghost-${part.id}`}
                  definition={part}
                  transform={targetState.parts[part.id]}
                  selected={false}
                  draggable={false}
                  ghost
                  onSelect={() => undefined}
                  onDrag={() => undefined}
                  onDragStateChange={() => undefined}
                />
              ) : null
            )}

          {config.parts.map((part) => (
            <PlaceholderPart
              key={part.id}
              definition={part}
              transform={transforms[part.id]}
              selected={selectedPartId === part.id}
              draggable
              snapStep={snapEnabled ? 0.05 : 0}
              onSelect={setSelectedPartId}
              onDrag={handleDrag}
              onDragStateChange={setIsDragging}
            />
          ))}

          <OrbitControls
            enabled={!isDragging}
            enablePan={false}
            minDistance={1.6}
            maxDistance={8}
            maxPolarAngle={Math.PI / 2.1}
            enableDamping
            dampingFactor={0.06}
          />
          <Environment preset="warehouse" />
        </Canvas>

        {/* Header */}
        <header className="absolute top-2 left-2 right-2 z-40 flex items-start justify-between pointer-events-none gap-2">
          <div className="pointer-events-auto flex items-center gap-1 bg-slate-950/85 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-900 transition-all"
              >
                <ArrowLeft size={13} /> Back
              </button>
            )}
            <span className="px-2 text-xs font-mono text-slate-400">{config.title}</span>
          </div>

          <button
            onClick={() => setDebugMode((d) => !d)}
            title="Toggle Debug Mode (`)"
            className={`pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono border transition-all ${
              debugMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-950/85 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <Bug size={13} /> {debugMode ? 'Debug Mode: ON' : 'Debug Mode: OFF'}
          </button>
        </header>

        {status && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-slate-950/90 border border-slate-700 text-xs font-mono text-slate-200 shadow-xl">
            {status}
          </div>
        )}
      </div>

      {/* Control dock */}
      <div className="w-full max-h-[46vh] overflow-y-auto bg-slate-950/95 border-t border-slate-800 p-3 space-y-3">
        {/* Part selector + transform readout */}
        <div className="flex flex-wrap items-center gap-2">
          {config.parts.map((part) => {
            const partResult = liveResult.parts.find((p) => p.partId === part.id);
            return (
              <button
                key={part.id}
                onClick={() => setSelectedPartId(part.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                  selectedPartId === part.id
                    ? 'bg-orange-500/20 text-orange-300 border-orange-500/50'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {part.label}
                {!debugMode && partResult && (
                  <span className={partResult.aligned ? ' text-emerald-400' : ' text-slate-500'}>
                    {partResult.aligned ? ' ✓' : ' ·'}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setSnapEnabled((s) => !s)}
            title="Snap drag positions to a 5 cm grid"
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all flex items-center gap-1.5 ${
              snapEnabled
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <Magnet size={12} /> Grid Snap
          </button>
          <button
            onClick={() => setShowGhost((g) => !g)}
            title="Show the saved expected orientation as a wireframe ghost"
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all flex items-center gap-1.5 ${
              showGhost
                ? 'bg-slate-800 text-slate-200 border-slate-600'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            {showGhost ? <Eye size={12} /> : <EyeOff size={12} />} Target Ghost
          </button>
          <button
            onClick={handleResetParts}
            className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-slate-900 text-slate-400 border-slate-800 hover:text-white flex items-center gap-1.5"
          >
            <RotateCcw size={12} /> Reset Parts
          </button>
        </div>

        {selectedTransform && (
          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
            <div className="space-y-1">
              <div className="text-slate-500">Position (m)</div>
              <div className="flex gap-1">
                {(['X', 'Y', 'Z'] as const).map((axisLabel, axis) => (
                  <label key={axisLabel} className="flex-1">
                    <span className="text-slate-600">{axisLabel}</span>
                    <input
                      type="number"
                      step={0.01}
                      value={Number(selectedTransform.position[axis].toFixed(3))}
                      onChange={(e) =>
                        setAxis(selectedPartId, 'position', axis as 0 | 1 | 2, Number(e.target.value))
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-slate-200"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-slate-500">Rotation (deg)</div>
              <div className="flex gap-1">
                {(['X', 'Y', 'Z'] as const).map((axisLabel, axis) => (
                  <label key={axisLabel} className="flex-1">
                    <span className="text-slate-600">{axisLabel}</span>
                    <input
                      type="number"
                      step={5}
                      value={Number((selectedTransform.rotation[axis] * DEG).toFixed(1))}
                      onChange={(e) =>
                        setAxis(
                          selectedPartId,
                          'rotation',
                          axis as 0 | 1 | 2,
                          Number(e.target.value) / DEG
                        )
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-slate-200"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] font-mono text-slate-500">
          Drag a part to move it on the table · Q/E yaw · R/F pitch · Z/X roll · PageUp/PageDown
          height · ` toggles Debug Mode
        </p>

        {debugMode ? (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300">
              <Bug size={13} /> Level Authoring
              {targetState?.savedAt && (
                <span className="text-slate-500">saved {targetState.savedAt}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSaveTargetState}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-amber-500/20 text-amber-200 border border-amber-500/50 hover:bg-amber-500/30 flex items-center gap-1.5"
              >
                <Save size={12} /> Save Target State
              </button>
              <button
                onClick={handleLoadTargetIntoScene}
                disabled={!targetState}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900 text-slate-300 border border-slate-800 hover:text-white disabled:opacity-40 flex items-center gap-1.5"
              >
                <Check size={12} /> Load Saved Target
              </button>
              <button
                onClick={handleCopyJson}
                disabled={!targetState}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900 text-slate-300 border border-slate-800 hover:text-white disabled:opacity-40 flex items-center gap-1.5"
              >
                <ClipboardCopy size={12} /> Copy JSON
              </button>
              <button
                onClick={() => setShowImport((s) => !s)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900 text-slate-300 border border-slate-800 hover:text-white flex items-center gap-1.5"
              >
                <Upload size={12} /> Import JSON
              </button>
              <button
                onClick={handleClearOverride}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900 text-rose-300 border border-slate-800 hover:bg-rose-500/10 flex items-center gap-1.5"
              >
                <Trash2 size={12} /> Clear Override
              </button>
            </div>

            {showImport && (
              <div className="space-y-2">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{ "levelId": "level_1", "parts": { ... } }'
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[11px] font-mono text-slate-200"
                />
                <button
                  onClick={handleImport}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono bg-sky-500/20 text-sky-200 border border-sky-500/40"
                >
                  Apply Import
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-mono">
              <label className="space-y-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Ruler size={11} /> Position tolerance: {tolerance.positionMeters.toFixed(3)} m
                </span>
                <input
                  type="range"
                  min={0.005}
                  max={0.3}
                  step={0.005}
                  value={tolerance.positionMeters}
                  onChange={(e) =>
                    setTolerance((t) => ({ ...t, positionMeters: Number(e.target.value) }))
                  }
                  className="w-full accent-amber-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">
                  Rotation tolerance: {tolerance.rotationDegrees.toFixed(0)}°
                </span>
                <input
                  type="range"
                  min={1}
                  max={45}
                  step={1}
                  value={tolerance.rotationDegrees}
                  onChange={(e) =>
                    setTolerance((t) => ({ ...t, rotationDegrees: Number(e.target.value) }))
                  }
                  className="w-full accent-amber-500"
                />
              </label>
              <label className="flex items-center gap-2 text-slate-400">
                <input
                  type="checkbox"
                  checked={tolerance.symmetricRotation}
                  onChange={(e) =>
                    setTolerance((t) => ({ ...t, symmetricRotation: e.target.checked }))
                  }
                  className="accent-amber-500"
                />
                Treat 180° flips as equivalent
              </label>
            </div>

            <p className="text-[10px] font-mono text-slate-500">
              Tolerance sliders preview validation only. Persist the values you settle on by editing
              <code className="text-slate-400"> src/game/levels/level1.json</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <button
              onClick={handleCheckAlignment}
              className="px-4 py-2 rounded-lg text-xs font-mono bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30"
            >
              Submit Assembly
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
              {(result ?? liveResult).parts.map((p) => (
                <div
                  key={p.partId}
                  className={`flex items-center justify-between px-2 py-1 rounded border ${
                    p.aligned
                      ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/5'
                      : 'border-slate-800 text-slate-400'
                  }`}
                >
                  <span>{config.parts.find((c) => c.id === p.partId)?.label ?? p.partId}</span>
                  <span>
                    {Number.isFinite(p.positionError)
                      ? `Δpos ${(p.positionError * 100).toFixed(1)} cm · Δrot ${p.rotationError.toFixed(0)}°`
                      : 'no target authored'}
                  </span>
                </div>
              ))}
            </div>
            {!targetState && (
              <p className="text-[10px] font-mono text-amber-400">
                No expected orientation authored yet — switch to Debug Mode and press “Save Target
                State”.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
