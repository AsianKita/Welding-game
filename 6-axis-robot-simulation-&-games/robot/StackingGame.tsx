import { useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import confetti from "canvas-confetti";
import RobotModel, { JOINT_LIMITS } from "./RobotModel";
import JointControls from "./JointControls";
import JointSliders from "./JointSliders";
import JointHUD from "./JointHUD";
import {
  Hand,
  ArrowLeft,
  RotateCcw,
  Trophy,
  Layers,
  Box,
  Circle,
  Triangle,
  AlertTriangle,
  Sliders,
  MousePointer,
  Plus,
} from "lucide-react";
import { ShapeType } from "./FallingObjects";
import {
  playGrabSound,
  playReleaseSound,
  playServoJogSound,
  playSuccessChime,
  playClickSound,
  playImpactSound,
  playTumbleSound,
} from "./audio";

const ROTATION_STEP = 0.04;
const GRAB_DISTANCE = 0.70;
const FLOOR_Y = -1.5;
const GRAVITY = -11.0;

// Pickup Tray on left, Stacking Pedestal on right
const TRAY_POS: [number, number, number] = [-0.95, FLOOR_Y + 0.08, 0.35];
const TRAY_SURFACE_Y = TRAY_POS[1] + 0.05; // -1.37

const PEDESTAL_POS: [number, number, number] = [0.95, FLOOR_Y + 0.08, 0.35];
const PEDESTAL_RADIUS = 0.45;
const PEDESTAL_SURFACE_Y = PEDESTAL_POS[1] + 0.08; // -1.34

type ItemState = "idle_tray" | "grabbed" | "falling" | "stacked" | "tumbling" | "ground_settled";

interface PhysicsItem {
  id: number;
  type: ShapeType;
  position: [number, number, number];
  velocity: [number, number, number];
  rotation: [number, number, number];
  angularVelocity: [number, number, number];
  state: ItemState;
  halfHeight: number;
}

const SHAPE_COLORS: Record<ShapeType, string> = {
  cube: "#38bdf8",
  cylinder: "#f97316",
  pyramid: "#4ade80",
};

const SHAPE_HEIGHTS: Record<ShapeType, number> = {
  cube: 0.22,
  cylinder: 0.24,
  pyramid: 0.24,
};

function ShapeGeometry({ type }: { type: ShapeType }) {
  switch (type) {
    case "cube":
      return <boxGeometry args={[0.22, 0.22, 0.22]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.12, 0.12, 0.24, 24]} />;
    case "pyramid":
      return <coneGeometry args={[0.14, 0.24, 4]} />;
  }
}

// Stacking platform with guideline rings
function StackingPedestal({
  currentHeight,
  targetHeight,
  isUnstable,
}: {
  currentHeight: number;
  targetHeight: number;
  isUnstable: boolean;
}) {
  const laserRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (laserRef.current) laserRef.current.rotation.z += delta * 0.4;
    if (ringRef.current) ringRef.current.rotation.z -= delta * 0.3;
  });

  return (
    <group position={PEDESTAL_POS}>
      {/* Base Platform */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.46, 0.16, 32]} />
        <meshStandardMaterial
          color={isUnstable ? "#451a1a" : "#1e293b"}
          roughness={0.7}
          metalness={0.5}
        />
      </mesh>
      {/* Outer Ring */}
      <mesh ref={ringRef} position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.40, 32]} />
        <meshBasicMaterial
          color={isUnstable ? "#ef4444" : "#f59e0b"}
          side={THREE.DoubleSide}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Center Landing Pad */}
      <mesh position={[0, 0.086, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 32]} />
        <meshBasicMaterial
          color={isUnstable ? "#ef4444" : "#38bdf8"}
          side={THREE.DoubleSide}
          transparent
          opacity={0.4}
        />
      </mesh>
      {/* Goal Ring Indicator */}
      <mesh
        ref={laserRef}
        position={[0, 0.08 + targetHeight * 0.23, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.28, 0.32, 24]} />
        <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// 3D Physics Simulation Component
