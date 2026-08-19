import { useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import confetti from "canvas-confetti";
import RobotModel, { JOINT_LIMITS } from "./RobotModel";
import JointControls from "./JointControls";
import JointHUD from "./JointHUD";
import { Hand, ArrowLeft, Check, X, RotateCcw, Award, Zap } from "lucide-react";
import { ShapeType } from "./FallingObjects";
import {
  playGrabSound,
  playReleaseSound,
  playServoJogSound,
  playSuccessChime,
  playErrorSound,
  playClickSound,
} from "./audio";

const ROTATION_STEP = 0.04;
const GRAB_DISTANCE = 0.5;
const CONVEYOR_SPEED = 0.35;
const FLOOR_Y = -1.5;

const SHAPE_COLORS: Record<ShapeType, string> = {
  cube: "#38bdf8",
  cylinder: "#f97316",
  pyramid: "#4ade80",
};

const CONVEYOR_LABELS: { type: ShapeType; z: number; color: string; label: string }[] = [
  { type: "cube", z: -2, color: "#38bdf8", label: "Cubes (Blue)" },
  { type: "cylinder", z: 0, color: "#f97316", label: "Cylinders (Orange)" },
  { type: "pyramid", z: 2, color: "#4ade80", label: "Pyramids (Green)" },
];

type ObjectState = "input" | "grabbed" | "sliding" | "exploding";

interface ConveyorObject {
  id: number;
  type: ShapeType;
  position: [number, number, number];
  onConveyor: ObjectState;
  slideTarget?: [number, number, number];
}

// 3D Conveyor Belt Component
function ConveyorBelt({
  position,
  length,
  color,
  label,
  rotation = 0,
}: {
  position: [number, number, number];
  length: number;
  color: string;
  label?: string;
  rotation?: number;
}) {
  const rollerGroupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (rollerGroupRef.current) {
      rollerGroupRef.current.children.forEach((roller) => {
        roller.rotation.x += delta * 3;
      });
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Belt Bed */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[length, 0.08, 0.65]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0.2} />
      </mesh>
      {/* Side Guard Rails */}
      <mesh position={[0, 0.06, -0.34]}>
        <boxGeometry args={[length, 0.12, 0.03]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0.06, 0.34]}>
        <boxGeometry args={[length, 0.12, 0.03]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} transparent opacity={0.7} />
      </mesh>
      {/* Spinning Rollers */}
      <group ref={rollerGroupRef}>
        {Array.from({ length: Math.floor(length / 0.35) }).map((_, i) => (
          <mesh
            key={i}
            position={[-length / 2 + 0.18 + i * 0.35, -0.01, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.025, 0.025, 0.62, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
      </group>
      {/* Glow marker label */}
      {label && (
        <mesh position={[length / 2 - 0.15, 0.08, 0]}>
          <boxGeometry args={[0.25, 0.02, 0.55]} />
          <meshStandardMaterial
            color={color}
            roughness={0.3}
            metalness={0.5}
            emissive={color}
            emissiveIntensity={0.5}
          />
        </mesh>
      )}
    </group>
  );
}

function ShapeGeometry({ type }: { type: ShapeType }) {
  switch (type) {
    case "cube":
      return <boxGeometry args={[0.22, 0.22, 0.22]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.11, 0.11, 0.26, 24]} />;
    case "pyramid":
      return <coneGeometry args={[0.13, 0.26, 4]} />;
  }
}

// Particle explosion on mis-sort
function ExplosionParticles({ position, color }: { position: [number, number, number]; color: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const particles = useRef(
    Array.from({ length: 16 }, () => ({
      dir: new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1.5,
        (Math.random() - 0.5) * 4
      ),
      scale: Math.random() * 0.07 + 0.02,
    }))
  );
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const p = particles.current[i];
      child.position.addScaledVector(p.dir, delta);
      p.dir.y -= 5.5 * delta;
      const s = Math.max(0, 1 - elapsed.current * 1.8);
      child.scale.setScalar(p.scale * s);
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {particles.current.map((p, i) => (
        <mesh key={i} scale={p.scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// Floating thumbs up feedback
function ThumbsUp({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (ref.current) {
      ref.current.position.y += delta * 0.9;
      ref.current.scale.setScalar(Math.max(0, 1 - elapsed.current * 0.6));
    }
  });

  return (
    <group ref={ref} position={position}>
      <Html center style={{ pointerEvents: "none" }}>
        <div className="text-3xl select-none filter drop-shadow-md">✨ Perfect!</div>
      </Html>
    </group>
  );
}

function ConveyorObjects({
  objects,
  grabbedId,
  gripperTipRef,
  explosions,
  thumbsUps,
  onSlideComplete,
}: {
  objects: ConveyorObject[];
  grabbedId: number | null;
  gripperTipRef: React.MutableRefObject<THREE.Object3D | null>;
  explosions: { id: number; position: [number, number, number]; color: string }[];
  thumbsUps: { id: number; position: [number, number, number] }[];
  onSlideComplete: (id: number) => void;
}) {
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const gripperWorldPos = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (gripperTipRef.current) {
      gripperTipRef.current.getWorldPosition(gripperWorldPos.current);
    }

    objects.forEach((obj) => {
      const mesh = meshRefs.current.get(obj.id);
      if (!mesh) return;

      if (obj.id === grabbedId) {
        mesh.position.lerp(gripperWorldPos.current, 0.35);
        return;
      }

      if (obj.onConveyor === "input") {
        mesh.position.x += CONVEYOR_SPEED * delta;
        if (mesh.position.x > -1.0) mesh.position.x = -1.0; // Wait at pick station
      }

      if (obj.onConveyor === "sliding" && obj.slideTarget) {
        const target = new THREE.Vector3(...obj.slideTarget);
        mesh.position.lerp(target, 3.2 * delta);
        const dist = mesh.position.distanceTo(target);
        if (dist < 0.15) {
          onSlideComplete(obj.id);
        }
      }

      if (obj.onConveyor === "exploding") {
        mesh.visible = false;
      }
    });
  });

  return (
    <>
      {objects.map((obj) => (
        <mesh
          key={obj.id}
          ref={(el) => {
            if (el) {
              meshRefs.current.set(obj.id, el);
              el.userData.__objectId = obj.id;
              if (!el.userData.__positioned) {
                el.position.set(...obj.position);
                el.userData.__positioned = true;
              }
            }
          }}
          castShadow
          receiveShadow
        >
          <ShapeGeometry type={obj.type} />
          <meshStandardMaterial
            color={SHAPE_COLORS[obj.type]}
            roughness={0.35}
            metalness={0.6}
            emissive={obj.id === grabbedId ? SHAPE_COLORS[obj.type] : "#000000"}
            emissiveIntensity={obj.id === grabbedId ? 0.4 : 0}
          />
        </mesh>
      ))}
      {explosions.map((e) => (
        <ExplosionParticles key={e.id} position={e.position} color={e.color} />
      ))}
      {thumbsUps.map((t) => (
        <ThumbsUp key={t.id} position={t.position} />
      ))}
    </>
  );
}

function DropZone({
  position,
  type,
  color,
}: {
  position: [number, number, number];
  type: string;
  color: string;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ringRef.current) ringRef.current.rotation.z += delta * 0.6;
  });
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.16, 0.28, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[0.26, 0.3, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Main SortingGame Component
interface SortingGameProps {
  onBack: () => void;
  onComplete?: () => void;
}

export default function SortingGame({ onBack, onComplete }: SortingGameProps) {
  const jointRefs = useRef<THREE.Group[]>([]);
  const gripperTipRef = useRef<THREE.Object3D | null>(null);
  const [jointTargets, setJointTargets] = useState([0, -0.3, 0.4, 0, 0, 0]);
  const [isInteracting, setIsInteracting] = useState(false);
  const [objects, setObjects] = useState<ConveyorObject[]>([]);
  const [grabbedId, setGrabbedId] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0, streak: 0 });
  const [explosions, setExplosions] = useState<{ id: number; position: [number, number, number]; color: string }[]>([]);
  const [thumbsUps, setThumbsUps] = useState<{ id: number; position: [number, number, number] }[]>([]);
  const targetGoal = 5;

  const nextId = useRef(0);
  const spawnCount = useRef(0);
  const effectId = useRef(0);

  const spawnNextObject = useCallback(() => {
    if (spawnCount.current >= targetGoal + 5) return;
    const types: ShapeType[] = ["cube", "cylinder", "pyramid"];
    const type = types[Math.floor(Math.random() * types.length)];
    const id = nextId.current++;
    spawnCount.current++;
    setObjects((prev) => [
      ...prev,
      { id, type, position: [-4.2, FLOOR_Y + 0.2, 0], onConveyor: "input" },
    ]);
  }, []);

  // Spawn first on mount
  useEffect(() => {
    spawnCount.current = 0;
    setObjects([]);
    const t = setTimeout(() => spawnNextObject(), 200);
    return () => clearTimeout(t);
  }, [spawnNextObject]);

  const handleSlideComplete = useCallback(
    (id: number) => {
      setObjects((prev) => prev.filter((o) => o.id !== id));
      setTimeout(() => spawnNextObject(), 400);
    },
    [spawnNextObject]
  );

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

  const handleGrab = useCallback(() => {
    if (grabbedId !== null) {
      // Releasing / Dropping
      if (!gripperTipRef.current) {
        setGrabbedId(null);
        return;
      }
      const pos = new THREE.Vector3();
      gripperTipRef.current.getWorldPosition(pos);
      const dropPos: [number, number, number] = [pos.x, pos.y, pos.z];

      const grabbedObj = objects.find((o) => o.id === grabbedId);
      if (grabbedObj) {
        let sorted = false;
        for (const conv of CONVEYOR_LABELS) {
          const dropX = 1.2;
          const dropZ = conv.z;
          const dist = Math.hypot(pos.x - dropX, pos.z - dropZ);

          if (dist < 0.65) {
            sorted = true;
            if (conv.type === grabbedObj.type) {
              // CORRECT SORT
              playSuccessChime();
              setScore((prev) => {
                const nextCorrect = prev.correct + 1;
                if (nextCorrect >= targetGoal) {
                  confetti({ particleCount: 70, spread: 60 });
                }
                return {
                  ...prev,
                  correct: nextCorrect,
                  streak: prev.streak + 1,
                };
              });

              const slideEnd: [number, number, number] = [4.2, FLOOR_Y + 0.2, conv.z];
              setObjects((prev) =>
                prev.map((o) =>
                  o.id === grabbedId
                    ? { ...o, onConveyor: "sliding" as ObjectState, slideTarget: slideEnd }
                    : o
                )
              );

              const tid = effectId.current++;
              setThumbsUps((prev) => [...prev, { id: tid, position: [pos.x, pos.y + 0.3, pos.z] }]);
              setTimeout(() => setThumbsUps((prev) => prev.filter((t) => t.id !== tid)), 2000);
            } else {
              // WRONG CONVEYOR - explode
              playErrorSound();
              setScore((prev) => ({ ...prev, wrong: prev.wrong + 1, streak: 0 }));
              setObjects((prev) =>
                prev.map((o) =>
                  o.id === grabbedId ? { ...o, onConveyor: "exploding" as ObjectState } : o
                )
              );
              const eid = effectId.current++;
              setExplosions((prev) => [
                ...prev,
                { id: eid, position: dropPos, color: SHAPE_COLORS[grabbedObj.type] },
              ]);
              setTimeout(() => setExplosions((prev) => prev.filter((e) => e.id !== eid)), 1500);

              // Respawn replacement after delay
              setTimeout(() => {
                setObjects((prev) => {
                  const filtered = prev.filter((o) => o.id !== grabbedId);
                  const newId = nextId.current++;
                  return [
                    ...filtered,
                    {
                      id: newId,
                      type: grabbedObj.type,
                      position: [-4.2, FLOOR_Y + 0.2, 0] as [number, number, number],
                      onConveyor: "input" as ObjectState,
                    },
                  ];
                });
              }, 1000);
            }
            break;
          }
        }
        if (!sorted) {
          playReleaseSound();
          setObjects((prev) =>
            prev.map((o) =>
              o.id === grabbedId ? { ...o, onConveyor: "input" as ObjectState } : o
            )
          );
        }
      }
      setGrabbedId(null);
      return;
    }

    // Try to grab item near pick station
    if (!gripperTipRef.current) return;
    const gripperPos = new THREE.Vector3();
    gripperTipRef.current.getWorldPosition(gripperPos);

    let root = gripperTipRef.current as THREE.Object3D;
    while (root.parent) root = root.parent;

    let closest: { id: number; dist: number } | null = null;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.__objectId !== undefined) {
        const meshPos = new THREE.Vector3();
        child.getWorldPosition(meshPos);
        const dist = gripperPos.distanceTo(meshPos);
        if (dist < GRAB_DISTANCE && (!closest || dist < closest.dist)) {
          closest = { id: child.userData.__objectId, dist };
        }
      }
    });

    if (closest) {
      playGrabSound();
      setGrabbedId(closest.id);
      setObjects((prev) =>
        prev.map((o) =>
          o.id === closest!.id ? { ...o, onConveyor: "grabbed" as ObjectState } : o
        )
      );
    }
  }, [grabbedId, objects, targetGoal]);

  const handleRestart = () => {
    playClickSound();
    setScore({ correct: 0, wrong: 0, streak: 0 });
    setGrabbedId(null);
    setJointTargets([0, -0.3, 0.4, 0, 0, 0]);
    spawnCount.current = 0;
    setObjects([]);
    setTimeout(() => spawnNextObject(), 200);
  };

  const isComplete = score.correct >= targetGoal;

  return (
    <div className="flex flex-col w-full bg-[#0a0a0f] text-white">
      {/* 3D Scene View */}
      <div className="relative w-full h-[55vh] min-h-[360px]">
        <Canvas
          shadows
          camera={{ position: [0, 5.5, 6.2], fov: 48 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
          className="touch-none"
        >
          <fog attach="fog" args={["#0a0a0f", 10, 24]} />
          <ambientLight intensity={0.25} />
          <directionalLight
            position={[5, 9, 3]}
            intensity={1.6}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-3, 4, -2]} intensity={0.6} color="#38bdf8" />
          <pointLight position={[2, 1, 3]} intensity={0.4} color="#f97316" />

          {/* Floor & Grid */}
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0.1} />
          </mesh>
          <gridHelper args={[20, 40, "#1e293b", "#1e293b"]} position={[0, FLOOR_Y + 0.005, 0]} />
          <ContactShadows position={[0, FLOOR_Y + 0.01, 0]} opacity={0.6} scale={10} blur={2} far={4} />

          {/* Incoming Feeding Conveyor */}
          <ConveyorBelt position={[-2.7, FLOOR_Y + 0.1, 0]} length={4.2} color="#94a3b8" />

          {/* 3 Output Destination Conveyor Lines */}
          {CONVEYOR_LABELS.map(({ type, z, color, label }) => (
            <group key={type}>
              <ConveyorBelt position={[2.7, FLOOR_Y + 0.1, z]} length={3.4} color={color} label={label} />
              <DropZone position={[1.2, FLOOR_Y + 0.01, z]} type={type} color={color} />
            </group>
          ))}

          {/* Robot Arm */}
          <RobotModel
            jointTargets={jointTargets}
            jointRefs={jointRefs}
            isInteracting={isInteracting}
            gripperTipRef={gripperTipRef}
            isGrabbing={grabbedId !== null}
          />

          {/* Conveyor Items */}
          <ConveyorObjects
            objects={objects}
            grabbedId={grabbedId}
            gripperTipRef={gripperTipRef}
            explosions={explosions}
            thumbsUps={thumbsUps}
            onSlideComplete={handleSlideComplete}
          />

          <OrbitControls
            enablePan={false}
            minDistance={4}
            maxDistance={11}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
            enableDamping
            dampingFactor={0.05}
          />
          <Environment preset="city" />
        </Canvas>

        {/* Title Header */}
        <div className="absolute top-3 left-3 z-20">
          <h2 className="text-lg md:text-xl font-light text-white tracking-wide">
            Industrial Sorter Challenge
          </h2>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-wider uppercase">
            Pick from left conveyor · Drop into matching color lane
          </p>
        </div>

        {/* Score & Streak Header */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 font-mono text-xs">
          <div className="flex items-center gap-1 text-emerald-400 font-bold">
            <Check size={13} /> {score.correct}/{targetGoal}
          </div>
          <div className="h-3 w-px bg-slate-700 mx-1" />
          <div className="flex items-center gap-1 text-rose-400 font-bold">
            <X size={13} /> {score.wrong}
          </div>
          {score.streak > 1 && (
            <>
              <div className="h-3 w-px bg-slate-700 mx-1" />
              <div className="flex items-center gap-1 text-amber-400 font-bold animate-pulse">
                <Zap size={13} /> {score.streak}x
              </div>
            </>
          )}
        </div>

        {/* Victory Screen */}
        {isComplete && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="text-center p-6 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-2xl max-w-sm w-full">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <Award size={24} />
              </div>
              <h3 className="text-2xl font-light text-white mb-1">
                Challenge Complete!
              </h3>
              <p className="text-slate-300 font-mono text-xs mb-4">
                Sorted {score.correct} packages · {score.wrong} errors · Top Streak: {score.streak}
              </p>
              <div className="flex justify-center gap-3 font-mono text-xs">
                <button
                  onClick={handleRestart}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-600/20"
                >
                  Play Again
                </button>
                <button
                  onClick={onBack}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700"
                >
                  Return to Hub
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="w-full p-3 md:p-4 border-t border-slate-800 bg-[#08080d]">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all font-mono text-xs"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>

            <div className="flex-1 flex justify-center gap-1.5">
              {CONVEYOR_LABELS.map(({ type, color, label }) => (
                <span
                  key={type}
                  className="px-2 py-1 rounded text-[10px] font-mono font-bold tracking-wider uppercase"
                  style={{ backgroundColor: color + "20", color, border: `1px solid ${color}40` }}
                >
                  {type}
                </span>
              ))}
            </div>

            <button
              onClick={handleGrab}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-xs tracking-wide font-bold transition-all ${
                grabbedId !== null
                  ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                  : "bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
              }`}
            >
              <Hand size={14} />
              <span>{grabbedId !== null ? "Drop in Lane" : "Grab Package"}</span>
            </button>

            <button
              onClick={handleRestart}
              title="Restart Challenge"
              className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <JointHUD jointAngles={jointTargets} />

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

          <p className="text-center text-[10px] text-slate-500 font-mono">
            pick object from left belt · swing arm over matching colored drop zone · release
          </p>
        </div>
      </div>
    </div>
  );
}
