import { useRef, useState, useCallback, useEffect, lazy, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import confetti from "canvas-confetti";
import RobotModel, { JOINT_LIMITS } from "./RobotModel";
import JointControls from "./JointControls";
import JointHUD from "./JointHUD";
import SpawnButtons, { ShapeType } from "./SpawnButtons";
import FallingObjects, { SpawnedObject } from "./FallingObjects";
import HoleMesh from "./HoleMesh";
import { POSE_PRESETS } from "./kinematics";
import {
  Hand,
  RotateCcw,
  Layers,
  Volume2,
  VolumeX,
  Eye,
  Sparkles,
  HelpCircle,
  PackageCheck,
  Target,
  Flame,
} from "lucide-react";
import {
  playGrabSound,
  playReleaseSound,
  playServoJogSound,
  playSuccessChime,
  playClickSound,
  setSoundMuted,
} from "./audio";
import ErrorBoundary from "../src/components/ErrorBoundary";
import SortingGame from "./SortingGame";
import StackingGame from "./StackingGame";
import TeachPendant from "./TeachPendant";
import FabricationForge from "./FabricationForge";
import LevelManager from "../src/game/components/LevelManager";

const ROTATION_STEP = 0.04;
const GRAB_DISTANCE = 0.45;

export type GameMode = "hub" | "sandbox" | "sorting" | "stacking" | "fabrication" | "campaign";
type ControlTab = "jog" | "sliders" | "presets" | "teach";
type CameraPreset = "orbit" | "top" | "side" | "front";

interface RobotSceneProps {
  initialMode?: GameMode;
}

export default function RobotScene({ initialMode = "hub" }: RobotSceneProps) {
  const jointRefs = useRef<THREE.Group[]>([]);
  const gripperTipRef = useRef<THREE.Object3D | null>(null);
  const orbitControlsRef = useRef<any>(null);

  const [jointTargets, setJointTargets] = useState([0, -0.3, 0.4, 0, 0, 0]);
  const [isInteracting, setIsInteracting] = useState(false);
  const [spawnedObjects, setSpawnedObjects] = useState<SpawnedObject[]>([]);
  const [grabbedId, setGrabbedId] = useState<number | null>(null);
  const [holePosition, setHolePosition] = useState<[number, number, number] | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>(initialMode);
  const [controlTab, setControlTab] = useState<ControlTab>("jog");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [pitScore, setPitScore] = useState<number>(0);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("orbit");

  const nextId = useRef(0);

  // Set camera view preset
  const applyCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    playClickSound();
    if (!orbitControlsRef.current) return;

    if (preset === "orbit") {
      orbitControlsRef.current.object.position.set(3, 2.5, 4);
      orbitControlsRef.current.target.set(0, -0.5, 0);
    } else if (preset === "top") {
      orbitControlsRef.current.object.position.set(0, 6, 0.01);
      orbitControlsRef.current.target.set(0, -1.5, 0);
    } else if (preset === "side") {
      orbitControlsRef.current.object.position.set(5, 0.5, 0);
      orbitControlsRef.current.target.set(0, -0.5, 0);
    } else if (preset === "front") {
      orbitControlsRef.current.object.position.set(0, 1, 5);
      orbitControlsRef.current.target.set(0, -0.5, 0);
    }
    orbitControlsRef.current.update();
  };

  const handleRotate = useCallback((joint: number, direction: number) => {
    playServoJogSound(1 + joint * 0.1);
    setJointTargets((prev) => {
      const next = [...prev];
      const [min, max] = JOINT_LIMITS[joint];
      next[joint] = THREE.MathUtils.clamp(
        next[joint] + direction * ROTATION_STEP,
        min,
        max
      );
      return next;
    });
  }, []);

  const handleSliderChange = (joint: number, radValue: number) => {
    playServoJogSound(1 + joint * 0.08);
    setJointTargets((prev) => {
      const next = [...prev];
      next[joint] = radValue;
      return next;
    });
  };

  const handleSpawn = useCallback((type: ShapeType) => {
    if (grabbedId !== null) return;
    const id = nextId.current++;
    const angle = (Math.random() - 0.5) * 1.4;
    const radius = 1.1 + Math.random() * 0.4;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    // Maintain exactly one active block on the field at a time
    setSpawnedObjects([
      {
        id,
        type,
        position: [x, 2.0, z],
        rotation: [0, Math.random() * Math.PI, 0],
      },
    ]);
  }, [grabbedId]);

  const handleGrab = useCallback(() => {
    if (grabbedId !== null) {
      // Release
      playReleaseSound();
      setGrabbedId(null);
      return;
    }

    if (!gripperTipRef.current) return;
    const gripperPos = new THREE.Vector3();
    gripperTipRef.current.getWorldPosition(gripperPos);

    let root = gripperTipRef.current as THREE.Object3D;
    while (root.parent) root = root.parent;

    let closest: { id: number; dist: number; obj: SpawnedObject } | null = null;

    spawnedObjects.forEach((obj) => {
      root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.__objectId === obj.id) {
          const meshPos = new THREE.Vector3();
          child.getWorldPosition(meshPos);
          const dist = gripperPos.distanceTo(meshPos);
          if (dist < GRAB_DISTANCE && (!closest || dist < closest.dist)) {
            closest = { id: obj.id, dist, obj };
          }
        }
      });
    });

    if (closest) {
      playGrabSound();
      setGrabbedId((closest as any).id);
      // Spawn portal hole on opposite quadrant
      const obj = (closest as any).obj;
      const holeX = -obj.position[0] * 1.3;
      const holeZ = -obj.position[2] * 1.3;
      setHolePosition([
        THREE.MathUtils.clamp(holeX, -1.8, 1.8),
        -1.5,
        THREE.MathUtils.clamp(holeZ, -1.8, 1.8),
      ]);
    }
  }, [grabbedId, spawnedObjects]);

  const handleObjectInHole = useCallback((obj: SpawnedObject) => {
    playSuccessChime();
    confetti({ particleCount: 50, spread: 60 });
    setPitScore((prev) => prev + 1);
    setSpawnedObjects((prev) => prev.filter((o) => o.id !== obj.id));
    setGrabbedId(null);
    setHolePosition(null);
  }, []);

  const handleReset = useCallback(() => {
    playClickSound();
    setSpawnedObjects([]);
    setGrabbedId(null);
    setHolePosition(null);
    setJointTargets([0, -0.3, 0.4, 0, 0, 0]);
  }, []);

  const handleApplyPreset = (angles: number[]) => {
    playClickSound();
    playServoJogSound(1.2);
    setJointTargets([...angles]);
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    setSoundMuted(next);
    playClickSound();
  };

  // Keyboard hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        handleGrab();
      } else if (e.key === "r" || e.key === "R") {
        handleReset();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGrab, handleReset, isMuted]);

  // Initial spawn exactly one block for immediate sandbox play
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      handleSpawn("cube");
    }
  }, [handleSpawn]);

  const gameLoadingFallback = (
    <div className="w-full h-[60vh] bg-[#0a0a0f] flex flex-col items-center justify-center space-y-3">
      <div className="w-8 h-8 border-2 border-slate-700 border-t-sky-500 rounded-full animate-spin" />
      <span className="text-xs font-mono text-slate-400">Loading Robot Simulation...</span>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 w-full h-full bg-[#0a0a0f] text-white select-none relative">
      {/* Universal Minimalist Floating Header */}
      {gameMode !== 'hub' && gameMode !== 'fabrication' && (
        <header className="absolute top-2 left-2 right-2 z-50 flex items-center justify-between pointer-events-none">
          {/* Left Side: Home Button */}
          <div className="pointer-events-auto flex items-center gap-1 bg-slate-950/80 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold font-mono text-sm mr-1">
              6X
            </div>
            
            <button
              onClick={() => {
                playClickSound();
                setGameMode("hub");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all text-slate-300 hover:text-white hover:bg-slate-900"
            >
              <Target size={13} />
              <span>Robot Hub</span>
            </button>
          </div>

          {/* Right Side: Utils */}
          <div className="pointer-events-auto flex items-center gap-1 bg-slate-950/80 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl">
            <button
              onClick={toggleMute}
              title={isMuted ? "Unmute Sound" : "Mute Sound"}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-all"
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            {gameMode === "sandbox" && (
              <button
                onClick={() => setShowHelp(!showHelp)}
                title="Shortcuts & Instructions"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-all"
              >
                <HelpCircle size={14} />
              </button>
            )}
          </div>
        </header>
      )}

      {/* Hub Landing Page */}
      {gameMode === "hub" && (
        <div className="absolute inset-0 z-40 bg-[#0a0a0f] overflow-y-auto">
          <div className="flex flex-col items-center justify-center min-h-full p-6">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold font-mono text-3xl mb-6 shadow-lg shadow-orange-500/10">
              6X
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 text-center">6-Axis Robot Hub</h1>
            <p className="text-slate-400 mb-10 text-center max-w-md">
              Select a simulation mode below to interact with the industrial robotic arm.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 max-w-3xl gap-4 w-full">
            {/* Sandbox Card */}
            <button
              onClick={() => {
                playClickSound();
                setGameMode("sandbox");
              }}
              className="flex flex-col items-start p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-orange-500/50 transition-all text-left group cursor-pointer"
            >
              <div className="p-3 rounded-xl bg-orange-500/20 text-orange-400 mb-4 group-hover:scale-110 transition-transform">
                <Target size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-200 mb-1">Physics Sandbox</h2>
              <p className="text-sm text-slate-400">Free play mode. Spawn objects, learn kinematics, and control the robot with a teach pendant.</p>
            </button>

            {/* Sorter Card */}
            <button
              onClick={() => {
                playClickSound();
                setGameMode("sorting");
              }}
              className="flex flex-col items-start p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 transition-all text-left group cursor-pointer"
            >
              <div className="p-3 rounded-xl bg-sky-500/20 text-sky-400 mb-4 group-hover:scale-110 transition-transform">
                <PackageCheck size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-200 mb-1">Shape Sorter</h2>
              <p className="text-sm text-slate-400">Time attack mini-game. Sort the correct shapes into their matching bins as fast as you can.</p>
            </button>

            {/* Stacker Card */}
            <button
              onClick={() => {
                playClickSound();
                setGameMode("stacking");
              }}
              className="flex flex-col items-start p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 transition-all text-left group cursor-pointer"
            >
              <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                <Layers size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-200 mb-1">Tower Stacker</h2>
              <p className="text-sm text-slate-400">Precision challenge. Stack as many blocks as possible without the tower falling over.</p>
            </button>

            {/* Fabrication Forge Card */}
            <button
              onClick={() => {
                playClickSound();
                setGameMode("fabrication");
              }}
              className="flex flex-col items-start p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 transition-all text-left group cursor-pointer relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-bl-xl border-b border-l border-amber-500/30">
                PRO
              </div>
              <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 mb-4 group-hover:scale-110 transition-transform">
                <Flame size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-200 mb-1">Fabrication Forge</h2>
              <p className="text-sm text-slate-400">Advanced 3-stage metal welding simulation. Smelt, plan paths, and execute welds.</p>
            </button>

            {/* Campaign Card: Story levels with Pops */}
            <button
              onClick={() => {
                playClickSound();
                setGameMode("campaign");
              }}
              className="flex flex-col items-start p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-orange-500/50 transition-all text-left group cursor-pointer relative overflow-hidden"
            >
              <div className="p-3 rounded-xl bg-orange-500/20 text-orange-400 mb-4 group-hover:scale-110 transition-transform">
                <Flame size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-200 mb-1">Shop Floor Campaign</h2>
              <p className="text-sm text-slate-400">Level 1: assemble, tack, grind and weld a thingy jiggy before Pops loses his temper.</p>
            </button>
          </div>
          
          {/* Mute Button on Hub */}
          <button
            onClick={toggleMute}
            className="absolute top-6 right-6 p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-all cursor-pointer"
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          </div>
        </div>
      )}

      {/* Mode 1: Sorting Game */}
      {gameMode === "sorting" && (
        <ErrorBoundary fallbackTitle="Sorting Game" onReset={() => setGameMode("hub")}>
          <SortingGame onBack={() => setGameMode("hub")} />
        </ErrorBoundary>
      )}

      {/* Mode 2: Stacking Game */}
      {gameMode === "stacking" && (
        <ErrorBoundary fallbackTitle="Stacking Game" onReset={() => setGameMode("hub")}>
          <StackingGame onBack={() => setGameMode("hub")} />
        </ErrorBoundary>
      )}

      {/* Mode 4: Fabrication Forge Stages 1, 2 & 3 Workspace */}
      {gameMode === "fabrication" && (
        <ErrorBoundary fallbackTitle="Fabrication Forge" onReset={() => setGameMode("hub")}>
          <FabricationForge
            onBack={() => setGameMode("hub")}
            onShapeCreated={(shapeGroup) => console.log('Workpiece ready:', shapeGroup)}
            onPathConfirmed={(shape, weldPath) => {
              console.log('Stage 2 path confirmed:', { shape, weldPath });
            }}
          />
        </ErrorBoundary>
      )}

      {/* Mode 5: Story Campaign Levels */}
      {gameMode === "campaign" && (
        <ErrorBoundary fallbackTitle="Shop Floor Campaign" onReset={() => setGameMode("hub")}>
          <LevelManager levelId="level1" onBack={() => setGameMode("hub")} />
        </ErrorBoundary>
      )}

      {/* Mode 3: Sandbox Free Play */}
      {gameMode === "sandbox" && (
        <>
          {/* Main 3D Viewport */}
          <div className="relative w-full h-[52vh] min-h-[350px] bg-[#0a0a0f]">
            <Canvas
              shadows="percentage"
              camera={{ position: [3.2, 2.8, 4.2], fov: 46 }}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
              className="touch-none"
            >
              <fog attach="fog" args={["#0a0a0f", 8, 22]} />
              <ambientLight intensity={0.22} />
              <directionalLight
                position={[6, 9, 4]}
                intensity={1.6}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
              />
              <pointLight position={[-3, 4, -2]} intensity={0.6} color="#38bdf8" />
              <pointLight position={[2, 2, 3]} intensity={0.4} color="#ea580c" />

              {/* Floor & Grid */}
              <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
                <planeGeometry args={[20, 20]} />
                <meshStandardMaterial color="#0f172a" roughness={0.88} metalness={0.12} />
              </mesh>
              <gridHelper args={[20, 40, "#1e293b", "#1e293b"]} position={[0, -1.495, 0]} />
              <ContactShadows position={[0, -1.49, 0]} opacity={0.6} scale={10} blur={2} far={4} />

              {/* 6-Axis Robot Model */}
              <RobotModel
                jointTargets={jointTargets}
                jointRefs={jointRefs}
                isInteracting={isInteracting}
                gripperTipRef={gripperTipRef}
                isGrabbing={grabbedId !== null}
              />

              {/* Sandbox Game Mode Elements */}
              <FallingObjects
                objects={spawnedObjects}
                onUpdate={setSpawnedObjects}
                grabbedId={grabbedId}
                gripperTipRef={gripperTipRef}
                holePosition={holePosition}
                onObjectInHole={handleObjectInHole}
              />

              {holePosition && <HoleMesh position={holePosition} />}

              <OrbitControls
                ref={orbitControlsRef}
                enablePan={false}
                minDistance={2.8}
                maxDistance={9.5}
                minPolarAngle={Math.PI / 8}
                maxPolarAngle={Math.PI / 2.15}
                enableDamping
                dampingFactor={0.05}
              />
              <Environment preset="city" />
            </Canvas>

            {/* Floating Top Left Camera Views */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md p-1 rounded-lg border border-slate-800 font-mono text-[10px]">
              <Eye size={12} className="text-slate-400 ml-1 mr-0.5" />
              {(["orbit", "top", "front", "side"] as CameraPreset[]).map((cam) => (
                <button
                  key={cam}
                  onClick={() => applyCameraPreset(cam)}
                  className={`px-2 py-1 rounded capitalize font-medium transition-all ${
                    cameraPreset === cam
                      ? "bg-slate-700 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cam}
                </button>
              ))}
            </div>

            {/* Floating Top Right Badge */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 font-mono text-xs">
              <span className="text-slate-400">Pit Drops:</span>
              <span className="text-emerald-400 font-bold tabular-nums">{pitScore}</span>
            </div>

            {/* Hole active indicator guide banner (sandbox only) */}
            {holePosition && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 text-emerald-300 px-3.5 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 animate-bounce">
                <Sparkles size={13} className="text-emerald-400" />
                <span>Target Portal Pit Open! Move object over hole & release</span>
              </div>
            )}

            {/* Help Dialog Modal */}
            {showHelp && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl max-w-md w-full font-mono text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-sm font-bold text-white">Controls & Shortcuts</span>
                    <button
                      onClick={() => setShowHelp(false)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <ul className="space-y-1.5 text-slate-300">
                    <li><strong className="text-amber-400">Joint Buttons:</strong> Tap or drag left/right (◀ / ▶) to jog J1 through J6.</li>
                    <li><strong className="text-sky-400">Spacebar:</strong> Toggle Gripper clamp (Grab / Release).</li>
                    <li><strong className="text-emerald-400">Spawn Buttons:</strong> Add Cubes, Cylinders, or Pyramids.</li>
                    <li><strong className="text-purple-400">Preset Poses:</strong> Quickly reposition to Home, Pick, Drop, or Folded.</li>
                    <li><strong className="text-rose-400">Teach Pendant:</strong> Record sequence of poses and play automated loops!</li>
                    <li><strong className="text-yellow-400">R:</strong> Reset arm & objects.</li>
                    <li><strong className="text-blue-400">M:</strong> Toggle audio sound effects.</li>
                  </ul>
                  <div className="text-center pt-2">
                    <button
                      onClick={() => setShowHelp(false)}
                      className="w-full py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold"
                    >
                      Got It
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Control Deck */}
          <div className="w-full p-3 md:p-4 border-t border-slate-800 bg-[#08080d]">
            <div className="max-w-xl mx-auto space-y-3">
              {/* Top Bar: Spawn Shapes + Grab + Reset */}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                {gameMode === "sandbox" ? (
                  <SpawnButtons onSpawn={handleSpawn} disabled={grabbedId !== null} />
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs">
                    <Flame size={14} className="text-orange-400" />
                    <span>Stage 1: Custom Metal Forge Active</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGrab}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs tracking-wide font-bold transition-all ${
                      grabbedId !== null
                        ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 shadow-md shadow-emerald-500/10"
                        : "bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    <Hand size={14} />
                    <span>{grabbedId !== null ? "Release Clamp" : "Grab Object"}</span>
                  </button>

                  <button
                    onClick={handleReset}
                    title="Reset arm & clear items"
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              {/* Telemetry & TCP Readout */}
              <JointHUD jointAngles={jointTargets} showTCP={true} />

              {/* Control Method Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80 font-mono text-xs">
                <button
                  onClick={() => {
                    playClickSound();
                    setControlTab("jog");
                  }}
                  className={`flex-1 py-1.5 rounded-md text-center font-medium transition-all ${
                    controlTab === "jog"
                      ? "bg-slate-800 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Joint Jog (J1-J6)
                </button>
                <button
                  onClick={() => {
                    playClickSound();
                    setControlTab("sliders");
                  }}
                  className={`flex-1 py-1.5 rounded-md text-center font-medium transition-all ${
                    controlTab === "sliders"
                      ? "bg-slate-800 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Angle Sliders
                </button>
                <button
                  onClick={() => {
                    playClickSound();
                    setControlTab("presets");
                  }}
                  className={`flex-1 py-1.5 rounded-md text-center font-medium transition-all ${
                    controlTab === "presets"
                      ? "bg-slate-800 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Pose Presets
                </button>
                <button
                  onClick={() => {
                    playClickSound();
                    setControlTab("teach");
                  }}
                  className={`flex-1 py-1.5 rounded-md text-center font-medium transition-all ${
                    controlTab === "teach"
                      ? "bg-slate-800 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Teach Pendant
                </button>
              </div>

              {/* Tab 1: Joint Jog Buttons */}
              {controlTab === "jog" && (
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <JointControls
                      key={i}
                      index={i}
                      onRotate={handleRotate}
                      onInteractionStart={() => setIsInteracting(true)}
                      onInteractionEnd={() => setIsInteracting(false)}
                    />
                  ))}
                </div>
              )}

              {/* Tab 2: Angle Sliders */}
              {controlTab === "sliders" && (
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-2.5 font-mono text-xs">
                  {[
                    { label: "J1 Base Pan", min: -3.14, max: 3.14, idx: 0, color: "accent-orange-500" },
                    { label: "J2 Shoulder Pitch", min: -2.2, max: 2.2, idx: 1, color: "accent-sky-500" },
                    { label: "J3 Elbow Pitch", min: -2.5, max: 2.5, idx: 2, color: "accent-emerald-500" },
                    { label: "J4 Wrist Roll", min: -3.14, max: 3.14, idx: 3, color: "accent-purple-500" },
                    { label: "J5 Wrist Pitch", min: -2.2, max: 2.2, idx: 4, color: "accent-rose-500" },
                    { label: "J6 Tool Roll", min: -3.14, max: 3.14, idx: 5, color: "accent-yellow-500" },
                  ].map(({ label, min, max, idx, color }) => {
                    const deg = Math.round((jointTargets[idx] * 180) / Math.PI);
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="w-28 text-[11px] text-slate-300 font-medium">{label}</span>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={0.01}
                          value={jointTargets[idx]}
                          onChange={(e) => handleSliderChange(idx, parseFloat(e.target.value))}
                          className={`flex-1 ${color} cursor-pointer`}
                        />
                        <span className="w-12 text-right tabular-nums text-slate-200">{deg}°</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab 3: Pose Presets */}
              {controlTab === "presets" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                  {POSE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset.angles)}
                      className="flex flex-col items-start p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-left transition-all group"
                    >
                      <span className="font-semibold text-slate-200 group-hover:text-orange-400 transition-colors">
                        {preset.name}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5">{preset.description}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Tab 4: Teach Pendant */}
              {controlTab === "teach" && (
                <Suspense fallback={gameLoadingFallback}>
                  <TeachPendant
                    currentAngles={jointTargets}
                    isGrabbing={grabbedId !== null}
                    onSetJointTargets={setJointTargets}
                    onSetIsGrabbing={(grab) => {
                      if (grab && grabbedId === null) handleGrab();
                      else if (!grab && grabbedId !== null) setGrabbedId(null);
                    }}
                  />
                </Suspense>
              )}

              <p className="text-center text-[10px] text-slate-500 font-mono">
                jog robot near object · clamp gripper · drop into glowing target portal
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