function StackingSceneObjects({
  itemsRef,
  grabbedIdRef,
  gripperTipRef,
  onStackEvent,
  renderTrigger,
}: {
  itemsRef: React.MutableRefObject<PhysicsItem[]>;
  grabbedIdRef: React.MutableRefObject<number | null>;
  gripperTipRef: React.MutableRefObject<THREE.Object3D | null>;
  onStackEvent: (event: {
    type: "landed" | "pyramid_slip" | "toppled" | "victory";
    stackCount: number;
    message?: string;
  }) => void;
  renderTrigger: number;
}) {
  const meshMap = useRef<Map<number, THREE.Mesh>>(new Map());
  const prevGripperPos = useRef(new THREE.Vector3());
  const gripperVel = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.045);
    const items = itemsRef.current;
    const grabbedId = grabbedIdRef.current;

    // Track gripper position & velocity
    const curGripperPos = new THREE.Vector3();
    if (gripperTipRef.current) {
      gripperTipRef.current.getWorldPosition(curGripperPos);
      if (dt > 0.001) {
        gripperVel.current.subVectors(curGripperPos, prevGripperPos.current).divideScalar(dt);
      }
      prevGripperPos.current.copy(curGripperPos);
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const mesh = meshMap.current.get(it.id);
      if (!mesh) continue;

      if (it.id === grabbedId) {
        // Firmly follow gripper tip
        it.position[0] = curGripperPos.x;
        it.position[1] = curGripperPos.y;
        it.position[2] = curGripperPos.z;
        it.velocity[0] = THREE.MathUtils.clamp(gripperVel.current.x * 0.4, -2, 2);
        it.velocity[1] = THREE.MathUtils.clamp(gripperVel.current.y * 0.4, -2, 2);
        it.velocity[2] = THREE.MathUtils.clamp(gripperVel.current.z * 0.4, -2, 2);
        it.state = "grabbed";

        mesh.position.set(it.position[0], it.position[1], it.position[2]);
        mesh.rotation.set(0, 0, 0);
        continue;
      }

      if (it.state === "falling" || it.state === "tumbling") {
        it.velocity[1] += GRAVITY * dt;
        it.position[0] += it.velocity[0] * dt;
        it.position[1] += it.velocity[1] * dt;
        it.position[2] += it.velocity[2] * dt;

        it.rotation[0] += it.angularVelocity[0] * dt;
        it.rotation[1] += it.angularVelocity[1] * dt;
        it.rotation[2] += it.angularVelocity[2] * dt;

        it.velocity[0] *= 0.985;
        it.velocity[2] *= 0.985;
        it.angularVelocity[0] *= 0.96;
        it.angularVelocity[1] *= 0.96;
        it.angularVelocity[2] *= 0.96;

        // 1. Check Pedestal / Tower Stacking Contact (Goal Area)
        const distToPedestal = Math.hypot(
          it.position[0] - PEDESTAL_POS[0],
          it.position[2] - PEDESTAL_POS[2]
        );

        if (it.state === "falling" && distToPedestal < PEDESTAL_RADIUS) {
          // Identify all currently stable stacked items underneath
          const currentStacked = items
            .filter((o) => o.id !== it.id && o.state === "stacked")
            .sort((a, b) => a.position[1] - b.position[1]);

          const topItem =
            currentStacked.length > 0 ? currentStacked[currentStacked.length - 1] : null;

          const targetSurfaceY = topItem
            ? topItem.position[1] + topItem.halfHeight
            : PEDESTAL_SURFACE_Y;

          const landingY = targetSurfaceY + it.halfHeight;

          // Check if item reached the contact surface
          if (it.position[1] <= landingY) {
            it.position[1] = landingY;

            // PYRAMID APEX INSTABILITY: Sharp point cannot support blocks
            if (topItem && topItem.type === "pyramid") {
              playImpactSound(1.2);
              playTumbleSound();

              const slipAngle = Math.random() * Math.PI * 2;
              const slipSpeed = 2.4;
              it.velocity[0] = Math.cos(slipAngle) * slipSpeed;
              it.velocity[1] = 1.4;
              it.velocity[2] = Math.sin(slipAngle) * slipSpeed;
              it.angularVelocity[0] = (Math.random() - 0.5) * 12;
              it.angularVelocity[2] = (Math.random() - 0.5) * 12;
              it.state = "tumbling";

              onStackEvent({
                type: "pyramid_slip",
                stackCount: currentStacked.length,
                message: "Pyramid apex cannot support blocks! Top block slipped off.",
              });
            } else {
              // CENTER OF GRAVITY & OFF-CENTER CALCULATION
              const baseCenter = topItem
                ? [topItem.position[0], topItem.position[2]]
                : [PEDESTAL_POS[0], PEDESTAL_POS[2]];

              const offsetFromBase = Math.hypot(
                it.position[0] - baseCenter[0],
                it.position[2] - baseCenter[1]
              );

              const currentLevel = currentStacked.length;
              // Stability tolerance narrows as stack gets taller
              const maxStableOffset = topItem ? Math.max(0.06, 0.12 - currentLevel * 0.015) : 0.38;

              if (offsetFromBase > maxStableOffset) {
                // TOPPLE
                playTumbleSound();

                const toppleAngle = Math.atan2(
                  it.position[2] - baseCenter[1],
                  it.position[0] - baseCenter[0]
                );
                it.velocity[0] = Math.cos(toppleAngle) * 2.2;
                it.velocity[1] = 0.8;
                it.velocity[2] = Math.sin(toppleAngle) * 2.2;
                it.angularVelocity[0] = (Math.random() - 0.5) * 10;
                it.angularVelocity[2] = (Math.random() - 0.5) * 10;
                it.state = "tumbling";

                // Topple underlying tier if hit hard
                if (topItem && currentLevel >= 2 && offsetFromBase > 0.09) {
                  topItem.state = "tumbling";
                  topItem.velocity[0] = Math.cos(toppleAngle) * 1.5;
                  topItem.velocity[1] = 0.6;
                  topItem.velocity[2] = Math.sin(toppleAngle) * 1.5;
                  topItem.angularVelocity[0] = (Math.random() - 0.5) * 8;
                }

                const remainingCount = items.filter((o) => o.state === "stacked").length;
                onStackEvent({
                  type: "toppled",
                  stackCount: remainingCount,
                  message: `Imbalance! Stack height ${currentLevel + 1} toppled over.`,
                });
              } else {
                // PERMANENT STABLE PLACEMENT ON TOWER (Kept forever!)
                it.position[0] = baseCenter[0] * 0.2 + it.position[0] * 0.8;
                it.position[2] = baseCenter[2] * 0.2 + it.position[2] * 0.8;
                it.velocity[0] = 0;
                it.velocity[1] = 0;
                it.velocity[2] = 0;
                it.rotation[0] = 0;
                it.rotation[2] = 0;
                it.angularVelocity[0] = 0;
                it.angularVelocity[1] = 0;
                it.angularVelocity[2] = 0;
                it.state = "stacked";

                playImpactSound(0.8 + currentLevel * 0.25);
                playSuccessChime();

                const newStackCount = currentLevel + 1;
                onStackEvent({
                  type: newStackCount >= 4 ? "victory" : "landed",
                  stackCount: newStackCount,
                  message: `Tower Height: ${newStackCount} Block${newStackCount > 1 ? "s" : ""}!`,
                });
              }
            }
          }
        }
        // 2. Check Pickup Tray Stacking Contact
        else if (
          Math.abs(it.position[0] - TRAY_POS[0]) < 0.38 &&
          Math.abs(it.position[2] - TRAY_POS[2]) < 0.38
        ) {
          // Identify other resting blocks on the tray
          const trayResting = items
            .filter((o) => {
              if (o.id === it.id || o.state === "grabbed" || o.state === "falling" || o.state === "tumbling") return false;
              const dist = Math.hypot(o.position[0] - it.position[0], o.position[2] - it.position[2]);
              return dist < 0.24;
            })
            .sort((a, b) => a.position[1] - b.position[1]);

          const topTrayBlock = trayResting.length > 0 ? trayResting[trayResting.length - 1] : null;
          const traySurfaceY = topTrayBlock
            ? topTrayBlock.position[1] + topTrayBlock.halfHeight
            : TRAY_SURFACE_Y;
          const landingY = traySurfaceY + it.halfHeight;

          if (it.position[1] <= landingY) {
            it.position[1] = landingY;
            if (Math.abs(it.velocity[1]) > 0.8) {
              playImpactSound(0.4);
              it.velocity[1] = -it.velocity[1] * 0.2;
              it.velocity[0] *= 0.5;
              it.velocity[2] *= 0.5;
            } else {
              it.velocity[0] = 0;
              it.velocity[1] = 0;
              it.velocity[2] = 0;
              it.angularVelocity[0] = 0;
              it.angularVelocity[1] = 0;
              it.angularVelocity[2] = 0;
              it.state = "idle_tray";
            }
          }
        }
        // 3. General Floor and Ground Block Stacking
        else {
          const groundResting = items
            .filter((o) => {
              if (o.id === it.id || o.state === "grabbed" || o.state === "falling" || o.state === "tumbling") return false;
              const dist = Math.hypot(o.position[0] - it.position[0], o.position[2] - it.position[2]);
              return dist < 0.22;
            })
            .sort((a, b) => a.position[1] - b.position[1]);

          const topGroundBlock = groundResting.length > 0 ? groundResting[groundResting.length - 1] : null;
          const contactBaseY = topGroundBlock
            ? topGroundBlock.position[1] + topGroundBlock.halfHeight
            : FLOOR_Y;
          const landingY = contactBaseY + it.halfHeight;

          if (it.position[1] <= landingY) {
            it.position[1] = landingY;
            if (Math.abs(it.velocity[1]) > 0.8) {
              playImpactSound(0.4);
              it.velocity[1] = -it.velocity[1] * 0.25;
              it.velocity[0] *= 0.6;
              it.velocity[2] *= 0.6;
            } else {
              it.velocity[0] = 0;
              it.velocity[1] = 0;
              it.velocity[2] = 0;
              it.angularVelocity[0] = 0;
              it.angularVelocity[1] = 0;
              it.angularVelocity[2] = 0;
              it.state = "ground_settled";
            }
          }
        }
      }

      // Synchronize 3D Mesh
      mesh.position.set(it.position[0], it.position[1], it.position[2]);
      mesh.rotation.set(it.rotation[0], it.rotation[1], it.rotation[2]);
    }
  });

  return (
    <>
      {itemsRef.current.map((item) => (
        <mesh
          key={item.id}
          ref={(el) => {
            if (el) {
              meshMap.current.set(item.id, el);
              el.userData.__objectId = item.id;
              el.position.set(...item.position);
              el.rotation.set(...item.rotation);
            }
          }}
          castShadow
          receiveShadow
        >
          <ShapeGeometry type={item.type} />
          <meshStandardMaterial
            color={SHAPE_COLORS[item.type]}
            roughness={0.35}
            metalness={0.5}
            emissive={
              item.id === grabbedIdRef.current
                ? SHAPE_COLORS[item.type]
                : item.state === "stacked"
                ? "#0284c7"
                : "#000000"
            }
            emissiveIntensity={
              item.id === grabbedIdRef.current ? 0.45 : item.state === "stacked" ? 0.15 : 0
            }
          />
        </mesh>
      ))}
    </>
  );
}

interface StackingGameProps {
  onBack: () => void;
}

export default function StackingGame({ onBack }: StackingGameProps) {
  const jointRefs = useRef<THREE.Group[]>([]);
  const gripperTipRef = useRef<THREE.Object3D | null>(null);

  const [jointTargets, setJointTargets] = useState([0, -0.3, 0.4, 0, 0, 0]);
  const [isInteracting, setIsInteracting] = useState(false);
  const [controlMode, setControlMode] = useState<"buttons" | "sliders">("buttons");

  const [grabbedId, setGrabbedId] = useState<number | null>(null);
  const [stackCount, setStackCount] = useState(0);
  const [targetGoal] = useState(4);
  const [hasWon, setHasWon] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ text: string; isError: boolean } | null>(null);

  // Authoritative physical data store
  const itemsRef = useRef<PhysicsItem[]>([]);
  const grabbedIdRef = useRef<number | null>(null);
  grabbedIdRef.current = grabbedId;

  // React render trigger
  const [renderTrigger, setRenderTrigger] = useState(0);
  const forceUpdate = useCallback(() => setRenderTrigger((n) => n + 1), []);

  const nextId = useRef(1);

  const showAlert = useCallback((text: string, isError = false) => {
    setStatusBanner({ text, isError });
    setTimeout(() => {
      setStatusBanner((cur) => (cur?.text === text ? null : cur));
    }, 3500);
  }, []);

  // Spawn a block on the tray without removing ANY existing blocks
  const spawnBlock = useCallback(
    (type: ShapeType = "cube") => {
      const id = nextId.current++;
      const halfH = SHAPE_HEIGHTS[type] / 2;

      // Find highest item currently on the tray (if any)
      const trayItems = itemsRef.current.filter((it) => {
        const onTray =
          Math.abs(it.position[0] - TRAY_POS[0]) < 0.35 &&
          Math.abs(it.position[2] - TRAY_POS[2]) < 0.35;
        return onTray && it.state !== "grabbed";
      });

      let spawnY = TRAY_SURFACE_Y + halfH + 0.01;
      if (trayItems.length > 0) {
        const topTrayY = trayItems.reduce(
          (max, it) => Math.max(max, it.position[1] + it.halfHeight),
          spawnY
        );
        spawnY = topTrayY + halfH + 0.02;
      }

      const newItem: PhysicsItem = {
        id,
        type,
        position: [TRAY_POS[0], spawnY, TRAY_POS[2]],
        velocity: [0, 0, 0],
        rotation: [0, 0, 0],
        angularVelocity: [0, 0, 0],
        state: "idle_tray",
        halfHeight: halfH,
      };

      // KEEP ALL BLOCKS - Never filter or remove!
      itemsRef.current = [...itemsRef.current, newItem];
      forceUpdate();
    },
    [forceUpdate]
  );

  // Handle physics events from the 3D scene
  const handleStackEvent = useCallback(
    (event: {
      type: "landed" | "pyramid_slip" | "toppled" | "victory";
      stackCount: number;
      message?: string;
    }) => {
      setStackCount(event.stackCount);

      if (event.type === "pyramid_slip") {
        showAlert(event.message || "Pyramid apex cannot support blocks!", true);
        setTimeout(() => spawnBlock("cube"), 600);
      } else if (event.type === "toppled") {
        showAlert(event.message || "Imbalance! Tower toppled over.", true);
        setTimeout(() => spawnBlock("cube"), 600);
      } else if (event.type === "victory") {
        setHasWon(true);
        showAlert("Tower Master! 4 blocks tall and balanced!", false);
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      } else if (event.type === "landed") {
        if (event.message) showAlert(event.message, false);
        // Automatically spawn next block on tray so player can stack higher
        if (event.stackCount < targetGoal) {
          setTimeout(() => {
            const types: ShapeType[] = ["cube", "cylinder", "cube", "pyramid"];
            const nextType = types[event.stackCount % types.length];
            spawnBlock(nextType);
          }, 450);
        }
      }
    },
    [showAlert, spawnBlock, targetGoal]
  );

  // Initial startup: spawn initial block on tray
  useEffect(() => {
    itemsRef.current = [];
    spawnBlock("cube");
  }, [spawnBlock]);

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

  const handleChangeJoint = useCallback((jointIndex: number, newAngle: number) => {
    setJointTargets((prev) => {
      const next = [...prev];
      const [min, max] = JOINT_LIMITS[jointIndex];
      next[jointIndex] = THREE.MathUtils.clamp(newAngle, min, max);
      return next;
    });
  }, []);

  const handleGrabToggle = useCallback(() => {
    if (grabbedId !== null) {
      // RELEASE / DROP ITEM WITH CONTINUOUS GRAVITY
      playReleaseSound();
      const currentGrabbed = grabbedId;
      setGrabbedId(null);
      grabbedIdRef.current = null;

      const target = itemsRef.current.find((it) => it.id === currentGrabbed);
      if (target) {
        target.state = "falling";
      }
      forceUpdate();
      return;
    }

    // GRAB ITEM: find closest block to gripper tip
    if (!gripperTipRef.current) return;
    const gripperPos = new THREE.Vector3();
    gripperTipRef.current.getWorldPosition(gripperPos);

    let closest: { id: number; dist: number } | null = null;

    itemsRef.current.forEach((item) => {
      if (item.state === "grabbed") return;
      const itemPos = new THREE.Vector3(...item.position);
      const dist = gripperPos.distanceTo(itemPos);

      if (dist < GRAB_DISTANCE && (!closest || dist < closest.dist)) {
        closest = { id: item.id, dist };
      }
    });

    if (closest) {
      const targetId = (closest as any).id;
      setGrabbedId(targetId);
      grabbedIdRef.current = targetId;
      playGrabSound();

      const targetItem = itemsRef.current.find((it) => it.id === targetId);
      if (targetItem) {
        const wasStacked = targetItem.state === "stacked";
        targetItem.state = "grabbed";
        if (wasStacked) {
          const remaining = itemsRef.current.filter((it) => it.state === "stacked").length;
          setStackCount(remaining);
        }
      }
      forceUpdate();
    }
  }, [grabbedId, forceUpdate]);

  const handleReset = useCallback(() => {
    playClickSound();
    setGrabbedId(null);
    grabbedIdRef.current = null;
    setStackCount(0);
    setHasWon(false);
    setStatusBanner(null);
    setJointTargets([0, -0.3, 0.4, 0, 0, 0]);
    itemsRef.current = [];
    forceUpdate();
    setTimeout(() => {
      spawnBlock("cube");
    }, 100);
  }, [forceUpdate, spawnBlock]);

  return (
    <div className="flex flex-col w-full bg-[#0a0a0f] text-white">
      {/* Top 3D Canvas */}
      <div className="relative w-full h-[55vh] min-h-[360px]">
        <Canvas
          shadows
          camera={{ position: [2.8, 3.2, 4.0], fov: 48 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
          className="touch-none"
        >
          <fog attach="fog" args={["#0a0a0f", 8, 20]} />
          <ambientLight intensity={0.25} />
          <directionalLight
            position={[6, 9, 4]}
            intensity={1.6}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-3, 4, -2]} intensity={0.6} color="#38bdf8" />
          <pointLight position={[2, 2, 3]} intensity={0.4} color="#f59e0b" />

          {/* Floor & Grid */}
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0.1} />
          </mesh>
          <gridHelper args={[20, 40, "#1e293b", "#1e293b"]} position={[0, FLOOR_Y + 0.005, 0]} />
          <ContactShadows position={[0, FLOOR_Y + 0.01, 0]} opacity={0.6} scale={10} blur={2} far={4} />

          {/* Pickup Tray (Solid Platform with Stacking Support) */}
          <group position={TRAY_POS}>
            <mesh receiveShadow position={[0, 0, 0]}>
              <boxGeometry args={[0.7, 0.1, 0.7]} />
              <meshStandardMaterial color="#1e293b" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.62, 0.62]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.25} />
            </mesh>
          </group>

          {/* Pedestal with target guide ring */}
          <StackingPedestal
            currentHeight={stackCount}
            targetHeight={targetGoal}
            isUnstable={Boolean(statusBanner?.isError)}
          />

          {/* 6-Axis Robot */}
          <RobotModel
            jointTargets={jointTargets}
            jointRefs={jointRefs}
            isInteracting={isInteracting}
            gripperTipRef={gripperTipRef}
            isGrabbing={grabbedId !== null}
          />

          {/* Live Physics Engine and All Stacked Shapes (Kept permanently in scene) */}
          <StackingSceneObjects
            itemsRef={itemsRef}
            grabbedIdRef={grabbedIdRef}
            gripperTipRef={gripperTipRef}
            onStackEvent={handleStackEvent}
            renderTrigger={renderTrigger}
          />

          <OrbitControls
            enablePan={false}
            minDistance={3.2}
            maxDistance={9}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
            enableDamping
            dampingFactor={0.05}
          />
          <Environment preset="city" />
        </Canvas>

        {/* Title Header Overlay */}
        <div className="absolute top-3 left-3 z-20">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Layers size={16} />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-light text-white tracking-wide">
                Tower Stacking Puzzle
              </h2>
              <p className="text-[10px] text-white/50 font-mono tracking-wider uppercase">
                Continuous Stacking · Pyramids Slip · Center-of-Gravity Balance
              </p>
            </div>
          </div>
        </div>

        {/* Status / Alert Banner */}
        {statusBanner && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-mono shadow-lg transition-all ${
                statusBanner.isError
                  ? "bg-rose-950/80 border-rose-500/50 text-rose-300 shadow-rose-950/40"
                  : "bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-emerald-950/40"
              }`}
            >
              {statusBanner.isError ? <AlertTriangle size={14} /> : <Layers size={14} />}
              <span>{statusBanner.text}</span>
            </div>
          </div>
        )}

        {/* Progress & Score Widget */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 font-mono text-xs">
          <span className="text-slate-400">Tower Height:</span>
          <span className="text-amber-400 font-bold tabular-nums">
            {stackCount} / {targetGoal} Blocks
          </span>
        </div>

        {/* Victory Screen Modal */}
        {hasWon && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="text-center p-6 rounded-2xl bg-slate-900/90 border border-amber-500/40 shadow-2xl max-w-sm w-full">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-3">
                <Trophy size={24} />
              </div>
              <h3 className="text-2xl font-light text-white mb-1">Tower Master!</h3>
              <p className="text-slate-300 font-mono text-xs mb-4">
                You successfully built a {targetGoal}-block tower with true center-of-gravity balance!
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold transition-all shadow-lg shadow-amber-500/20"
                >
                  Build Another
                </button>
                <button
                  onClick={onBack}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs transition-all border border-slate-700"
                >
                  Back to Hub
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="w-full p-3 md:p-4 border-t border-slate-800 bg-[#08080d]">
        <div className="max-w-lg mx-auto space-y-3">
          {/* Top Actions Row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all font-mono text-xs"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>

            {/* Shape spawn buttons */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono px-1 flex items-center gap-0.5">
                <Plus size={10} /> Tray:
              </span>
              <button
                onClick={() => spawnBlock("cube")}
                title="Spawn Cube on Tray"
                className="flex items-center gap-1 px-2 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-mono transition-all"
              >
                <Box size={12} />
                <span>Cube</span>
              </button>
              <button
                onClick={() => spawnBlock("cylinder")}
                title="Spawn Cylinder on Tray"
                className="flex items-center gap-1 px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-mono transition-all"
              >
                <Circle size={12} />
                <span>Cylinder</span>
              </button>
              <button
                onClick={() => spawnBlock("pyramid")}
                title="Spawn Pyramid on Tray"
                className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-mono transition-all"
              >
                <Triangle size={12} />
                <span>Pyramid</span>
              </button>
            </div>

            <div className="flex-1" />

            {/* QoL Toggle: Drag Sliders vs Jog Buttons */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setControlMode("buttons")}
                title="Jog Buttons"
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  controlMode === "buttons"
                    ? "bg-slate-700 text-white font-bold shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <MousePointer size={12} />
                <span className="hidden sm:inline">Jog</span>
              </button>
              <button
                onClick={() => setControlMode("sliders")}
                title="Drag Sliders"
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  controlMode === "sliders"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sliders size={12} />
                <span className="hidden sm:inline">Sliders</span>
              </button>
            </div>

            <button
              onClick={handleGrabToggle}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-mono text-xs tracking-wide font-bold transition-all ${
                grabbedId !== null
                  ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/10"
                  : "bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
              }`}
            >
              <Hand size={14} />
              <span>{grabbedId !== null ? "Release (Fall)" : "Grab Block"}</span>
            </button>

            <button
              onClick={handleReset}
              title="Reset Tower"
              className="flex items-center p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {/* HUD Angles */}
          <JointHUD jointAngles={jointTargets} />

          {/* 6 Joint Controls: Toggle between Jog Buttons or Drag Sliders */}
          {controlMode === "buttons" ? (
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
          ) : (
            <JointSliders
              jointAngles={jointTargets}
              onChangeJoint={handleChangeJoint}
              onInteractionStart={() => setIsInteracting(true)}
              onInteractionEnd={() => setIsInteracting(false)}
            />
          )}

          <p className="text-center text-[10px] text-slate-500 font-mono">
            pick block from tray · place on platform or stacked blocks · build height to 4 to win
          </p>
        </div>
      </div>
    </div>
  );
}
