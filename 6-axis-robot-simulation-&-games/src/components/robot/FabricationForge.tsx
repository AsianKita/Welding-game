import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Sphere, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import {
  RotateCcw,
  Flame,
  CheckCircle2,
  ArrowLeft,
  MousePointer,
  Compass,
  RotateCw,
  Eye,
  Crosshair,
  Send,
  Trash2,
  Zap,
  Settings2,
  Sliders,
  Sparkles,
  Layers,
  Minimize2,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Layout,
  Plus,
  Minus,
  Target,
  Wrench,
} from 'lucide-react';
import {
  playImpactSound,
  playSuccessChime,
  playClickSound,
  playIngotTossSound,
  playLavaBubbleSound,
  playMoltenPourSound,
  playSteamHissSound,
  playServoJogSound,
  playArcStrikeSound,
  startWeldingSoundLoop,
  stopWeldingSoundLoop,
} from '../../../robot/audio';
import WeldDial from './WeldDial';
import { WeldDebugTool } from './WeldDebugTool';
import {
  RoboDKWeldSettings,
  ROBODK_DEFAULT_SETTINGS,
  WeldBeadStyle,
} from './weldManagerTypes';
import {
  WireProfile,
  DEFAULT_WIRE_PROFILES,
  normalizeWireProfile,
  ArcStatus,
  TravelStatus,
  WeldHealth,
} from './weldProfiles';
import { useDebugSettings } from '../../hooks/useDebugSettings';
import { useWeldAudio } from '../../hooks/useWeldAudio';
import { useWeldPhysics } from '../../hooks/useWeldPhysics';
import { WeldSpatter } from './WeldSpatter';

export interface FabricationForgeProps {
  onBack?: () => void;
  onPathConfirmed?: (shape: THREE.Shape, weldPath: THREE.Vector3[]) => void;
  onShapeCreated?: (shapeGroup: THREE.Group) => void;
}

// 3X Table Dimensions: (3.75m wide x 2.55m deep)
const TABLE_CENTER: [number, number, number] = [0, -0.2, 0];
const TABLE_WIDTH = 3.75;
const TABLE_DEPTH = 2.55;
const TABLE_SURFACE_Y = -0.2;
const WORKPIECE_DEPTH = 0.25;
const WORKPIECE_BEVEL = 0.02;
const WORKPIECE_TOP_Y = TABLE_SURFACE_Y + WORKPIECE_DEPTH + WORKPIECE_BEVEL; // 0.07m top surface
const DRAW_PLANE_Y = TABLE_SURFACE_Y + 0.005;

// Heavy Industrial Table 3D Model
function TableModel() {
  return (
    <group position={TABLE_CENTER}>
      {/* Heavy Precision Steel Tabletop Platter */}
      <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[TABLE_WIDTH, 0.12, TABLE_DEPTH]} />
        <meshStandardMaterial color="#1b2434" metalness={0.88} roughness={0.32} />
      </mesh>

      {/* Perimeter Beveled Border Trim */}
      <mesh position={[0, 0.001, 0]}>
        <boxGeometry args={[TABLE_WIDTH - 0.04, 0.002, TABLE_DEPTH - 0.04]} />
        <meshStandardMaterial color="#0f172a" metalness={0.92} roughness={0.18} />
      </mesh>

      {/* Engineering Coordinate Precision Grid across 3X Tabletop */}
      <gridHelper
        args={[TABLE_WIDTH * 0.96, 24, '#38bdf8', '#334155']}
        position={[0, 0.003, 0]}
      />

      {/* Laser-Etched Table Fixture Matrix Holes */}
      <group position={[0, 0.004, 0]}>
        {[-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5].map((x) =>
          [-1.0, -0.5, 0, 0.5, 1.0].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.025, 16]} />
              <meshBasicMaterial color="#0284c7" transparent opacity={0.65} />
            </mesh>
          ))
        )}
      </group>

      {/* Worktable Outer Safety Amber Glow Boundary */}
      <lineSegments position={[0, 0.006, 0]}>
        <edgesGeometry
          args={[new THREE.BoxGeometry(TABLE_WIDTH * 0.96, 0.001, TABLE_DEPTH * 0.94)]}
        />
        <lineBasicMaterial color="#f59e0b" transparent opacity={0.65} />
      </lineSegments>

      {/* 4 Corner Tubular Steel Support Legs */}
      {[
        [-TABLE_WIDTH / 2 + 0.14, -0.4, -TABLE_DEPTH / 2 + 0.14],
        [TABLE_WIDTH / 2 - 0.14, -0.4, -TABLE_DEPTH / 2 + 0.14],
        [-TABLE_WIDTH / 2 + 0.14, -0.4, TABLE_DEPTH / 2 - 0.14],
        [TABLE_WIDTH / 2 - 0.14, -0.4, TABLE_DEPTH / 2 - 0.14],
      ].map((pos, idx) => (
        <group key={idx} position={pos as [number, number, number]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.65, 20]} />
            <meshStandardMaterial color="#0b1120" metalness={0.75} roughness={0.45} />
          </mesh>
          {/* Base Leveler Footpad */}
          <mesh position={[0, -0.32, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.04, 20]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.7} roughness={0.25} />
          </mesh>
        </group>
      ))}

      {/* Lower Structural Subframe */}
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[TABLE_WIDTH - 0.24, 0.07, TABLE_DEPTH - 0.24]} />
        <meshStandardMaterial color="#080e1a" metalness={0.65} roughness={0.6} />
      </mesh>
    </group>
  );
}

// Spark and Droplet Particles for Molten Metal Pour
function MoltenSplashParticles({
  active,
  position,
}: {
  active: boolean;
  position: [number, number, number];
}) {
  const particlesRef = useRef<THREE.Group>(null);
  const particleData = useMemo(() => {
    return Array.from({ length: 24 }).map(() => ({
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 1.8,
        Math.random() * 2.2 + 0.5,
        (Math.random() - 0.5) * 1.8
      ),
      size: Math.random() * 0.03 + 0.015,
      life: Math.random() * 0.5 + 0.2,
      maxLife: Math.random() * 0.5 + 0.2,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!particlesRef.current) return;
    if (!active) {
      particlesRef.current.visible = false;
      return;
    }
    particlesRef.current.visible = true;

    particlesRef.current.children.forEach((child, i) => {
      const p = particleData[i];
      if (!p) return;
      p.life -= delta;
      if (p.life <= 0) {
        p.life = p.maxLife;
        p.pos.set(
          (Math.random() - 0.5) * 0.1,
          0.02,
          (Math.random() - 0.5) * 0.1
        );
        p.vel.set(
          (Math.random() - 0.5) * 1.8,
          Math.random() * 2.2 + 0.5,
          (Math.random() - 0.5) * 1.8
        );
      } else {
        p.vel.y -= delta * 9.8;
        p.pos.addScaledVector(p.vel, delta);
        if (p.pos.y < 0.01) {
          p.pos.y = 0.01;
          p.vel.y *= -0.3;
        }
      }
      child.position.copy(p.pos);
      const progress = p.life / p.maxLife;
      const s = p.size * progress;
      child.scale.set(s, s, s);
    });
  });

  return (
    <group position={position} ref={particlesRef} visible={active}>
      {particleData.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color="#ffcc00" />
        </mesh>
      ))}
    </group>
  );
}

// Burn-Through crater holes left on workpiece when travel speed is critically slow
function BurnThroughHoles({ burnHoles }: { burnHoles: THREE.Vector3[] }) {
  if (!burnHoles || burnHoles.length === 0) return null;

  return (
    <group>
      {burnHoles.map((holePos, idx) => (
        <group key={idx} position={[holePos.x, WORKPIECE_TOP_Y + 0.001, holePos.z]}>
          {/* Inner dark charred void */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.038, 20]} />
            <meshStandardMaterial color="#050505" roughness={0.98} metalness={0.05} />
          </mesh>
          {/* Outer glowing molten crater rim */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]}>
            <ringGeometry args={[0.034, 0.056, 20]} />
            <meshStandardMaterial
              color="#dc2626"
              emissive="#ff3700"
              emissiveIntensity={4.2}
              roughness={0.3}
            />
          </mesh>
          {/* Sub-surface drop hole cone */}
          <mesh position={[0, -0.04, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.036, 0.08, 16]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.95} metalness={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Dynamic Welding Arc & Sparks at the Robot's J6 Tool Tip
function WeldingArcSparks({
  active,
  voltage,
  wireFeed,
  weldHealth = 'perfect',
  arcStatus = 'stable_spray',
  travelStatus = 'good_speed',
}: {
  active: boolean;
  voltage: number;
  wireFeed: number;
  weldHealth?: WeldHealth;
  arcStatus?: ArcStatus;
  travelStatus?: TravelStatus;
}) {
  const sparksRef = useRef<THREE.Group>(null);
  const flashCoreRef = useRef<THREE.Mesh>(null);
  const flashGlowRef = useRef<THREE.Mesh>(null);
  const puddleRef = useRef<THREE.Mesh>(null);
  const arcColumnRef = useRef<THREE.Mesh>(null);
  const puddleMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const sparkData = useMemo(() => {
    return Array.from({ length: 42 }).map(() => ({
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(0, 0, 0),
      size: Math.random() * 0.012 + 0.005,
      life: Math.random() * 0.35 + 0.05,
      maxLife: Math.random() * 0.35 + 0.05,
    }));
  }, []);

  useFrame((state, delta) => {
    if (!active) {
      if (sparksRef.current) sparksRef.current.visible = false;
      if (flashCoreRef.current) flashCoreRef.current.visible = false;
      if (flashGlowRef.current) flashGlowRef.current.visible = false;
      if (puddleRef.current) puddleRef.current.visible = false;
      if (arcColumnRef.current) arcColumnRef.current.visible = false;
      return;
    }

    if (sparksRef.current) sparksRef.current.visible = true;
    if (flashCoreRef.current) flashCoreRef.current.visible = true;
    if (flashGlowRef.current) flashGlowRef.current.visible = true;
    if (puddleRef.current) puddleRef.current.visible = true;
    if (arcColumnRef.current) arcColumnRef.current.visible = true;

    // Animate sparks bursting outward from arc strike
    if (sparksRef.current) {
      sparksRef.current.children.forEach((child, i) => {
        const p = sparkData[i];
        if (!p) return;
        p.life -= delta;
        if (p.life <= 0) {
          p.life = p.maxLife;
          p.pos.set(
            (Math.random() - 0.5) * 0.012,
            0.002 + (Math.random() - 0.5) * 0.006,
            (Math.random() - 0.5) * 0.012
          );
          const spread = (voltage / 19.5) * 2.2;
          p.vel.set(
            (Math.random() - 0.5) * spread,
            Math.random() * 2.0 + 0.6,
            (Math.random() - 0.5) * spread
          );
        } else {
          p.vel.y -= delta * 8.5;
          p.pos.addScaledVector(p.vel, delta);
        }
        child.position.copy(p.pos);
        const ratio = Math.max(0, p.life / p.maxLife);
        const s = p.size * ratio;
        child.scale.set(s, s, s);
      });
    }

    // High frequency electric arc flicker
    const time = state.clock.elapsedTime;
    const flicker = 0.82 + Math.sin(time * 90) * 0.22 + (Math.random() - 0.5) * 0.28;
    if (flashCoreRef.current) {
      const coreScale = Math.max(0.008, flicker * 0.024);
      flashCoreRef.current.scale.set(coreScale, coreScale * 1.3, coreScale);
    }
    if (flashGlowRef.current) {
      const glowScale = Math.max(0.015, flicker * 0.055);
      flashGlowRef.current.scale.set(glowScale, glowScale, glowScale);
    }
    if (arcColumnRef.current) {
      const colW = Math.max(0.004, flicker * 0.01);
      arcColumnRef.current.scale.set(colW, 0.035, colW);
    }
    // Pulsing molten weld puddle trailing directly behind the arc
    if (puddleRef.current) {
      const pRadius = THREE.MathUtils.clamp(
        0.032 * Math.sqrt(wireFeed / 300) * (0.94 + Math.sin(time * 30) * 0.06),
        0.02,
        0.065
      );
      puddleRef.current.scale.set(pRadius, 0.006, pRadius * 1.25);
    }

    // Material override for puddle based on weld health
    if (puddleMatRef.current) {
      if (arcStatus === 'too_cold_stubbing' || weldHealth === 'too_cold') {
        puddleMatRef.current.emissiveIntensity = 1.6;
        puddleMatRef.current.emissive.set('#ea580c');
      } else if (arcStatus === 'too_hot_globular' || weldHealth === 'too_hot') {
        puddleMatRef.current.emissiveIntensity = 6.8;
        puddleMatRef.current.emissive.set('#fef08a');
      } else {
        puddleMatRef.current.emissiveIntensity = 4.8;
        puddleMatRef.current.emissive.set('#ff8800');
      }
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Intense Center Arc Plasma Flash at the wire-workpiece interface */}
      <mesh ref={flashCoreRef} position={[0, 0.01, 0]} visible={false}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Plasma Arc Column connecting wire tip to weld puddle */}
      <mesh ref={arcColumnRef} position={[0, 0.025, 0]} visible={false}>
        <cylinderGeometry args={[1, 0.6, 1, 10]} />
        <meshBasicMaterial color="#a5f3fc" transparent opacity={0.88} depthWrite={false} />
      </mesh>

      {/* Secondary Brilliant Cyan/Blue Arc Plasma Glow */}
      <mesh ref={flashGlowRef} position={[0, 0.01, 0]} visible={false}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} depthWrite={false} />
      </mesh>

      {/* Molten Liquid Weld Pool / Puddle close behind contact point */}
      <mesh ref={puddleRef} position={[0, 0.003, -0.012]} rotation={[0, 0, 0]} visible={false}>
        <cylinderGeometry args={[1, 1, 1, 20]} />
        <meshStandardMaterial
          ref={puddleMatRef}
          color="#ff3b00"
          emissive="#ff8800"
          emissiveIntensity={4.8}
          roughness={0.12}
          metalness={0.92}
        />
      </mesh>

      {/* Standard Root Penetration Cone & Heat Affected Zone for Stable Spray */}
      {active && arcStatus === 'stable_spray' && weldHealth !== 'too_cold' && (
        <group position={[0, -0.003, -0.012]}>
          <mesh position={[0, -0.016, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.045, 0.035, 16]} />
            <meshStandardMaterial
              color="#ff4400"
              emissive="#ff5500"
              emissiveIntensity={3.5}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
          <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.07, 20]} />
            <meshBasicMaterial color="#dc2626" transparent opacity={0.65} depthWrite={false} />
          </mesh>
        </group>
      )}

      {/* Massive 3x Wide Undercut Root Penetration Cone & Expanded Cherry Red HAZ when Arc is Too Hot */}
      {active && (arcStatus === 'too_hot_globular' || weldHealth === 'too_hot') && (
        <group position={[0, -0.005, -0.015]}>
          {/* Deep, 3x wide molten penetration crater cone */}
          <mesh position={[0, -0.048, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.18, 0.12, 24]} />
            <meshStandardMaterial
              color="#ff2200"
              emissive="#ff4400"
              emissiveIntensity={9.5}
              roughness={0.10}
              metalness={0.95}
            />
          </mesh>
          {/* Broad expanded glowing Heat-Affected Zone (HAZ) - 3x wider */}
          <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.26, 32]} />
            <meshBasicMaterial color="#dc2626" transparent opacity={0.90} depthWrite={false} />
          </mesh>
          {/* Molten undercut pool edge */}
          <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.10, 0.20, 28]} />
            <meshBasicMaterial color="#ff7700" transparent opacity={0.82} depthWrite={false} />
          </mesh>
        </group>
      )}
      {/* For too_cold_stubbing: Zero penetration cone is rendered under the workpiece (cold welds do not penetrate) */}

      {/* Dynamic Intense Weld Flash Lighting */}
      {active && (
        <>
          <pointLight
            position={[0, 0.06, 0]}
            color="#7dd3fc"
            intensity={arcStatus === 'too_hot_globular' || weldHealth === 'too_hot' ? 6.5 : 4.5}
            distance={2.5}
          />
          <pointLight
            position={[0, 0.02, -0.02]}
            color="#ff7700"
            intensity={arcStatus === 'too_hot_globular' || weldHealth === 'too_hot' ? 4.5 : 3.0}
            distance={1.8}
          />
        </>
      )}

      {/* Trajectory micro-sparks */}
      <group ref={sparksRef} visible={false}>
        {sparkData.map((_, i) => (
          <mesh key={i} scale={[0, 0, 0]}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshBasicMaterial color={i % 3 === 0 ? '#ffffff' : i % 2 === 0 ? '#fef08a' : '#f59e0b'} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Rising Steam Puffs when metal is cooling
function SteamPuffParticles({
  active,
  position,
}: {
  active: boolean;
  position: [number, number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const steamData = useMemo(() => {
    return Array.from({ length: 18 }).map(() => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        Math.random() * 0.2,
        (Math.random() - 0.5) * 0.6
      ),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        Math.random() * 0.8 + 0.4,
        (Math.random() - 0.5) * 0.2
      ),
      size: Math.random() * 0.08 + 0.05,
      life: Math.random(),
      maxLife: 1.2,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (!active) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    groupRef.current.children.forEach((child, i) => {
      const s = steamData[i];
      if (!s) return;
      s.life -= delta;
      if (s.life <= 0) {
        s.life = s.maxLife;
        s.pos.set(
          (Math.random() - 0.5) * 0.8,
          0.05,
          (Math.random() - 0.5) * 0.8
        );
      } else {
        s.pos.addScaledVector(s.vel, delta);
      }
      child.position.copy(s.pos);
      const ratio = 1 - s.life / s.maxLife;
      const currentScale = s.size * (1 + ratio * 2.2);
      child.scale.set(currentScale, currentScale, currentScale);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = Math.max(0, (1 - ratio) * 0.45);
      }
    });
  });

  return (
    <group position={position} ref={groupRef} visible={active}>
      {steamData.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// 3D Metal Ingots that fly and toss into the giant foundry cauldron
function MetalIngotsToss({
  smeltTimeRef,
  cauldronPos,
}: {
  smeltTimeRef: React.MutableRefObject<number>;
  cauldronPos: THREE.Vector3;
}) {
  const ingotGroupRef = useRef<THREE.Group>(null);
  const audioPlayedRef = useRef<Record<number, boolean>>({});

  const ingots = useMemo(() => {
    return [
      { id: 0, startT: 0.2, endT: 0.85, startPos: new THREE.Vector3(-2.4, 3.4, -1.2), rotSpeed: [6, 4, 3] },
      { id: 1, startT: 0.65, endT: 1.3, startPos: new THREE.Vector3(2.6, 3.6, -1.0), rotSpeed: [-5, 6, -4] },
      { id: 2, startT: 1.1, endT: 1.75, startPos: new THREE.Vector3(-2.0, 3.8, 1.4), rotSpeed: [4, -5, 7] },
    ];
  }, []);

  useFrame(() => {
    if (!ingotGroupRef.current) return;
    const smeltTime = smeltTimeRef.current;

    ingots.forEach((ingot, idx) => {
      const mesh = ingotGroupRef.current?.children[idx] as THREE.Mesh;
      if (!mesh) return;

      if (smeltTime < ingot.startT || smeltTime > ingot.endT + 0.1) {
        mesh.visible = false;
        return;
      }

      mesh.visible = true;
      const progress = THREE.MathUtils.clamp(
        (smeltTime - ingot.startT) / (ingot.endT - ingot.startT),
        0,
        1
      );

      const targetPos = cauldronPos.clone().add(new THREE.Vector3(0, 0.45, 0));
      const currentPos = new THREE.Vector3().lerpVectors(ingot.startPos, targetPos, progress);
      const arcHeight = Math.sin(progress * Math.PI) * 1.2;
      currentPos.y += arcHeight;

      mesh.position.copy(currentPos);
      mesh.rotation.x = progress * ingot.rotSpeed[0] * Math.PI;
      mesh.rotation.y = progress * ingot.rotSpeed[1] * Math.PI;
      mesh.rotation.z = progress * ingot.rotSpeed[2] * Math.PI;

      if (progress >= 0.95 && !audioPlayedRef.current[ingot.id]) {
        audioPlayedRef.current[ingot.id] = true;
        playIngotTossSound();
      }
    });
  });

  return (
    <group ref={ingotGroupRef}>
      {ingots.map((ingot) => (
        <group key={ingot.id} visible={false}>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.11, 0.13]} />
            <meshStandardMaterial
              color="#cbd5e1"
              metalness={0.95}
              roughness={0.2}
              envMapIntensity={2.0}
            />
          </mesh>
          <mesh position={[0, 0.056, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.16, 0.06]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Giant Molten Cauldron Pot (Foundry Crucible) with Bubbling Lava & Overhead Gantry
function GiantFoundryCauldron({
  smeltTimeRef,
  targetCentroid,
}: {
  smeltTimeRef: React.MutableRefObject<number>;
  targetCentroid: THREE.Vector3;
}) {
  const potGroupRef = useRef<THREE.Group>(null);
  const potBodyRef = useRef<THREE.Group>(null);
  const lavaMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const bubblesGroupRef = useRef<THREE.Group>(null);
  const nextBubbleSoundRef = useRef(0);

  const bubbleSeeds = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      angle: (i * Math.PI * 2) / 8 + Math.random() * 0.4,
      radius: Math.random() * 0.3 + 0.05,
      speed: Math.random() * 3 + 2.5,
      offset: Math.random() * Math.PI * 2,
      baseScale: Math.random() * 0.04 + 0.035,
    }));
  }, []);

  useFrame((state) => {
    if (!potGroupRef.current || !potBodyRef.current) return;
    const smeltTime = smeltTimeRef.current;

    const stagingPos = new THREE.Vector3(
      targetCentroid.x - 0.4,
      2.1,
      targetCentroid.z - 0.9
    );
    const pourPosition = new THREE.Vector3(
      targetCentroid.x,
      1.35,
      targetCentroid.z - 0.62
    );

    let currentPos = new THREE.Vector3();
    let currentTilt = 0;

    if (smeltTime < 1.8) {
      currentPos.copy(stagingPos);
      currentPos.y += Math.sin(state.clock.elapsedTime * 3) * 0.03;
      currentTilt = 0;
    } else if (smeltTime < 3.0) {
      const p = THREE.MathUtils.smoothstep(smeltTime, 1.8, 3.0);
      currentPos.lerpVectors(stagingPos, pourPosition, p);
      currentTilt = 0;
    } else if (smeltTime < 5.4) {
      currentPos.copy(pourPosition);
      const tiltProg = THREE.MathUtils.smoothstep(smeltTime, 3.0, 3.8);
      const returnProg = THREE.MathUtils.smoothstep(smeltTime, 4.8, 5.4);
      currentTilt = (tiltProg * 1.05) * (1 - returnProg);
    } else {
      const returnProg = THREE.MathUtils.smoothstep(smeltTime, 5.4, 6.8);
      const exitPos = new THREE.Vector3(targetCentroid.x, 3.0, targetCentroid.z - 1.6);
      currentPos.lerpVectors(pourPosition, exitPos, returnProg);
      currentTilt = 0;
    }

    potGroupRef.current.position.copy(currentPos);
    potBodyRef.current.rotation.x = currentTilt;

    if (bubblesGroupRef.current) {
      const time = state.clock.elapsedTime;
      bubblesGroupRef.current.children.forEach((child, i) => {
        const seed = bubbleSeeds[i];
        if (!seed) return;
        const cycle = (time * seed.speed + seed.offset) % (Math.PI * 2);
        const bubbleHeight = Math.sin(cycle);

        if (bubbleHeight > 0) {
          child.visible = true;
          const scale = seed.baseScale * (0.3 + bubbleHeight * 1.2);
          child.scale.set(scale, scale * 1.3, scale);
          child.position.set(
            Math.cos(seed.angle + time * 0.2) * seed.radius,
            0.32 + bubbleHeight * 0.05,
            Math.sin(seed.angle + time * 0.2) * seed.radius
          );

          if (
            smeltTime >= 1.2 &&
            smeltTime <= 3.8 &&
            bubbleHeight > 0.95 &&
            state.clock.elapsedTime > nextBubbleSoundRef.current
          ) {
            nextBubbleSoundRef.current = state.clock.elapsedTime + 0.35;
            playLavaBubbleSound();
          }
        } else {
          child.visible = false;
        }
      });
    }

    if (lavaMatRef.current) {
      const heatIntensity =
        smeltTime < 1.5
          ? THREE.MathUtils.lerp(1.5, 3.5, smeltTime / 1.5)
          : smeltTime < 4.8
          ? 3.8 + Math.sin(state.clock.elapsedTime * 8) * 0.5
          : THREE.MathUtils.lerp(3.8, 1.0, (smeltTime - 4.8) / 2.0);

      lavaMatRef.current.emissiveIntensity = heatIntensity;
    }
  });

  return (
    <group ref={potGroupRef}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 1.4, 8]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <torusGeometry args={[0.07, 0.025, 12, 24, Math.PI * 1.5]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.3} />
      </mesh>

      <group ref={potBodyRef}>
        <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.48, 0.035, 12, 24, Math.PI]} />
          <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.3} />
        </mesh>

        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.44, 0.32, 0.65, 24]} />
          <meshStandardMaterial
            color="#1e293b"
            metalness={0.85}
            roughness={0.35}
          />
        </mesh>

        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.47, 0.47, 0.07, 24]} />
          <meshStandardMaterial color="#0f172a" metalness={0.92} roughness={0.2} />
        </mesh>

        <group position={[0, 0.32, 0.42]} rotation={[-0.35, 0, 0]}>
          <mesh castShadow>
            <coneGeometry args={[0.16, 0.22, 16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.06, 0.02]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial
              color="#ff4400"
              emissive="#ff3300"
              emissiveIntensity={2.5}
            />
          </mesh>
        </group>

        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.445, 0.445, 0.12, 24]} />
          <meshStandardMaterial
            color="#f59e0b"
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>

        <mesh position={[0, 0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.41, 24]} />
          <meshStandardMaterial
            ref={lavaMatRef}
            color="#ff4500"
            emissive="#ff8800"
            emissiveIntensity={3.2}
            roughness={0.1}
          />
        </mesh>

        <pointLight
          position={[0, 0.45, 0]}
          color="#ff7700"
          intensity={3.5}
          distance={3.5}
        />

        <group ref={bubblesGroupRef}>
          {bubbleSeeds.map((_, idx) => (
            <mesh key={idx}>
              <sphereGeometry args={[1, 12, 12]} />
              <meshStandardMaterial
                color="#ffaa00"
                emissive="#ff4400"
                emissiveIntensity={4.0}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

// Glowing Stream of Molten Metal Pouring Down from Cauldron into the Mold
function MoltenPourStream({
  smeltTimeRef,
  targetCentroid,
}: {
  smeltTimeRef: React.MutableRefObject<number>;
  targetCentroid: THREE.Vector3;
}) {
  const streamMeshRef = useRef<THREE.Mesh>(null);
  const streamMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const soundPlayedRef = useRef(false);
  const isPouringRef = useRef(false);

  useFrame((state) => {
    if (!streamMeshRef.current || !streamMatRef.current) return;
    const smeltTime = smeltTimeRef.current;
    const isPouring = smeltTime >= 3.3 && smeltTime <= 5.2;
    isPouringRef.current = isPouring;

    if (isPouring && !soundPlayedRef.current) {
      soundPlayedRef.current = true;
      playMoltenPourSound();
    } else if (smeltTime < 0.5) {
      soundPlayedRef.current = false;
    }

    if (!isPouring) {
      streamMeshRef.current.visible = false;
      return;
    }

    streamMeshRef.current.visible = true;

    const spoutPos = new THREE.Vector3(
      targetCentroid.x,
      1.15,
      targetCentroid.z - 0.22
    );
    const targetPos = targetCentroid.clone().setY(TABLE_SURFACE_Y + 0.02);

    const dir = new THREE.Vector3().subVectors(targetPos, spoutPos);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(spoutPos, targetPos).multiplyScalar(0.5);

    streamMeshRef.current.position.copy(mid);
    streamMeshRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    const streamScale = THREE.MathUtils.smoothstep(smeltTime, 3.3, 3.7) * (1 - THREE.MathUtils.smoothstep(smeltTime, 4.8, 5.2));
    const widthNoise = 1 + Math.sin(state.clock.elapsedTime * 24) * 0.18;
    streamMeshRef.current.scale.set(streamScale * widthNoise, len, streamScale * widthNoise);

    streamMatRef.current.emissiveIntensity = 3.5 + Math.sin(state.clock.elapsedTime * 15) * 0.8;
  });

  return (
    <group>
      <mesh ref={streamMeshRef} visible={false}>
        <cylinderGeometry args={[0.045, 0.065, 1, 16]} />
        <meshStandardMaterial
          ref={streamMatRef}
          color="#ff3b00"
          emissive="#ffaa00"
          emissiveIntensity={3.5}
        />
      </mesh>

      <MoltenSplashParticles
        active={true}
        position={[targetCentroid.x, TABLE_SURFACE_Y + 0.02, targetCentroid.z]}
      />
    </group>
  );
}

// Stage 3: Robotic 6-DOF Welder Arm & J6 Torch End-Effector Assembly
function RoboticWelderTool({
  toolGroupRef,
  isArcActive,
  voltage,
  wireFeed,
  weldHealth = 'perfect',
  arcStatus = 'stable_spray',
  travelStatus = 'good_speed',
}: {
  toolGroupRef: React.RefObject<THREE.Group>;
  isArcActive: boolean;
  voltage: number;
  wireFeed: number;
  weldHealth?: WeldHealth;
  arcStatus?: ArcStatus;
  travelStatus?: TravelStatus;
}) {
  return (
    <group ref={toolGroupRef}>
      {/* Overhead J5-J6 Robot Wrist Mount Coupler */}
      <group position={[0, 0.42, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.12, 20]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.08, 16]} />
          <meshStandardMaterial color="#eab308" metalness={0.8} roughness={0.35} />
        </mesh>
      </group>

      {/* Industrial MIG/TIG Swan Neck Torch Body angled down toward contact point */}
      <group position={[0, 0.22, -0.04]} rotation={[0.35, 0, 0]}>
        {/* Insulated Torch Handle Cylinder */}
        <mesh castShadow position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.18, 16]} />
          <meshStandardMaterial color="#1e293b" roughness={0.7} />
        </mesh>
        {/* Copper Gas Shroud & Contact Tip */}
        <mesh position={[0, -0.06, 0.02]} rotation={[0.3, 0, 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.02, 0.09, 16]} />
          <meshStandardMaterial color="#b45309" metalness={0.95} roughness={0.15} />
        </mesh>
        {/* Solid Wire Electrode protruding right above workpiece */}
        <mesh position={[0, -0.135, 0.045]} rotation={[0.3, 0, 0]}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.06, 8]} />
          <meshStandardMaterial
            color={isArcActive ? '#ffffff' : '#e2e8f0'}
            emissive={isArcActive ? '#93c5fd' : '#000000'}
            emissiveIntensity={isArcActive ? 4.5 : 0}
            metalness={0.95}
            roughness={0.1}
          />
        </mesh>
      </group>

      {/* Live Plasma Arc, Sparks & Molten Pool at exact wire tip contact */}
      <WeldingArcSparks
        active={isArcActive}
        voltage={voltage}
        wireFeed={wireFeed}
        weldHealth={weldHealth}
        arcStatus={arcStatus}
        travelStatus={travelStatus}
      />

      {/* Dynamic Spatter Particle System */}
      <WeldSpatter
        active={isArcActive}
        weldHealth={weldHealth}
        voltage={voltage}
      />
    </group>
  );
}

// Camera Director Component to manage smooth angled zoom & orientation with free user control
function CameraDirector({
  phase,
  cameraMode,
  controlsRef,
}: {
  phase: 'draw' | 'smelt' | 'done' | 'plan_path' | 'execute';
  cameraMode: 'isometric' | 'top' | 'front';
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const prevPhaseRef = useRef(phase);
  const prevCameraModeRef = useRef(cameraMode);
  const isAnimatingRef = useRef(false);
  const targetCamPosRef = useRef(new THREE.Vector3(0, 5.0, 0.001));
  const targetLookAtRef = useRef(new THREE.Vector3(0, TABLE_SURFACE_Y, 0));
  const animationDurationRef = useRef(1.2);
  const animationTimeRef = useRef(0);

  const startAnimation = (pos: THREE.Vector3, lookAt: THREE.Vector3, duration = 1.0) => {
    targetCamPosRef.current.copy(pos);
    targetLookAtRef.current.copy(lookAt);
    animationDurationRef.current = duration;
    animationTimeRef.current = 0;
    isAnimatingRef.current = true;
  };

  // When the user starts manually orbiting or panning, immediately release automated camera control
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || typeof controls.addEventListener !== 'function') return;
    const handleStart = () => {
      isAnimatingRef.current = false;
    };
    controls.addEventListener('start', handleStart);
    return () => {
      if (controls && typeof controls.removeEventListener === 'function') {
        controls.removeEventListener('start', handleStart);
      }
    };
  }, [controlsRef]);

  // Trigger smooth transition once when phase changes
  useEffect(() => {
    if (phase !== prevPhaseRef.current) {
      if (phase === 'smelt') {
        startAnimation(new THREE.Vector3(3.8, 3.8, 4.2), new THREE.Vector3(0, 0.4, 0), 1.5);
      } else if (phase === 'plan_path') {
        startAnimation(new THREE.Vector3(2.4, 2.5, 2.6), new THREE.Vector3(0, TABLE_SURFACE_Y + 0.1, 0), 1.0);
      } else if (phase === 'execute') {
        startAnimation(new THREE.Vector3(2.2, 2.3, 2.5), new THREE.Vector3(0, TABLE_SURFACE_Y + 0.12, 0), 1.0);
      } else if (phase === 'draw') {
        startAnimation(new THREE.Vector3(0, 5.0, 0.001), new THREE.Vector3(0, TABLE_SURFACE_Y, 0), 0.8);
      }
      prevPhaseRef.current = phase;
    }
  }, [phase]);

  // Trigger smooth transition once when user clicks a camera mode button
  useEffect(() => {
    if (cameraMode !== prevCameraModeRef.current) {
      if (cameraMode === 'top') {
        startAnimation(new THREE.Vector3(0, 5.0, 0.001), new THREE.Vector3(0, TABLE_SURFACE_Y, 0), 0.8);
      } else if (cameraMode === 'front') {
        startAnimation(new THREE.Vector3(0, 2.2, 4.2), new THREE.Vector3(0, TABLE_SURFACE_Y + 0.2, 0), 0.8);
      } else if (cameraMode === 'isometric') {
        startAnimation(new THREE.Vector3(3.4, 3.2, 3.8), new THREE.Vector3(0, TABLE_SURFACE_Y + 0.1, 0), 0.8);
      }
      prevCameraModeRef.current = cameraMode;
    }
  }, [cameraMode]);

  useFrame((_, delta) => {
    if (!isAnimatingRef.current) return;

    animationTimeRef.current += delta;
    const t = Math.min(1, animationTimeRef.current / animationDurationRef.current);
    const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);

    camera.position.lerp(targetCamPosRef.current, ease * 0.2 + delta * 3.2);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAtRef.current, ease * 0.2 + delta * 3.2);
      controlsRef.current.update();
    }

    if (
      camera.position.distanceTo(targetCamPosRef.current) < 0.03 &&
      (controlsRef.current ? controlsRef.current.target.distanceTo(targetLookAtRef.current) < 0.03 : true)
    ) {
      camera.position.copy(targetCamPosRef.current);
      if (controlsRef.current) {
        controlsRef.current.target.copy(targetLookAtRef.current);
        controlsRef.current.update();
      }
      isAnimatingRef.current = false;
    }
  });

  return null;
}

// Internal Bead Structure stored in ref for max performance
interface InternalBead {
  pos: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  heat: number;
  style: WeldBeadStyle;
  health?: WeldHealth;
  arcStatus?: ArcStatus;
  travelStatus?: TravelStatus;
  jaggedOffset?: THREE.Vector3;
}

// Instance buffer capacities for the three bead channels
const TUBE_INSTANCE_CAP = 20000;
const SPLATTER_INSTANCE_CAP = 30000;
const CRATER_INSTANCE_CAP = 14000;
const GOOD_INSTANCE_CAP = 5000;

// Millimetre -> scene-world conversion used by the debug splatter controls. Matches the
// existing bead sizing math (e.g. bead width mm * 0.0055) at roughly plate scale.
const SPLATTER_MM_TO_WORLD = 0.0011;

// Deterministic hash-based pseudo-random in [0, 1). Keyed off the bead/droplet index so the
// scatter looks random but never jitters between frames (beads are re-rendered every frame).
function hashRandom(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// Smooth 1D value noise built on hashRandom — used to steer the extruded tube path so the
// weld "worm" wanders continuously instead of zig-zagging with white noise.
function valueNoise(x: number): number {
  const i0 = Math.floor(x);
  const f = x - i0;
  const t = f * f * (3 - 2 * f);
  return THREE.MathUtils.lerp(hashRandom(i0), hashRandom(i0 + 1), t);
}

// Cross-section used by the overheated bead. It is a normal bead profile (elliptical, so the
// width and the height can be driven independently) whose left and right extremes — the toes
// of the bead when looking top-down — are pulled into sharp saw-teeth instead of a smooth
// spherical shell. The tooth phase flips between the two ends of the segment so the spikes
// zig-zag along the direction of travel.
//
// The saw-teeth only ever displace the cross-section sideways (local X = lateral toe of the
// bead). The local Z axis carries the crown height, and is deliberately left untouched so the
// jaggedness can never grow taller than the weld bead itself.
function createJaggedBeadGeometry(
  radialSegments = 32,
  intensity = 0.5,
  teeth = 16
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const toothCount = Math.max(2, Math.round(teeth));

  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;

    const theta = Math.atan2(z, x);
    // Concentrate the jaggedness on the ±X extremes (the sides of the bead).
    const sideWeight = Math.pow(Math.abs(Math.cos(theta)), 4);
    const wedge = Math.floor(((theta + Math.PI) / (Math.PI * 2)) * toothCount);
    const tooth = wedge % 2 === 0 ? 1 : -1;
    const phase = y >= 0 ? 1 : -1;
    const jag = 1 + sideWeight * tooth * phase * intensity;

    const scaled = Math.max(0.25, jag);
    pos.setX(v, x * scaled);
  }

  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  return flat;
}

// Ultra-performant GPU Instanced Weld Beads renderer for stable spray, stacked dimes, cold worms, and overheated craters
function WeldBeadsInstanced({
  beadsListRef,
  weldSettings,
  weldHealth = 'perfect',
  arcStatus = 'stable_spray',
  travelStatus = 'good_speed',
}: {
  beadsListRef: React.MutableRefObject<InternalBead[]>;
  beadCount: number;
  weldSettings: RoboDKWeldSettings;
  weldHealth?: WeldHealth;
  arcStatus?: ArcStatus;
  travelStatus?: TravelStatus;
}) {
  const goodMeshRef = useRef<THREE.InstancedMesh>(null);
  const tubeMeshRef = useRef<THREE.InstancedMesh>(null);
  const jointMeshRef = useRef<THREE.InstancedMesh>(null);
  const hotMeshRef = useRef<THREE.InstancedMesh>(null);
  const splatterMeshRef = useRef<THREE.InstancedMesh>(null);
  const craterMeshRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const targetBeadColor = useMemo(
    () => new THREE.Color(weldSettings.color_hex || '#eab308'),
    [weldSettings.color_hex]
  );

  // Thermal cooling palette: Molten White -> Bright Orange -> Cherry Red -> Dark Burgundy -> Temper Blue -> Solid Metal
  const whiteHotColor = useMemo(() => new THREE.Color('#ffffff'), []);
  const fieryOrangeColor = useMemo(() => new THREE.Color('#ff5500'), []);
  const cherryRedColor = useMemo(() => new THREE.Color('#dc2626'), []);
  const darkBurgundyColor = useMemo(() => new THREE.Color('#6b1111'), []);
  const temperBlueColor = useMemo(() => new THREE.Color('#0284c7'), []);
  const temperGoldColor = useMemo(() => new THREE.Color('#d97706'), []);
  const coldSlagColor = useMemo(() => new THREE.Color('#30343a'), []);
  const hotBurnCharcoal = useMemo(() => new THREE.Color('#18181b'), []);
  // Colour of the jagged over-heated toes (dark red by default, tunable from the debug tool).
  const hotJagColor = useMemo(() => new THREE.Color('#7f1d1d'), []);
  const hotBeadColor = useMemo(() => new THREE.Color('#dc2626'), []);

  // Lay capsule flat along Z-axis (travel alignment)
  const capsuleAlignZQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
    []
  );

  // Scratch objects reused by the tube-extrusion pass (avoids per-frame allocations)
  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      side: new THREE.Vector3(),
      node: new THREE.Vector3(),
      prevNode: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      mid: new THREE.Vector3(),
      capsuleUp: new THREE.Vector3(0, 1, 0),
      segQuat: new THREE.Quaternion(),
      basisX: new THREE.Vector3(),
      basisZ: new THREE.Vector3(),
      basisMat: new THREE.Matrix4(),
      prevForward: new THREE.Vector3(),
      pathDir: new THREE.Vector3(),
    }),
    []
  );

  // 1. Set up the Geometries
  const goodGeo = useMemo(() => new THREE.SphereGeometry(1, 20, 16), []);
  // Open cylinder used as the extrusion segment of the cold / hot weld tubes. Scaling
  // (radius, length, radius) maps exactly onto the segment between two path nodes.
  const tubeGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 12, 1, false), []);
  const splatterGeo = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  // Rounded joint placed at every node of the cold rope so consecutive segments blend into
  // one continuous worm instead of reading as separately chopped logs.
  const jointGeo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  // Normal-looking bead cross-section with sharp jagged left/right toes (overheated bead).
  const hotJagIntensity = THREE.MathUtils.clamp(weldSettings.hot_jag_intensity ?? 0.5, 0, 1);
  const hotJagTeeth = THREE.MathUtils.clamp(Math.round(weldSettings.hot_jag_teeth ?? 16), 6, 48);
  const hotGeo = useMemo(
    () => createJaggedBeadGeometry(32, hotJagIntensity, hotJagTeeth),
    [hotJagIntensity, hotJagTeeth]
  );
  useEffect(() => () => hotGeo.dispose(), [hotGeo]);
  const craterGeo = useMemo(() => new THREE.CapsuleGeometry(1, 1, 8, 8), []);

  // Materials for 3 Separate Visual Channels
  const goodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        metalness: 0.90,
        roughness: 0.28,
        envMapIntensity: 2.2,
      }),
    []
  );

  const tubeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        metalness: 0.25,
        roughness: 0.72,
      }),
    []
  );

  const splatterMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#30343a',
        metalness: 0.0,
        roughness: 1.0,
      }),
    []
  );

  const craterMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#dc2626',
        metalness: 0.2,
        roughness: 0.7,
        emissive: '#500724',
        emissiveIntensity: 0.6,
      }),
    []
  );

  // Pre-initialize instanceColor attributes and disable frustum culling on all three meshes
  useEffect(() => {
    const meshes = [
      goodMeshRef.current,
      tubeMeshRef.current,
      jointMeshRef.current,
      hotMeshRef.current,
      splatterMeshRef.current,
      craterMeshRef.current,
    ];
    meshes.forEach((mesh) => {
      if (mesh) {
        mesh.frustumCulled = false;
        const count = mesh.count || 10000;
        const initialColors = new Float32Array(count * 3);
        const defaultHex = new THREE.Color(weldSettings.color_hex || '#eab308');
        for (let i = 0; i < count; i++) {
          initialColors[i * 3 + 0] = defaultHex.r;
          initialColors[i * 3 + 1] = defaultHex.g;
          initialColors[i * 3 + 2] = defaultHex.b;
        }
        mesh.instanceColor = new THREE.InstancedBufferAttribute(initialColors, 3);
        mesh.instanceColor.needsUpdate = true;
      }
    });
  }, [weldSettings.color_hex]);

  useFrame((_, delta) => {
    const beads = beadsListRef.current;
    const totalCount = beads ? beads.length : 0;

    if (
      !goodMeshRef.current ||
      !tubeMeshRef.current ||
      !jointMeshRef.current ||
      !hotMeshRef.current ||
      !splatterMeshRef.current ||
      !craterMeshRef.current
    )
      return;

    if (totalCount === 0) {
      goodMeshRef.current.count = 0;
      tubeMeshRef.current.count = 0;
      jointMeshRef.current.count = 0;
      hotMeshRef.current.count = 0;
      splatterMeshRef.current.count = 0;
      craterMeshRef.current.count = 0;
      goodMeshRef.current.instanceMatrix.needsUpdate = true;
      tubeMeshRef.current.instanceMatrix.needsUpdate = true;
      jointMeshRef.current.instanceMatrix.needsUpdate = true;
      hotMeshRef.current.instanceMatrix.needsUpdate = true;
      splatterMeshRef.current.instanceMatrix.needsUpdate = true;
      craterMeshRef.current.instanceMatrix.needsUpdate = true;
      return;
    }

    const sm = Math.max(0.2, weldSettings.scale_multiplier || 2.8);
    const wm = Math.max(0.2, weldSettings.width_multiplier || 1.8);
    const hm = Math.max(0.2, weldSettings.height_multiplier || 2.0);

    const effectiveCoolingRate =
      weldSettings.cooling_rate !== undefined
        ? weldSettings.cooling_rate
        : (weldSettings.cooling_duration_sec ? 1.0 / weldSettings.cooling_duration_sec : 0.285);

    let goodCount = 0;
    let tubeCount = 0;
    let jointCount = 0;
    let hotCount = 0;
    let splatterInstanceCount = 0;
    let craterCount = 0;

    // Debug-tunable splatter scatter controls
    const splatterArea = Math.max(0, (weldSettings.splatter_area_mm ?? 60.0) * SPLATTER_MM_TO_WORLD);
    const splatterCount = Math.max(0, Math.round(weldSettings.splatter_count ?? 7));
    const splatterDensity = THREE.MathUtils.clamp(weldSettings.splatter_density ?? 0.85, 0, 1);
    const splatterSize = Math.max(
      0.0005,
      (weldSettings.splatter_size_mm ?? 9.0) * SPLATTER_MM_TO_WORLD
    );
    const splatterVariance = THREE.MathUtils.clamp(weldSettings.splatter_size_variance ?? 0.6, 0, 1);

    // Debug-tunable too-cold worm controls
    const coldScale = Math.max(0.05, weldSettings.cold_rope_scale ?? 1.0);
    const coldWidthScale = Math.max(0.05, weldSettings.cold_width_scale ?? 1.0);
    const coldHeightScale = Math.max(0.05, weldSettings.cold_height_scale ?? 1.0);
    const coldLumpiness = THREE.MathUtils.clamp(weldSettings.cold_lumpiness ?? 0.45, 0, 1);
    const coldWander = Math.max(0, (weldSettings.cold_wander_mm ?? 12.0) * SPLATTER_MM_TO_WORLD);
    const coldBreakChance = THREE.MathUtils.clamp(weldSettings.cold_break_chance ?? 0.12, 0, 1);
    // Shape of the cold rope cross-section: 0 = round rope, 1 = flat slumped ribbon.
    const coldFlatness = THREE.MathUtils.clamp(weldSettings.cold_shape_flatness ?? 0.35, 0, 1);
    const coldWidthShape = 1 + coldFlatness * 0.9;
    const coldHeightShape = 1 - coldFlatness * 0.55;
    // Frequency of the lumps and of the lateral meander along the continuous rope.
    const coldLumpFreq = THREE.MathUtils.clamp(weldSettings.cold_lump_frequency ?? 1.0, 0.2, 4);
    const coldWanderFreq = THREE.MathUtils.clamp(weldSettings.cold_wander_frequency ?? 1.0, 0.2, 4);

    // Debug-tunable too-hot ugly bead controls
    const hotScale = Math.max(0.05, weldSettings.hot_bead_scale ?? 1.0);
    const hotWidthVariation = THREE.MathUtils.clamp(weldSettings.hot_width_variation ?? 0.55, 0, 1);
    const hotHeightVariation = THREE.MathUtils.clamp(
      weldSettings.hot_height_variation ?? 0.6,
      0,
      1
    );
    const hotMeshBlend = THREE.MathUtils.clamp(weldSettings.hot_mesh_blend ?? 0.6, 0, 1);
    const hotCraterDensity = THREE.MathUtils.clamp(weldSettings.hot_crater_density ?? 0.16, 0, 1);
    // The jagged shell is always kept shorter than the smooth bead crown so the spikes read as
    // ragged toes instead of towers standing above the weld.
    const hotJagHeightRatio = THREE.MathUtils.clamp(
      weldSettings.hot_jag_height_ratio ?? 0.6,
      0.1,
      1
    );
    hotJagColor.set(weldSettings.hot_jag_color || '#7f1d1d');

    // Tube-extrusion chain state: the previous path node and the bead index it came from, so
    // consecutive defect beads are stitched into one continuous extruded tube.
    let prevTubeIndex = -1;
    let prevTubeKind: 'cold' | 'hot' | null = null;
    let hasPrevNode = false;

    // Lateral offset carried by the previous node of the current run. Wander is only allowed
    // to change by a fraction of the travel step between two beads, which guarantees the
    // extruded path always advances along the joint no matter which way the torch travels
    // (axis-aligned, diagonal or around a corner).
    let prevLateral = 0;

    // Minimum forward progress (world units) allowed between two path nodes. This is what
    // keeps the random extrusion path from ever walking backwards along the weld direction.
    const minForwardStep = 0.0004;

    // Builds the capsule/cylinder transform for one tube segment between the previously
    // stored path node and `scratch.node`, clamping the new node so travel stays forward.
    // Returns false when a new tube run is starting (nothing to connect to yet).
    // When `sideAxis` is supplied the segment is oriented with an explicit basis
    // (Y = travel, X = lateral, Z = up) so the cross-section width (`radius`) and height
    // (`heightRadius`) can be driven independently — used by the overheated bead.
    const buildTubeSegment = (
      contiguous: boolean,
      forward: THREE.Vector3,
      radius: number,
      lengthGain: number,
      maxSegLength: number,
      sideAxis?: THREE.Vector3,
      heightRadius?: number
    ): boolean => {
      let emitted = false;

      if (contiguous && hasPrevNode) {
        scratch.dir.subVectors(scratch.node, scratch.prevNode);
        const along = scratch.dir.dot(forward);
        // Only nudge the node forward when it barely lags behind. A large backwards
        // projection means the path just changed direction (or the run is stale), in
        // which case we start a fresh run instead of stretching a tube backwards to a
        // previous — or even the initial — point.
        if (along < minForwardStep) {
          const shift = minForwardStep - along;
          if (shift <= maxSegLength) {
            scratch.node.addScaledVector(forward, shift);
            scratch.dir.subVectors(scratch.node, scratch.prevNode);
          } else {
            scratch.dir.set(0, 0, 0);
          }
        }

        const segLength = scratch.dir.length();
        if (segLength > 1e-6 && segLength <= maxSegLength) {
          scratch.dir.divideScalar(segLength);
          scratch.mid.addVectors(scratch.prevNode, scratch.node).multiplyScalar(0.5);
          if (sideAxis) {
            scratch.basisX.copy(sideAxis).addScaledVector(scratch.dir, -sideAxis.dot(scratch.dir));
            if (scratch.basisX.lengthSq() < 1e-10) {
              scratch.basisX.set(1, 0, 0).cross(scratch.dir);
            }
            scratch.basisX.normalize();
            scratch.basisZ.crossVectors(scratch.basisX, scratch.dir).normalize();
            scratch.basisMat.makeBasis(scratch.basisX, scratch.dir, scratch.basisZ);
            scratch.segQuat.setFromRotationMatrix(scratch.basisMat);
          } else {
            scratch.segQuat.setFromUnitVectors(scratch.capsuleUp, scratch.dir);
          }

          dummy.position.copy(scratch.mid);
          dummy.quaternion.copy(scratch.segQuat);
          dummy.scale.set(radius, segLength * lengthGain, heightRadius ?? radius);
          dummy.updateMatrix();
          emitted = true;
        }
      }

      scratch.prevNode.copy(scratch.node);
      hasPrevNode = true;
      return emitted;
    };

    // Resolves the travel frame of a defect bead from the actual deposited path
    // (previous -> next bead) rather than from the stored torch orientation. Using the real
    // path keeps the extruded tube, the jagged toes and the lateral meander aligned with the
    // direction of travel even when the torch swings around a corner. Falls back to the bead
    // quaternion for isolated beads with no usable neighbours.
    // Returns the cosine between this bead's travel direction and the previous one, so a
    // sharp corner can break the extruded run instead of stretching a segment across it.
    const resolveTravelFrame = (index: number, bead: InternalBead): number => {
      scratch.pathDir.set(0, 0, 0);
      const before = index > 0 ? beads[index - 1] : null;
      const after = index + 1 < totalCount ? beads[index + 1] : null;

      // The direction of the segment that is about to be extruded (previous bead -> this
      // bead). Taking the real local step — instead of a centred difference across both
      // neighbours — keeps the cross-section square to the joint on diagonal travel and at
      // corners, where the centred average points off the actual path.
      if (before?.pos) {
        scratch.pathDir.subVectors(bead.pos, before.pos);
      }
      if (scratch.pathDir.lengthSq() < 1e-12 && after?.pos) {
        scratch.pathDir.subVectors(after.pos, bead.pos);
      }

      if (scratch.pathDir.lengthSq() < 1e-12) {
        scratch.pathDir.set(1, 0, 0).applyQuaternion(bead.quaternion);
      }
      if (scratch.pathDir.lengthSq() < 1e-12) {
        scratch.pathDir.set(0, 0, 1);
      }

      const hadPrevForward = scratch.prevForward.lengthSq() > 1e-10;
      scratch.forward.copy(scratch.pathDir).normalize();
      const turnCos = hadPrevForward ? scratch.prevForward.dot(scratch.forward) : 1;
      scratch.prevForward.copy(scratch.forward);

      // Right-hand lateral axis of the joint, always perpendicular to the live travel
      // direction so the bead cross-section rotates with the path.
      scratch.side.set(0, 1, 0).cross(scratch.forward);
      if (scratch.side.lengthSq() < 1e-10) {
        scratch.side.set(1, 0, 0).cross(scratch.forward);
      }
      if (scratch.side.lengthSq() < 1e-10) scratch.side.set(1, 0, 0);
      scratch.side.normalize();

      return turnCos;
    };

    // The travel frame is rebuilt from scratch every frame so a stale direction from the
    // previous frame can never leak into the first segment of a run.
    scratch.prevForward.set(0, 0, 0);

    for (let i = 0; i < totalCount; i++) {
      const bead = beads[i];
      if (!bead || !bead.pos || !bead.quaternion || !bead.scale) continue;

      // Realistic progressive thermal cooling dissipation
      if (bead.heat > 0 && effectiveCoolingRate > 0) {
        bead.heat = Math.max(0, bead.heat - delta * effectiveCoolingRate);
      }

      const beadArc = bead.arcStatus || arcStatus;
      const beadTravel = bead.travelStatus || travelStatus;

      // Distance the torch actually travelled between this bead and the previous one.
      // Any tube segment longer than a few of these gaps is a path discontinuity
      // (corner, restart, or skipped bead) and must break the extruded run.
      const prevBead = i > 0 ? beads[i - 1] : null;
      const beadGap = prevBead && prevBead.pos ? bead.pos.distanceTo(prevBead.pos) : 0;

      let sx = bead.scale.x * sm;
      let sy = bead.scale.y * sm * hm;
      let sz = bead.scale.z * sm * wm;

      // ------------------------------------------------------------------------------------
      // 2. TOO COLD / STUBBING: Tube extrusion along a randomly wandering path that is
      //    constrained to the weld travel direction, so the cold rope can never double back
      //    on itself. Cold metal doesn't wet the plate, so it piles into a stringy worm.
      // ------------------------------------------------------------------------------------
      if (beadArc === 'too_cold_stubbing') {
        const ropeRadius = Math.max(sx, sz) * 0.34 * coldScale * coldWidthScale * coldWidthShape;
        const ropeHeight = Math.max(sx, sz) * 0.34 * coldScale * coldHeightScale * coldHeightShape;

        // Slow, low-frequency swelling so the rope thickens and thins gradually along its
        // length (worm-like) rather than stepping between fat and thin chopped segments.
        // `coldLumpFreq` sets how often those lumps repeat along the continuous bead.
        const nodulePulse =
          1 +
          ((valueNoise(i * 0.11 * coldLumpFreq) - 0.5) * 1.1 +
            (valueNoise(i * 0.33 * coldLumpFreq + 4.7) - 0.5) * 0.4) *
            coldLumpiness;

        // Travel frame taken from the deposited path so the worm follows direction changes.
        const turnCos = resolveTravelFrame(i, bead);

        // Cold metal stubs out: the rope randomly breaks into disconnected lengths.
        const broken = coldBreakChance > 0 && hashRandom(i * 2.113 + 6.7) < coldBreakChance;

        // A hard direction change (corner) always starts a new run instead of dragging a
        // segment across the turn.
        const contiguous =
          prevTubeIndex === i - 1 && prevTubeKind === 'cold' && !broken && turnCos > 0.25;

        // Two-octave meander: a long slow snake across the joint with a smaller secondary
        // squirm on top of it, so the rope crawls like a worm instead of a straight chain.
        const lateralTarget =
          (valueNoise(i * 0.045 * coldWanderFreq) - 0.5) * 2 * coldWander +
          (valueNoise(i * 0.17 * coldWanderFreq + 23.9) - 0.5) * 2 * coldWander * 0.3;
        // Limit how fast the meander can move sideways relative to the forward step so the
        // extruded path always advances along the joint, whatever direction it travels in.
        const lateral = contiguous
          ? THREE.MathUtils.clamp(
              lateralTarget,
              prevLateral - beadGap * 0.6,
              prevLateral + beadGap * 0.6
            )
          : lateralTarget;
        prevLateral = lateral;

        const lift =
          valueNoise(i * 0.07 * coldLumpFreq + 17.3) * ropeHeight * 0.85 +
          (valueNoise(i * 0.26 * coldLumpFreq + 61.1) - 0.5) * ropeHeight * 0.3;

        scratch.node.copy(bead.pos);
        scratch.node.addScaledVector(scratch.side, lateral);
        scratch.node.y =
          Math.max(bead.pos.y, WORKPIECE_TOP_Y) + ropeHeight * nodulePulse * 0.9 + lift;

        const segmentRadius = Math.max(1e-5, ropeRadius * nodulePulse);
        const segmentHeight = Math.max(1e-5, ropeHeight * nodulePulse);
        const maxSegLength = Math.max(ropeRadius * 3.0, beadGap * 2.5);
        if (
          buildTubeSegment(
            contiguous,
            scratch.forward,
            segmentRadius,
            1.06,
            maxSegLength,
            scratch.side,
            segmentHeight
          ) &&
          tubeCount < TUBE_INSTANCE_CAP
        ) {
          tubeMeshRef.current.setMatrixAt(tubeCount, dummy.matrix);
          tempColor.copy(coldSlagColor);
          tubeMeshRef.current.setColorAt(tubeCount, tempColor);
          tubeCount++;

          // Rounded joint at the node: hides the flat cylinder caps so the run reads as a
          // single continuous worm instead of a stack of chopped logs.
          if (jointCount < TUBE_INSTANCE_CAP) {
            // After buildTubeSegment, scratch.prevNode holds this segment's end node.
            dummy.position.copy(scratch.prevNode);
            dummy.scale.set(segmentRadius * 1.02, segmentHeight * 1.02, segmentRadius * 1.02);
            dummy.quaternion.identity();
            dummy.updateMatrix();
            jointMeshRef.current.setMatrixAt(jointCount, dummy.matrix);
            tempColor.copy(coldSlagColor);
            jointMeshRef.current.setColorAt(jointCount, tempColor);
            jointCount++;
          }
        }
        prevTubeIndex = i;
        prevTubeKind = 'cold';

      // ------------------------------------------------------------------------------------
      // 3. TOO HOT / GLOBULAR: A broadly normal-looking bead laid along the joint, but with
      //    the width and height swelling and pinching along its length, sharp jagged toes on
      //    the left / right edges, undercut / burn pits and a random splatter scatter.
      // ------------------------------------------------------------------------------------
      } else if (beadArc === 'too_hot_globular') {
        const baseRadius = Math.max(sx, sz) * 0.5 * hotScale;

        // Independent width & height pulses so the bead varies in intensity along its run
        // instead of being an even rope of spheres.
        const widthPulse = 1 + (valueNoise(i * 0.14 + 5.1) - 0.5) * 1.6 * hotWidthVariation;
        const heightPulse = 1 + (valueNoise(i * 0.23 + 41.9) - 0.5) * 1.8 * hotHeightVariation;
        const segmentRadius = Math.max(1e-5, baseRadius * widthPulse);
        const segmentHeight = Math.max(1e-5, baseRadius * 0.62 * heightPulse);

        // Travel frame taken from the deposited path so the jagged toes and the bead
        // cross-section stay square to the joint when the torch turns a corner.
        const turnCos = resolveTravelFrame(i, bead);

        // A hard direction change (corner) always starts a new run instead of dragging a
        // segment across the turn.
        const contiguous = prevTubeIndex === i - 1 && prevTubeKind === 'hot' && turnCos > 0.25;

        const lateralTarget = (valueNoise(i * 0.28 + 31.7) - 0.5) * 2 * baseRadius * 0.35;
        // Rate-limited sideways drift keeps the extrusion advancing along the joint for any
        // travel direction (axis-aligned, diagonal or turning).
        const lateral = contiguous
          ? THREE.MathUtils.clamp(
              lateralTarget,
              prevLateral - beadGap * 0.6,
              prevLateral + beadGap * 0.6
            )
          : lateralTarget;
        prevLateral = lateral;

        // Undercutting: the toes of the bead are burned away, so the bead sinks into the
        // base metal instead of sitting proud on top of it.
        const undercut = valueNoise(i * 0.72 + 91.2);

        scratch.node.copy(bead.pos);
        scratch.node.addScaledVector(scratch.side, lateral);
        scratch.node.y =
          Math.max(bead.pos.y, WORKPIECE_TOP_Y) +
          segmentHeight * 0.45 -
          segmentHeight * undercut * 0.5;

        const maxSegLength = Math.max(baseRadius * 3.0, beadGap * 2.5);
        // The jagged shell is emitted at the blended outer size; the smooth "normal bead"
        // layer sits just inside it so the two meshes read as one welded-together bead.
        const shellRadius = segmentRadius * (0.86 + 0.44 * hotMeshBlend);
        const coreScale = 1 - 0.22 * hotMeshBlend;
        // The jagged shell is kept below the smooth crown so the spikes ripple out of the
        // sides of the bead rather than towering above it.
        const shellHeight = segmentHeight * coreScale * hotJagHeightRatio;
        if (
          buildTubeSegment(
            contiguous,
            scratch.forward,
            shellRadius,
            1.1,
            maxSegLength,
            scratch.side,
            shellHeight
          )
        ) {
          const segLengthScale = dummy.scale.y;

          if (hotMeshBlend > 0.02 && hotCount < TUBE_INSTANCE_CAP) {
            hotMeshRef.current.setMatrixAt(hotCount, dummy.matrix);
            tempColor.copy(hotJagColor);
            hotMeshRef.current.setColorAt(hotCount, tempColor);
            hotCount++;
          }

          // Smooth varying-bead layer: a normal (rounded) bead whose width and height follow
          // the same pulses, blended underneath the jagged shell.
          if (tubeCount < TUBE_INSTANCE_CAP) {
            dummy.scale.set(segmentRadius * coreScale, segLengthScale, segmentHeight * coreScale);
            dummy.updateMatrix();
            tubeMeshRef.current.setMatrixAt(tubeCount, dummy.matrix);
            tempColor.copy(hotBeadColor);
            tubeMeshRef.current.setColorAt(tubeCount, tempColor);
            tubeCount++;
          }

          // Rounded joint so consecutive smooth segments blend instead of showing flat caps.
          if (jointCount < TUBE_INSTANCE_CAP) {
            dummy.position.copy(scratch.prevNode);
            dummy.quaternion.identity();
            dummy.scale.set(
              segmentRadius * coreScale,
              segmentHeight * coreScale,
              segmentRadius * coreScale
            );
            dummy.updateMatrix();
            jointMeshRef.current.setMatrixAt(jointCount, dummy.matrix);
            tempColor.copy(hotBeadColor);
            jointMeshRef.current.setColorAt(jointCount, tempColor);
            jointCount++;
          }
        }
        prevTubeIndex = i;
        prevTubeKind = 'hot';

        // Blown-out craters: shallow pits burned down into the plate (flat, never pillars).
        if (hashRandom(i * 3.31) < hotCraterDensity && craterCount < CRATER_INSTANCE_CAP) {
          const craterRadius = segmentRadius * (0.75 + hashRandom(i * 5.77) * 0.6);
          dummy.position.copy(scratch.node);
          dummy.position.addScaledVector(scratch.side, (hashRandom(i * 8.19) - 0.5) * segmentRadius);
          dummy.position.y = WORKPIECE_TOP_Y + craterRadius * 0.05;
          scratch.basisZ.set(0, 1, 0);
          scratch.basisX.crossVectors(scratch.forward, scratch.basisZ);
          scratch.basisMat.makeBasis(scratch.forward, scratch.basisZ, scratch.basisX);
          dummy.quaternion.setFromRotationMatrix(scratch.basisMat);
          dummy.scale.set(craterRadius, craterRadius * 0.12, craterRadius * 0.85);
          dummy.updateMatrix();

          craterMeshRef.current.setMatrixAt(craterCount, dummy.matrix);
          tempColor.copy(hotBurnCharcoal);
          craterMeshRef.current.setColorAt(craterCount, tempColor);
          craterCount++;
        }

        // Undercut groove: a dark sunken notch alongside the tube toe where the arc has
        // eaten into the plate.
        if (undercut > 1 - hotCraterDensity * 2.5 && craterCount < CRATER_INSTANCE_CAP) {
          const grooveSide = hashRandom(i * 13.7) < 0.5 ? 1 : -1;
          dummy.position.copy(scratch.node);
          dummy.position.addScaledVector(scratch.side, grooveSide * segmentRadius * 1.15);
          dummy.position.y = WORKPIECE_TOP_Y + segmentRadius * 0.04;
          scratch.basisZ.set(0, 1, 0);
          scratch.basisX.crossVectors(scratch.forward, scratch.basisZ);
          scratch.basisMat.makeBasis(scratch.forward, scratch.basisZ, scratch.basisX);
          dummy.quaternion.setFromRotationMatrix(scratch.basisMat).multiply(capsuleAlignZQuat);
          dummy.scale.set(segmentRadius * 0.16, segmentRadius * 0.9, segmentRadius * 0.12);
          dummy.updateMatrix();

          craterMeshRef.current.setMatrixAt(craterCount, dummy.matrix);
          tempColor.copy(hotBurnCharcoal);
          craterMeshRef.current.setColorAt(craterCount, tempColor);
          craterCount++;
        }

        // Random splatter scatter — fully driven by the debug tool (area, count, density,
        // size). Offsets are hash-seeded on the bead/droplet index so the scatter is random
        // yet perfectly stable between frames.
        if (splatterCount > 0 && hashRandom(i * 11.7 + 4.2) < splatterDensity) {
          for (let sp = 0; sp < splatterCount && splatterInstanceCount < SPLATTER_INSTANCE_CAP; sp++) {
            const seed = i * 7.13 + sp * 2.917;
            const angle = hashRandom(seed) * Math.PI * 2;
            // sqrt() keeps the droplets uniformly distributed over the scatter disc.
            const radial = splatterArea * Math.sqrt(hashRandom(seed + 51.3));
            const dropletRadius = Math.max(
              0.0004,
              splatterSize * 0.5 * (1 + (hashRandom(seed + 88.1) - 0.5) * 2 * splatterVariance)
            );

            dummy.position.copy(bead.pos);
            dummy.position.x += Math.cos(angle) * radial;
            dummy.position.z += Math.sin(angle) * radial;
            dummy.position.y = WORKPIECE_TOP_Y + dropletRadius * 0.55;
            dummy.quaternion.identity();
            dummy.scale.set(dropletRadius, dropletRadius * 0.8, dropletRadius);
            dummy.updateMatrix();

            splatterMeshRef.current.setMatrixAt(splatterInstanceCount, dummy.matrix);
            tempColor.copy(hotBurnCharcoal);
            splatterMeshRef.current.setColorAt(splatterInstanceCount, tempColor);
            splatterInstanceCount++;
          }
        }

      // ------------------------------------------------------------------------------------
      // 1. STANDARD SYNERGISTIC SPRAY & STACKED DIMES
      // ------------------------------------------------------------------------------------
      } else {
        // A healthy bead breaks any in-progress defect tube run.
        prevTubeIndex = -1;
        prevTubeKind = null;
        hasPrevNode = false;
        prevLateral = 0;
        scratch.prevForward.set(0, 0, 0);

        dummy.position.copy(bead.pos);
        dummy.quaternion.copy(bead.quaternion);

        if (beadTravel === 'too_slow_glob') {
          sx *= 2.1;
          sy *= 1.9;
          sz *= 2.1;
        } else if (beadTravel === 'too_fast_disconnected') {
          sx *= 0.76;
          sz *= 0.76;
        }
        dummy.position.y = Math.max(dummy.position.y, WORKPIECE_TOP_Y) + (sy * 0.48);

        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();

        goodMeshRef.current.setMatrixAt(goodCount, dummy.matrix);

        if (weldSettings.color_mode === 'SOLID_CUSTOM') {
          tempColor.copy(targetBeadColor);
        } else {
          // Optimal 'perfect' thermal cooling sequence: Hot at torch, then cools behind torch over time
          if (bead.heat > 0.75) {
            const t = (bead.heat - 0.75) / 0.25;
            tempColor.lerpColors(fieryOrangeColor, whiteHotColor, t);
          } else if (bead.heat > 0.45) {
            const t = (bead.heat - 0.45) / 0.30;
            tempColor.lerpColors(cherryRedColor, fieryOrangeColor, t);
          } else if (bead.heat > 0.20) {
            const t = (bead.heat - 0.20) / 0.25;
            tempColor.lerpColors(darkBurgundyColor, cherryRedColor, t);
          } else if (bead.heat > 0.08) {
            const t = (bead.heat - 0.08) / 0.12;
            tempColor.lerpColors(temperGoldColor, darkBurgundyColor, t);
          } else if (bead.heat > 0) {
            const t = bead.heat / 0.08;
            tempColor.lerpColors(targetBeadColor, temperBlueColor, t);
          } else {
            tempColor.copy(targetBeadColor);
          }
        }

        goodMeshRef.current.setColorAt(goodCount, tempColor);
        goodCount++;
      }
    }

    goodMeshRef.current.count = goodCount;
    goodMeshRef.current.instanceMatrix.needsUpdate = true;
    if (goodMeshRef.current.instanceColor) {
      goodMeshRef.current.instanceColor.needsUpdate = true;
    }

    tubeMeshRef.current.count = tubeCount;
    tubeMeshRef.current.instanceMatrix.needsUpdate = true;
    if (tubeMeshRef.current.instanceColor) {
      tubeMeshRef.current.instanceColor.needsUpdate = true;
    }

    jointMeshRef.current.count = jointCount;
    jointMeshRef.current.instanceMatrix.needsUpdate = true;
    if (jointMeshRef.current.instanceColor) {
      jointMeshRef.current.instanceColor.needsUpdate = true;
    }

    hotMeshRef.current.count = hotCount;
    hotMeshRef.current.instanceMatrix.needsUpdate = true;
    if (hotMeshRef.current.instanceColor) {
      hotMeshRef.current.instanceColor.needsUpdate = true;
    }

    splatterMeshRef.current.count = splatterInstanceCount;
    splatterMeshRef.current.instanceMatrix.needsUpdate = true;
    if (splatterMeshRef.current.instanceColor) {
      splatterMeshRef.current.instanceColor.needsUpdate = true;
    }

    craterMeshRef.current.count = craterCount;
    craterMeshRef.current.instanceMatrix.needsUpdate = true;
    if (craterMeshRef.current.instanceColor) {
      craterMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* 1. Good / Standard Synergistic Spray Beads */}
      <instancedMesh
        ref={goodMeshRef}
        args={[goodGeo, goodMat, GOOD_INSTANCE_CAP]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      {/* 2. Extruded tube segments: cold stringy worm rope & bunched-up overheated puddle */}
      <instancedMesh
        ref={tubeMeshRef}
        args={[tubeGeo, tubeMat, TUBE_INSTANCE_CAP]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      {/* 2b. Rounded joints that blend the cold rope segments into one continuous worm */}
      <instancedMesh
        ref={jointMeshRef}
        args={[jointGeo, tubeMat, TUBE_INSTANCE_CAP]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      {/* 2c. Over-heated bead: normal bead profile with sharp jagged left/right toes */}
      <instancedMesh
        ref={hotMeshRef}
        args={[hotGeo, tubeMat, TUBE_INSTANCE_CAP]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      {/* 2d. Charcoal splatter droplets scattered around an over-heated puddle */}
      <instancedMesh
        ref={splatterMeshRef}
        args={[splatterGeo, splatterMat, SPLATTER_INSTANCE_CAP]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      {/* 3. Blown-out craters & undercut grooves burned into an over-heated joint */}
      <instancedMesh
        ref={craterMeshRef}
        args={[craterGeo, craterMat, CRATER_INSTANCE_CAP]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
    </group>
  );
}

// Interactive Scene with Stage 1, 2, and 3
function InteractiveFabricationScene({
  points,
  setPoints,
  isDrawing,
  setIsDrawing,
  phase,
  setPhase,
  smeltTimeRef,
  weldNodes,
  setWeldNodes,
  voltage,
  wireFeed,
  travelSpeed,
  isWelding,
  setIsWelding,
  beadCount,
  setBeadCount,
  weldSettings,
  beadsListRef,
  onShapeCreated,
  currentWidth = 9.0,
  currentHeight = 3.2,
  weldHealth = 'perfect',
  arcStatus = 'stable_spray',
  travelStatus = 'good_speed',
}: {
  points: THREE.Vector3[];
  setPoints: React.Dispatch<React.SetStateAction<THREE.Vector3[]>>;
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  phase: 'draw' | 'smelt' | 'done' | 'plan_path' | 'execute';
  setPhase: (phase: 'draw' | 'smelt' | 'done' | 'plan_path' | 'execute') => void;
  smeltTimeRef: React.MutableRefObject<number>;
  weldNodes: THREE.Vector3[];
  setWeldNodes: React.Dispatch<React.SetStateAction<THREE.Vector3[]>>;
  voltage: number;
  wireFeed: number;
  travelSpeed: number;
  isWelding: boolean;
  setIsWelding: (w: boolean) => void;
  beadCount: number;
  setBeadCount: React.Dispatch<React.SetStateAction<number>>;
  weldSettings: RoboDKWeldSettings;
  beadsListRef: React.MutableRefObject<InternalBead[]>;
  onShapeCreated?: (shapeGroup: THREE.Group) => void;
  currentWidth?: number;
  currentHeight?: number;
  weldHealth?: WeldHealth;
  arcStatus?: ArcStatus;
  travelStatus?: TravelStatus;
}) {
  const alloyMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shapeGroupRef = useRef<THREE.Group>(null);
  const workpieceMeshRef = useRef<THREE.Mesh>(null);
  const toolGroupRef = useRef<THREE.Group>(null);
  const hasNotifiedRef = useRef(false);
  const steamAudioRef = useRef(false);
  const burnHolesRef = useRef<THREE.Vector3[]>([]);

  // Stage 3 Welding Execution State
  const currentSegmentIndexRef = useRef(0);
  const segmentProgressRef = useRef(0);
  const lastBeadDropPosRef = useRef<THREE.Vector3 | null>(null);
  const prevIsWeldingRef = useRef(false);

  // Synchronous reset when welding starts so useFrame never receives a stale completed index
  if (!prevIsWeldingRef.current && isWelding) {
    currentSegmentIndexRef.current = 0;
    segmentProgressRef.current = 0;
    lastBeadDropPosRef.current = null;
    beadsListRef.current = [];
    burnHolesRef.current = [];
    if (toolGroupRef.current && weldNodes.length > 0) {
      toolGroupRef.current.position.copy(weldNodes[0]);
    }
  }
  prevIsWeldingRef.current = isWelding;

  // Initialize torch at start waypoint when entering execute phase
  useEffect(() => {
    if (phase === 'execute' && weldNodes.length > 0) {
      const startPt = weldNodes[0].clone();
      if (toolGroupRef.current) {
        toolGroupRef.current.position.copy(startPt);
      }
      currentSegmentIndexRef.current = 0;
      segmentProgressRef.current = 0;
      lastBeadDropPosRef.current = null;
    }
  }, [phase, weldNodes]);

  // Audio loop synchronization and position alignment when welding starts/stops
  useEffect(() => {
    if (isWelding) {
      startWeldingSoundLoop(voltage);
      if (weldNodes.length > 0 && toolGroupRef.current) {
        toolGroupRef.current.position.copy(weldNodes[0]);
      }
    } else {
      stopWeldingSoundLoop();
    }
    return () => {
      stopWeldingSoundLoop();
    };
  }, [isWelding, voltage, weldNodes]);

  // Target Centroid of drawn shape
  const targetCentroid = useMemo(() => {
    if (points.length < 3) return new THREE.Vector3(0, TABLE_SURFACE_Y, 0);
    let sumX = 0;
    let sumZ = 0;
    points.forEach((pt) => {
      sumX += pt.x;
      sumZ += pt.z;
    });
    return new THREE.Vector3(sumX / points.length, TABLE_SURFACE_Y, sumZ / points.length);
  }, [points]);

  // Clamp drawn coordinates strictly to table surface
  const clampToTable = useCallback((pt: THREE.Vector3) => {
    const halfW = (TABLE_WIDTH * 0.94) / 2;
    const halfD = (TABLE_DEPTH * 0.92) / 2;
    const minX = TABLE_CENTER[0] - halfW;
    const maxX = TABLE_CENTER[0] + halfW;
    const minZ = TABLE_CENTER[2] - halfD;
    const maxZ = TABLE_CENTER[2] + halfD;

    return new THREE.Vector3(
      THREE.MathUtils.clamp(pt.x, minX, maxX),
      DRAW_PLANE_Y,
      THREE.MathUtils.clamp(pt.z, minZ, maxZ)
    );
  }, []);

  const handlePointerDown = (e: any) => {
    if (phase !== 'draw') return;
    e.stopPropagation();
    setIsDrawing(true);
    const clamped = clampToTable(e.point);
    setPoints([clamped]);
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawing || phase !== 'draw') return;
    e.stopPropagation();
    const clamped = clampToTable(e.point);
    const lastPoint = points[points.length - 1];
    if (lastPoint && lastPoint.distanceTo(clamped) > 0.05) {
      setPoints((prev) => [...prev, clamped]);
    }
  };

  const handlePointerUp = (e: any) => {
    if (phase !== 'draw') return;
    e.stopPropagation();
    setIsDrawing(false);
    if (points.length > 2) {
      setPoints((prev) => [...prev, prev[0]]);
    }
  };

  // Stage 2 Waypoint click on 3D workpiece
  const handleWorkpieceClick = (e: any) => {
    if (phase !== 'plan_path') return;
    e.stopPropagation();
    playClickSound();
    const point = e.point.clone();
    point.y = WORKPIECE_TOP_Y;
    setWeldNodes((prev) => [...prev, point]);
  };

  // 2D shape for 3D extrusion
  const customShape = useMemo(() => {
    if (phase === 'draw' || points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, -points[i].z);
    }
    return shape;
  }, [points, phase]);

  const extrudeSettings = useMemo(
    () => ({
      depth: 0.25,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSteps: 2,
      bevelThickness: 0.02,
      bevelSize: 0.02,
    }),
    []
  );

  // Stage 3: Robotic Welding Execution Loop
  useFrame((state, delta) => {
    if (phase === 'execute' && isWelding && weldNodes.length > 1) {
      if (currentSegmentIndexRef.current >= weldNodes.length - 1) {
        // Complete weld path trajectory safely - solidify and preserve all beads
        setBeadCount(beadsListRef.current.length);
        setIsWelding(false);
        stopWeldingSoundLoop();
        playSuccessChime();
        return;
      }

      // Advance along the trajectory, carrying any overflow into the following
      // segment(s) within the same frame. Resetting progress without re-reading the
      // waypoints is what made the torch flash back to the previous corner whenever
      // the path changed direction.
      const speedMetersPerSec = Math.max(0.12, (travelSpeed / 100) * 0.9);
      let remaining = speedMetersPerSec * delta;
      let reachedEnd = false;

      while (remaining > 0) {
        const idx = currentSegmentIndexRef.current;
        if (idx >= weldNodes.length - 1) {
          reachedEnd = true;
          break;
        }
        const segLen = Math.max(0.01, weldNodes[idx].distanceTo(weldNodes[idx + 1]));
        const remainingOnSegment = (1 - segmentProgressRef.current) * segLen;

        if (remaining < remainingOnSegment) {
          segmentProgressRef.current += remaining / segLen;
          remaining = 0;
        } else {
          remaining -= remainingOnSegment;
          segmentProgressRef.current = 0;
          currentSegmentIndexRef.current += 1;
          playServoJogSound(1.2);
        }
      }

      const i = Math.min(currentSegmentIndexRef.current, weldNodes.length - 2);
      const pStart = weldNodes[i];
      const pEnd = weldNodes[i + 1];
      const segDistance = pStart.distanceTo(pEnd);

      const currentTorchWorldPos = new THREE.Vector3().lerpVectors(
        pStart,
        pEnd,
        reachedEnd ? 1 : Math.min(1, segmentProgressRef.current)
      );

      // Move torch directly
      if (toolGroupRef.current) {
        toolGroupRef.current.position.copy(currentTorchWorldPos);
        const dir = new THREE.Vector3().subVectors(pEnd, currentTorchWorldPos);
        if (dir.lengthSq() > 0.001) {
          toolGroupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
        }
      }

      // RoboDK Weld Spray Geometry Computation
      const tangent = new THREE.Vector3().subVectors(pEnd, pStart).normalize();
      const refNormal = new THREE.Vector3(0, 1, 0);
      let side = new THREE.Vector3().crossVectors(refNormal, tangent).normalize();
      if (side.lengthSq() < 0.001) {
        side = new THREE.Vector3(1, 0, 0);
      }
      const trueNormal = new THREE.Vector3().crossVectors(tangent, side).normalize();

      // Frenet orientation basis
      const basis = new THREE.Matrix4().makeBasis(tangent, trueNormal, side);
      const beadQuat = new THREE.Quaternion().setFromRotationMatrix(basis);

      // Apply torch work angle / bead tilt rotation in local Y-Z frame (from RoboDK script)
      let tiltSign = 1.0;
      if (weldSettings.bead_tilt_direction === 'OPPOSITE' || weldSettings.bead_tilt_direction === '-Y') {
        tiltSign = -1.0;
      }
      const tiltRad = THREE.MathUtils.degToRad(weldSettings.bead_tilt_angle_deg ?? 15.0) * tiltSign;
      const tiltQuat = new THREE.Quaternion().setFromAxisAngle(tangent, tiltRad);
      beadQuat.premultiply(tiltQuat);

      // Apply seam axial rotation / twist if set in debug tool
      if (weldSettings.bead_rotation_deg) {
        const rotRad = THREE.MathUtils.degToRad(weldSettings.bead_rotation_deg);
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(trueNormal, rotRad);
        beadQuat.premultiply(rotQuat);
      }

      // Apply torch travel push/pull pitch angle if set in debug tool
      if (weldSettings.bead_pitch_deg) {
        const pitchRad = THREE.MathUtils.degToRad(weldSettings.bead_pitch_deg);
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(side, pitchRad);
        beadQuat.premultiply(pitchQuat);
      }

      // Voltage and Wire Feed physical scaling factors
      const voltFactor = voltage / 19.5; // Baseline 19.5V
      const wfsFactor = wireFeed / 300; // Baseline 300 WFS
      const paramFactor = THREE.MathUtils.clamp(
        Math.sqrt(wfsFactor) * (0.85 + voltFactor * 0.2),
        0.6,
        2.5
      );

      const sm = Math.max(0.2, weldSettings.scale_multiplier || 2.8);
      const dimesScaleFactor = weldSettings.dimes_scale ?? 1.0;
      const ribbonScaleFactor = weldSettings.ribbon_scale ?? 1.0;

      let scaleX = 0.032;
      let scaleY = 0.024;
      let scaleZ = 0.036;
      let dropSpacing = 0.015;

      if (weldSettings.bead_style === 'STACKED_DIMES') {
        // TIG / Pulse MIG Stacked Dimes - calibrated so 1.0x matches continuous ribbon profile visual scale
        scaleX = Math.max(0.012, (weldSettings.dime_length * (currentWidth / 9.0) * 0.0048) * dimesScaleFactor);
        scaleY = Math.max(0.008, (currentHeight * 0.0062) * dimesScaleFactor);
        scaleZ = Math.max(0.014, (currentWidth * 0.0055) * dimesScaleFactor);

        // Stacking overlap threshold scaled by live multiplier
        const overlapFraction = THREE.MathUtils.clamp(weldSettings.dime_overlap_pct / 100, 0.25, 0.85);
        dropSpacing = Math.max(0.005, scaleX * sm * 0.9 * (1 - overlapFraction));
      } else {
        // Continuous GMAW / MIG Ribbon Bead with sinusoidal ripple driven by physics engine
        const cumulativeDist = i * 0.5 + segmentProgressRef.current * segDistance;
        const ripple = Math.sin((cumulativeDist / Math.max(0.002, weldSettings.ripple_pitch * 0.003)) * Math.PI * 2) * weldSettings.ripple_amplitude;

        scaleX = Math.max(0.012, (currentWidth * 0.0048) * ribbonScaleFactor);
        scaleY = Math.max(0.008, (currentHeight * 0.0062) * (1 + ripple) * ribbonScaleFactor);
        scaleZ = Math.max(0.014, (currentWidth * 0.0055) * (1 + ripple * 0.3) * ribbonScaleFactor);

        dropSpacing = Math.max(0.004, (currentWidth * 0.002) * sm * 0.35);
      }

      // 2. Live Defect Geometry & Gap Modifiers for Instanced Capsules:
      if (arcStatus === 'too_cold_stubbing') {
        const isSputtering = Math.random() > 0.85; // 15% chance to break the line
        // Narrow, ropey cross-section — the render pass turns this into a stringy worm.
        // Height is only mildly boosted so the bead doesn't spike upward.
        scaleX *= 0.55;
        scaleZ *= 0.55;
        scaleY *= 1.20;
        dropSpacing = Math.max(0.004, dropSpacing * 0.65);
        if (isSputtering) {
          lastBeadDropPosRef.current = currentTorchWorldPos.clone();
          return; // Skip pushing to beadsListRef to leave a gap
        }
      } else if (arcStatus === 'too_hot_globular') {
        // Flat, slightly wider puddle. Per-bead width/length jitter is applied at render
        // time to make the crater read as inconsistent rather than as a uniform giant disc.
        scaleX *= 1.10;
        scaleZ *= 1.25;
        scaleY *= 0.55;
      }

      if (travelStatus === 'too_fast_disconnected') {
        // Disconnected Beads: pitch calculation so distance between drops is larger than bead radius
        scaleX = Math.max(0.009, scaleX * 0.70);
        scaleZ = Math.max(0.009, scaleZ * 0.70);
        scaleY = Math.max(0.007, scaleY * 0.72);
        dropSpacing = Math.max(0.046, (scaleX * sm) * 2.5);
      } else if (travelStatus === 'too_slow_glob') {
        // Giant Globs: Multiply bead volume & scale
        scaleX *= 2.1;
        scaleY *= 1.85;
        scaleZ *= 2.1;
        dropSpacing = Math.max(0.003, dropSpacing * 0.55);

        // Burn-Through crater holes left when speed is critically slow
        if (travelSpeed <= 16) {
          const lastHole = burnHolesRef.current[burnHolesRef.current.length - 1];
          if (!lastHole || lastHole.distanceTo(currentTorchWorldPos) >= 0.035) {
            burnHolesRef.current.push(currentTorchWorldPos.clone());
          }
        }
      }

      // Hard Failure Guard: Stop depositing 3D bead if physical dimensions are 0
      const isHardFailure = currentWidth <= 0 || currentHeight <= 0;

      // Deposit weld bead if robot has traveled far enough and arc is not in hard failure
      if (
        !isHardFailure &&
        (!lastBeadDropPosRef.current ||
        lastBeadDropPosRef.current.distanceTo(currentTorchWorldPos) >= dropSpacing)
      ) {
        lastBeadDropPosRef.current = currentTorchWorldPos.clone();

        beadsListRef.current.push({
          pos: currentTorchWorldPos.clone(),
          quaternion: beadQuat.clone(),
          scale: new THREE.Vector3(scaleX, scaleY, scaleZ),
          heat: 1.0,
          style: weldSettings.bead_style,
          health: weldHealth,
          arcStatus: arcStatus,
          travelStatus: travelStatus,
        });
        if (beadsListRef.current.length % 4 === 0 || beadsListRef.current.length <= 4) {
          setBeadCount(beadsListRef.current.length);
        }
      }
    }
  });

  // Smelting Timeline Loop without triggering state updaters every frame
  useFrame((_, delta) => {
    if (phase === 'smelt') {
      smeltTimeRef.current += delta;
      const t = smeltTimeRef.current;

      if (workpieceMeshRef.current) {
        if (t < 3.3) {
          workpieceMeshRef.current.scale.set(1, 1, 0.02);
          workpieceMeshRef.current.visible = false;
        } else if (t <= 5.2) {
          workpieceMeshRef.current.visible = true;
          const fillProg = THREE.MathUtils.smoothstep(t, 3.3, 5.2);
          workpieceMeshRef.current.scale.set(1, 1, Math.max(0.04, fillProg));
        } else {
          workpieceMeshRef.current.visible = true;
          workpieceMeshRef.current.scale.set(1, 1, 1);
        }
      }

      if (t >= 5.4 && !steamAudioRef.current) {
        steamAudioRef.current = true;
        playSteamHissSound();
      }

      if (t >= 5.2 && alloyMaterialRef.current) {
        const coolProgress = THREE.MathUtils.clamp((t - 5.2) / 2.2, 0, 1);

        const moltenColor = new THREE.Color('#ff3b00');
        const steelColor = new THREE.Color('#334155');
        alloyMaterialRef.current.color.lerpColors(moltenColor, steelColor, coolProgress);

        const moltenEmissive = new THREE.Color('#ff7700');
        const blackEmissive = new THREE.Color('#000000');
        alloyMaterialRef.current.emissive.lerpColors(moltenEmissive, blackEmissive, coolProgress);
        alloyMaterialRef.current.emissiveIntensity = (1 - coolProgress) * 3.2;
        alloyMaterialRef.current.roughness = THREE.MathUtils.lerp(0.15, 0.45, coolProgress);
        alloyMaterialRef.current.metalness = THREE.MathUtils.lerp(0.7, 0.9, coolProgress);
      }

      if (t >= 7.5) {
        setTimeout(() => {
          setPhase('done');
          playSuccessChime();
          if (!hasNotifiedRef.current && shapeGroupRef.current && onShapeCreated) {
            hasNotifiedRef.current = true;
            onShapeCreated(shapeGroupRef.current);
          }
        }, 0);
      }
    } else if (
      (phase === 'plan_path' || phase === 'execute') &&
      alloyMaterialRef.current
    ) {
      alloyMaterialRef.current.color.set('#334155');
      alloyMaterialRef.current.emissive.set('#000000');
      alloyMaterialRef.current.emissiveIntensity = 0;
      alloyMaterialRef.current.roughness = 0.45;
      alloyMaterialRef.current.metalness = 0.9;
    }
  });

  useEffect(() => {
    if (phase === 'draw') {
      hasNotifiedRef.current = false;
      steamAudioRef.current = false;
      beadsListRef.current = [];
    }
  }, [phase]);

  return (
    <group ref={shapeGroupRef}>
      {/* 3X Heavy Steel Fabrication Worktable */}
      <TableModel />

      {/* Interactive Sketching Top Surface Plane */}
      {phase === 'draw' && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[TABLE_CENTER[0], DRAW_PLANE_Y, TABLE_CENTER[2]]}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <planeGeometry args={[TABLE_WIDTH * 0.95, TABLE_DEPTH * 0.93]} />
          <meshBasicMaterial transparent opacity={0.01} depthWrite={false} />
        </mesh>
      )}

      {/* Live Cyan Polyline Path */}
      {phase === 'draw' && points.length > 1 && (
        <Line
          points={points.map((p) => [p.x, p.y, p.z] as [number, number, number])}
          color="#38bdf8"
          lineWidth={4.5}
          depthTest={false}
        />
      )}

      {/* Point Nodes */}
      {phase === 'draw' &&
        points.map((pt, idx) => (
          <mesh key={idx} position={[pt.x, DRAW_PLANE_Y + 0.01, pt.z]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshBasicMaterial color="#00ffff" />
          </mesh>
        ))}

      {/* Drawn Mold Outline Perimeter on Table */}
      {phase !== 'draw' && points.length > 2 && (
        <Line
          points={points.map((p) => [p.x, p.y, p.z] as [number, number, number])}
          color={phase === 'done' || phase === 'plan_path' || phase === 'execute' ? '#10b981' : '#f59e0b'}
          lineWidth={3.0}
          position={[0, DRAW_PLANE_Y, 0]}
        />
      )}

      {/* Extruded 3D Alloy Workpiece */}
      {customShape && (
        <mesh
          ref={workpieceMeshRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, TABLE_SURFACE_Y, 0]}
          castShadow
          receiveShadow
          onClick={handleWorkpieceClick}
        >
          <extrudeGeometry args={[customShape, extrudeSettings]} />
          <meshStandardMaterial
            ref={alloyMaterialRef}
            color={phase === 'done' || phase === 'plan_path' || phase === 'execute' ? '#334155' : '#ff3b00'}
            emissive={phase === 'done' || phase === 'plan_path' || phase === 'execute' ? '#000000' : '#ff7700'}
            emissiveIntensity={phase === 'done' || phase === 'plan_path' || phase === 'execute' ? 0 : 3.2}
            metalness={0.9}
            roughness={0.4}
          />
        </mesh>
      )}

      {/* STAGE 2: WELD PATH WAYPOINTS & TRAJECTORY LINE */}
      {phase === 'plan_path' && (
        <group>
          {weldNodes.map((node, index) => (
            <group key={index} position={node}>
              <Sphere args={[0.032, 16, 16]}>
                <meshBasicMaterial color="#ff0055" />
              </Sphere>
              <Sphere args={[0.048, 12, 12]}>
                <meshBasicMaterial color="#ff0055" transparent opacity={0.35} depthWrite={false} />
              </Sphere>
            </group>
          ))}

          {weldNodes.length > 1 && (
            <Line
              points={weldNodes.map((p) => [p.x, p.y + 0.005, p.z] as [number, number, number])}
              color="#ff0055"
              lineWidth={3.5}
            />
          )}
        </group>
      )}

      {/* STAGE 3: Clean subtle seam guide before arc strike (hidden during/after welding to prevent ghosting) */}
      {phase === 'execute' && !isWelding && beadCount === 0 && (
        <group>
          {weldNodes.map((node, index) => (
            <mesh key={index} position={[node.x, node.y + 0.003, node.z]}>
              <sphereGeometry args={[0.016, 12, 12]} />
              <meshBasicMaterial color="#06b6d4" />
            </mesh>
          ))}
          {weldNodes.length > 1 && (
            <Line
              points={weldNodes.map((p) => [p.x, p.y + 0.004, p.z] as [number, number, number])}
              color="#06b6d4"
              lineWidth={1.5}
              transparent
              opacity={0.45}
            />
          )}
        </group>
      )}

      {/* STAGE 3: BURN-THROUGH CRATER HOLES WHEN TRAVEL SPEED IS TOO SLOW */}
      <BurnThroughHoles burnHoles={burnHolesRef.current} />

      {/* STAGE 3: PHYSICAL METALLIC WELD BEAD DEPOSITION VIA GPU INSTANCING */}
      <WeldBeadsInstanced
        beadsListRef={beadsListRef}
        beadCount={beadCount}
        weldSettings={weldSettings}
        weldHealth={weldHealth}
        arcStatus={arcStatus}
        travelStatus={travelStatus}
      />

      {/* STAGE 3: ROBOTIC J6 WELD TORCH & ACTIVE ARC */}
      {phase === 'execute' && (
        <RoboticWelderTool
          toolGroupRef={toolGroupRef}
          isArcActive={isWelding}
          voltage={voltage}
          wireFeed={wireFeed}
          weldHealth={weldHealth}
          arcStatus={arcStatus}
          travelStatus={travelStatus}
        />
      )}

      {/* Giant Foundry Cauldron Pot & Ingot Toss Animation */}
      {phase === 'smelt' && (
        <>
          <GiantFoundryCauldron
            smeltTimeRef={smeltTimeRef}
            targetCentroid={targetCentroid}
          />

          <MetalIngotsToss
            smeltTimeRef={smeltTimeRef}
            cauldronPos={new THREE.Vector3(targetCentroid.x, 1.45, targetCentroid.z - 0.62)}
          />

          <MoltenPourStream
            smeltTimeRef={smeltTimeRef}
            targetCentroid={targetCentroid}
          />

          <SteamPuffParticles
            active={true}
            position={[targetCentroid.x, TABLE_SURFACE_Y + 0.2, targetCentroid.z]}
          />
        </>
      )}
    </group>
  );
}

// Main Fabrication Forge View with Stages 1, 2, and 3
export default function FabricationForgeView({
  onBack,
  onPathConfirmed,
  onShapeCreated,
}: FabricationForgeProps) {
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [phase, setPhase] = useState<'draw' | 'smelt' | 'done' | 'plan_path' | 'execute'>('draw');
  const [cameraMode, setCameraMode] = useState<'isometric' | 'top' | 'front'>('top');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [weldNodes, setWeldNodes] = useState<THREE.Vector3[]>([]);
  const [smeltProgress, setSmeltProgress] = useState(0);

  // Persistent Beads mutable list ref at parent level so beads NEVER disappear after weld completes
  const beadsListRef = useRef<InternalBead[]>([]);

  // Smelt timer ref to eliminate per-frame React re-renders
  const smeltTimeRef = useRef(0);

  // Stage 3 Welding Parameters & State (Driven by Two-Gate Synergistic Physics Engine)
  const [wireProfiles, setWireProfiles] = useState<Record<string, WireProfile>>(DEFAULT_WIRE_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>('fcaw_045');

  const activeProfile = normalizeWireProfile(wireProfiles[activeProfileId] || DEFAULT_WIRE_PROFILES.fcaw_045);

  const handleUpdateProfile = (updated: WireProfile) => {
    const norm = normalizeWireProfile(updated);
    setWireProfiles((prev) => ({
      ...prev,
      [norm.id]: norm,
    }));
  };

  const [voltage, setVoltage] = useState(24.0); // Volts
  const [wireFeed, setWireFeed] = useState(300); // WFS (IPM)
  const [travelSpeed, setTravelSpeed] = useState(30); // cm/min
  const [isWelding, setIsWelding] = useState(false);
  const [beadCount, setBeadCount] = useState(0);
  const [weldSettings, setWeldSettings] = useState<RoboDKWeldSettings>(ROBODK_DEFAULT_SETTINGS);

  // Two-Gate Synergistic Physics: Gate 1 Arc Stability + Gate 2 Deposit Geometry
  const {
    arcStatus,
    weldHealth,
    expectedVolt,
    wfsPct,
    statusMessage,
    isStable,
    travelStatus,
    speedMessage,
    defectMessage,
    width: currentWidth,
    height: currentHeight,
    targetWidth: targetIdealWidth,
    targetHeight: targetIdealHeight,
  } = useWeldPhysics(voltage, wireFeed, travelSpeed, activeProfile);

  // Dynamic Procedural Web Audio Engine for Live Welding Arc & Speed States
  useWeldAudio(isWelding && phase === 'execute', arcStatus, travelStatus, voltage);

  // Bottom Control Dock Sizing & Layout State (gives user full control & live feedback)
  const [bottomDockMode, setBottomDockMode] = useState<'floating' | 'full' | 'minimized'>('floating');
  const [bottomDockWidth, setBottomDockWidth] = useState<number>(540); // 480 to 600 px
  const [bottomHeightMode, setBottomHeightMode] = useState<'compact' | 'studio'>('compact');
  const [isTopHeaderExpanded, setIsTopHeaderExpanded] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  const { loadAllSettings } = useDebugSettings();

  // Hydrate debug & calibration settings on initial mount with defensive normalization
  useEffect(() => {
    try {
      const saved = loadAllSettings();
      if (saved) {
        if (saved.activeProfileId && (DEFAULT_WIRE_PROFILES[saved.activeProfileId] || saved.customProfiles?.[saved.activeProfileId])) {
          setActiveProfileId(saved.activeProfileId);
        }
        if (
          saved.customProfiles &&
          typeof saved.customProfiles === 'object' &&
          !Array.isArray(saved.customProfiles)
        ) {
          const normalizedMap: Record<string, WireProfile> = {};
          Object.entries(saved.customProfiles).forEach(([id, p]) => {
            if (p && typeof p === 'object') {
              normalizedMap[id] = normalizeWireProfile(p);
            }
          });
          setWireProfiles((prev) => ({
            ...(prev || DEFAULT_WIRE_PROFILES),
            ...normalizedMap,
          }));
        }
        if (saved.settings) {
          setWeldSettings((prev) => ({
            ...prev,
            ...saved.settings,
          }));
        }
        if (saved.bottomDockMode) {
          setBottomDockMode(saved.bottomDockMode);
        }
        if (typeof saved.bottomDockWidth === 'number') {
          setBottomDockWidth(saved.bottomDockWidth);
        }
        if (saved.bottomHeightMode) {
          setBottomHeightMode(saved.bottomHeightMode);
        }
      }
    } catch (e) {
      console.warn('Could not restore debug settings:', e);
    }
  }, []);

  const orbitControlsRef = useRef<any>(null);

  // Smooth Smelting Progress HUD updater without 60fps React state dispatching
  useEffect(() => {
    if (phase !== 'smelt') {
      setSmeltProgress(0);
      return;
    }
    const interval = setInterval(() => {
      const prog = Math.min(100, Math.round((smeltTimeRef.current / 7.5) * 100));
      setSmeltProgress(prog);
    }, 100);
    return () => clearInterval(interval);
  }, [phase]);

  const handleReset = () => {
    playClickSound();
    setPoints([]);
    setIsDrawing(false);
    setPhase('draw');
    smeltTimeRef.current = 0;
    setSmeltProgress(0);
    setSelectedTemplate(null);
    setCameraMode('top');
    setWeldNodes([]);
    setIsWelding(false);
    beadsListRef.current = [];
    setBeadCount(0);
  };

  const handleSmelt = () => {
    if (points.length < 3) return;
    playImpactSound(1.2);
    smeltTimeRef.current = 0;
    setSmeltProgress(0);
    setPhase('smelt');
    setCameraMode('isometric');
  };

  const handleReplay = () => {
    if (points.length < 3) return;
    playClickSound();
    smeltTimeRef.current = 0;
    setSmeltProgress(0);
    setPhase('smelt');
    setCameraMode('isometric');
  };

  // Start Stage 2 Weld Path Planning
  const handleStartPathPlan = () => {
    playClickSound();
    setPhase('plan_path');
    setCameraMode('isometric');
    if (weldNodes.length === 0 && points.length >= 3) {
      // Auto-populate initial weld path along top perimeter seam of the workpiece
      const initialPath = points.map(
        (p) => new THREE.Vector3(p.x, WORKPIECE_TOP_Y, p.z)
      );
      setWeldNodes(initialPath);
    }
  };

  // Switch to Stage 3 Robotic Weld Execution
  const handleStartStage3 = () => {
    playSuccessChime();
    setPhase('execute');
    setCameraMode('isometric');
    setIsWelding(false);

    let activeNodes = weldNodes;
    if (activeNodes.length < 2 && points.length >= 3) {
      activeNodes = points.map(
        (p) => new THREE.Vector3(p.x, WORKPIECE_TOP_Y, p.z)
      );
      setWeldNodes(activeNodes);
    }

    if (points.length >= 3) {
      const shape = new THREE.Shape();
      shape.moveTo(points[0].x, -points[0].z);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, -points[i].z);
      }
      if (onPathConfirmed) {
        onPathConfirmed(shape, activeNodes);
      }
    }
  };

  // Strike Arc trigger - starts fresh weld and preserves all beads when finished
  const handleStrikeArc = () => {
    if (weldNodes.length < 2) return;
    playArcStrikeSound();
    beadsListRef.current = [];
    setBeadCount(0);
    setIsWelding(true);
  };

  // Quick Preset Templates for 3X Table
  const loadPresetTemplate = (type: 'bracket' | 'gusset' | 'flange' | 'chassis') => {
    playClickSound();
    setSelectedTemplate(type);
    const [cx, , cz] = TABLE_CENTER;
    let newPts: THREE.Vector3[] = [];

    if (type === 'bracket') {
      newPts = [
        new THREE.Vector3(cx - 0.85, DRAW_PLANE_Y, cz - 0.65),
        new THREE.Vector3(cx + 0.85, DRAW_PLANE_Y, cz - 0.65),
        new THREE.Vector3(cx + 0.85, DRAW_PLANE_Y, cz - 0.2),
        new THREE.Vector3(cx - 0.35, DRAW_PLANE_Y, cz - 0.2),
        new THREE.Vector3(cx - 0.35, DRAW_PLANE_Y, cz + 0.65),
        new THREE.Vector3(cx - 0.85, DRAW_PLANE_Y, cz + 0.65),
        new THREE.Vector3(cx - 0.85, DRAW_PLANE_Y, cz - 0.65),
      ];
    } else if (type === 'gusset') {
      newPts = [
        new THREE.Vector3(cx - 0.8, DRAW_PLANE_Y, cz - 0.6),
        new THREE.Vector3(cx + 0.8, DRAW_PLANE_Y, cz - 0.6),
        new THREE.Vector3(cx + 0.8, DRAW_PLANE_Y, cz + 0.6),
        new THREE.Vector3(cx - 0.8, DRAW_PLANE_Y, cz - 0.6),
      ];
    } else if (type === 'flange') {
      const r = 0.75;
      for (let i = 0; i <= 6; i++) {
        const ang = (i * Math.PI * 2) / 6;
        newPts.push(new THREE.Vector3(cx + Math.cos(ang) * r, DRAW_PLANE_Y, cz + Math.sin(ang) * r));
      }
    } else {
      newPts = [
        new THREE.Vector3(cx - 0.95, DRAW_PLANE_Y, cz - 0.55),
        new THREE.Vector3(cx + 0.95, DRAW_PLANE_Y, cz - 0.55),
        new THREE.Vector3(cx + 0.95, DRAW_PLANE_Y, cz - 0.3),
        new THREE.Vector3(cx + 0.25, DRAW_PLANE_Y, cz - 0.3),
        new THREE.Vector3(cx + 0.25, DRAW_PLANE_Y, cz + 0.3),
        new THREE.Vector3(cx + 0.95, DRAW_PLANE_Y, cz + 0.3),
        new THREE.Vector3(cx + 0.95, DRAW_PLANE_Y, cz + 0.55),
        new THREE.Vector3(cx - 0.95, DRAW_PLANE_Y, cz + 0.55),
        new THREE.Vector3(cx - 0.95, DRAW_PLANE_Y, cz + 0.3),
        new THREE.Vector3(cx - 0.25, DRAW_PLANE_Y, cz + 0.3),
        new THREE.Vector3(cx - 0.25, DRAW_PLANE_Y, cz - 0.3),
        new THREE.Vector3(cx - 0.95, DRAW_PLANE_Y, cz - 0.3),
        new THREE.Vector3(cx - 0.95, DRAW_PLANE_Y, cz - 0.55),
      ];
    }

    setPoints(newPts);
  };

  const getSmeltStageLabel = () => {
    const t = smeltTimeRef.current;
    if (t < 1.6) return 'Tossing raw alloy ingots into giant crucible...';
    if (t < 3.2) return 'Superheating molten pot & bubbling lava...';
    if (t < 5.3) return 'Tilting crucible & pouring liquid metal into shape mold...';
    return 'Quenching alloy & cooling into solid steel...';
  };

  const cameraConfig = useMemo(() => {
    if (cameraMode === 'top') {
      return { position: [0, 5.0, 0.001] as [number, number, number], fov: 48 };
    }
    if (cameraMode === 'front') {
      return { position: [0, 2.5, 4.4] as [number, number, number], fov: 46 };
    }
    return { position: [3.4, 3.4, 4.0] as [number, number, number], fov: 46 };
  }, [cameraMode]);

  return (
    <div className="flex flex-col flex-1 w-full h-full bg-[#07090e] text-slate-100 font-sans select-none relative overflow-hidden">
      {/* UNIFIED COLLAPSIBLE TOP HEADER */}
      <div className="absolute top-2 left-2 right-2 z-40 pointer-events-none">
        <div className="pointer-events-auto bg-[#0a0d16]/95 backdrop-blur-md border border-slate-800/90 rounded-2xl shadow-2xl transition-all overflow-hidden">
          {/* Main Top Header Bar */}
          <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
            {/* Left Section: Back button + Stage Pill */}
            <div className="flex items-center gap-1.5">
              {onBack && (
                <button
                  onClick={() => {
                    playClickSound();
                    onBack();
                  }}
                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-mono transition-all cursor-pointer"
                  title="Return to Robot Hub"
                >
                  <ArrowLeft size={14} />
                </button>
              )}

              {/* Stage Badge & Quick Info */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] sm:text-xs font-mono">
                {phase === 'execute' ? (
                  <>
                    <Zap size={12} className="text-amber-400" />
                    <span className="font-bold text-amber-300">Stage 3<span className="hidden sm:inline">: Robotic Weld</span></span>
                  </>
                ) : phase === 'plan_path' ? (
                  <>
                    <Crosshair size={12} className="text-rose-400" />
                    <span className="font-bold text-rose-300">Stage 2<span className="hidden sm:inline">: Path Waypoints</span></span>
                  </>
                ) : (
                  <>
                    <Flame size={12} className="text-orange-400" />
                    <span className="font-bold text-orange-300">Stage 1<span className="hidden sm:inline">: Foundry &amp; Drawing</span></span>
                  </>
                )}
              </div>
            </div>

            {/* Middle / Right Section: View Controls + Detail Info Toggle */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              {/* Camera View Selector */}
              <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                <button
                  onClick={() => {
                    playClickSound();
                    setCameraMode('isometric');
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    cameraMode === 'isometric'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Isometric 3D Perspective"
                >
                  3D
                </button>
                <button
                  onClick={() => {
                    playClickSound();
                    setCameraMode('top');
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    cameraMode === 'top'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Overhead Top View"
                >
                  Top
                </button>
                <button
                  onClick={() => {
                    playClickSound();
                    setCameraMode('front');
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    cameraMode === 'front'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Front Elevation View"
                >
                  Front
                </button>
              </div>

              {/* Detail Info Toggle Button */}
              <button
                onClick={() => setIsTopHeaderExpanded(!isTopHeaderExpanded)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  isTopHeaderExpanded
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white hover:bg-slate-800'
                }`}
                title="Toggle Detail Info & Stage Quick Actions"
              >
                <Compass size={13} className="text-cyan-400" />
                <span className="hidden sm:inline">Detail Info</span>
                <ChevronDown size={13} className={`transition-transform ${isTopHeaderExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Consolidated Developer Debug Tools Button */}
              <button
                onClick={() => {
                  playClickSound();
                  setIsDebugOpen(!isDebugOpen);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  isDebugOpen
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                }`}
                title="Toggle Consolidated Developer Debug Tools"
              >
                <Wrench size={13} className={isDebugOpen ? 'text-amber-400' : 'text-slate-400'} />
                <span className="hidden sm:inline">Debug Tools</span>
                <ChevronDown size={13} className={`transition-transform ${isDebugOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Collapsible Drawer Panel: Detail Info & Stage Guidance */}
          {isTopHeaderExpanded && (
            <div className="border-t border-slate-800/80 bg-slate-950/90 px-3 py-2 text-xs font-mono flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
              {/* Detail Info Row */}
              <div className="flex flex-wrap items-center gap-3 text-slate-400 text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Table:</span>
                  <span className="text-slate-200 font-bold">3.75m × 2.55m (150mm grid)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Workpiece:</span>
                  <span className="text-amber-300 font-bold">
                    {points.length} vertices {points.length > 2 ? '(Closed)' : ''}
                  </span>
                </div>
                {weldNodes.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Path:</span>
                    <span className="text-rose-400 font-bold">
                      {weldNodes.length} waypoints · {beadCount} beads
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Wire:</span>
                  <span className="text-cyan-300 font-bold">{activeProfile.name}</span>
                </div>
              </div>

              {/* Stage Specific Interactive Action Buttons inside Header Drawer */}
              {phase === 'execute' && (
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className={`px-2 py-0.5 rounded border font-bold ${
                    weldHealth === 'perfect'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : weldHealth === 'too_cold'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {weldHealth === 'perfect' ? '🔥 Arc Status: Optimal (Target ±15%)' : weldHealth === 'too_cold' ? '❄️ Arc Status: Underfill / Sputtering' : '🌋 Arc Status: Overfill / Burn Hazard'}
                  </span>
                </div>
              )}

              {phase === 'plan_path' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setWeldNodes([])}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-mono border border-slate-700 transition-all cursor-pointer"
                  >
                    <Trash2 size={11} />
                    <span>Clear Path</span>
                  </button>
                  {weldNodes.length > 1 && (
                    <button
                      onClick={handleStartStage3}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold font-mono transition-all cursor-pointer shadow-lg shadow-rose-600/30"
                    >
                      <Send size={11} />
                      <span>Send to Robot (Stage 3)</span>
                    </button>
                  )}
                </div>
              )}

              {phase === 'smelt' && (
                <div className="flex items-center gap-2 text-[11px] text-amber-300">
                  <Flame size={13} className="text-orange-400 animate-pulse" />
                  <span>Crucible: {smeltProgress}% ({getSmeltStageLabel()})</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CONSOLIDATED COLLAPSIBLE DEVELOPER DEBUG TOOLS MODAL */}
      {isDebugOpen && (
        <div className="absolute top-14 right-2 sm:right-4 z-50 w-[calc(100vw-16px)] sm:w-[540px] max-w-[560px] animate-in fade-in zoom-in-95 duration-150">
          <WeldDebugTool
            settings={weldSettings}
            onUpdateSettings={setWeldSettings}
            beadCount={beadCount}
            onClearBeads={() => {
              beadsListRef.current = [];
              setBeadCount(0);
            }}
            currentVolt={voltage}
            currentWFS={wireFeed}
            currentSpeed={travelSpeed}
            activeProfile={activeProfile}
            profiles={wireProfiles}
            onSelectProfile={setActiveProfileId}
            onUpdateProfile={handleUpdateProfile}
            isEmbedded={true}
            onClose={() => setIsDebugOpen(false)}
          />
        </div>
      )}

      {/* Main 3D Canvas Viewport */}
      <div className="relative flex-1 w-full bg-[#05070c] overflow-hidden">
        <Canvas
          shadows="percentage"
          camera={{ position: [0, 5.0, 0.001], fov: 48 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.3,
          }}
          className={`touch-none ${phase === 'plan_path' ? 'cursor-pointer' : 'cursor-crosshair'}`}
        >
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[5, 12, 5]}
            intensity={2.0}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-4, 6, -3]} intensity={0.8} color="#38bdf8" />
          <pointLight position={[3, 5, 4]} intensity={0.7} color="#f59e0b" />

          {/* Camera Director with Free Control after Animation */}
          <CameraDirector
            phase={phase}
            cameraMode={cameraMode}
            controlsRef={orbitControlsRef}
          />

          {/* Table & Foundry Smelting Scene Component */}
          <InteractiveFabricationScene
            points={points}
            setPoints={setPoints}
            isDrawing={isDrawing}
            setIsDrawing={setIsDrawing}
            phase={phase}
            setPhase={setPhase}
            smeltTimeRef={smeltTimeRef}
            weldNodes={weldNodes}
            setWeldNodes={setWeldNodes}
            voltage={voltage}
            wireFeed={wireFeed}
            travelSpeed={travelSpeed}
            isWelding={isWelding}
            setIsWelding={setIsWelding}
            beadCount={beadCount}
            setBeadCount={setBeadCount}
            weldSettings={weldSettings}
            beadsListRef={beadsListRef}
            onShapeCreated={onShapeCreated}
            currentWidth={currentWidth}
            currentHeight={currentHeight}
            weldHealth={weldHealth}
            arcStatus={arcStatus}
            travelStatus={travelStatus}
          />

          <ContactShadows position={[0, -0.9, 0]} opacity={0.65} scale={9} blur={2.5} far={4} />
          <Environment preset="city" />

          <OrbitControls
            ref={orbitControlsRef}
            enabled={!isDrawing}
            target={[0, TABLE_SURFACE_Y, 0]}
            minDistance={0.8}
            maxDistance={15}
            maxPolarAngle={Math.PI / 2 - 0.02}
            enablePan={true}
            enableDamping
            dampingFactor={0.06}
          />
        </Canvas>

        {/* Live Drawing Status Banner */}
        {phase === 'draw' && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-cyan-500/40 text-cyan-300 px-4 py-2 rounded-full font-mono text-xs shadow-xl pointer-events-none">
            <MousePointer size={14} className="text-cyan-400 animate-pulse" />
            <span>Click &amp; drag across table surface to sketch cross-section</span>
          </div>
        )}
      </div>

      {/* COMPACT & RESIZABLE FLOATING BOTTOM CONTROL DOCK */}
      {bottomDockMode === 'minimized' ? (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => {
              playClickSound();
              setBottomDockMode('floating');
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-950/90 hover:bg-slate-900 border border-amber-500/60 text-amber-300 hover:text-white font-mono text-[11px] font-bold shadow-2xl backdrop-blur-md transition-all cursor-pointer hover:border-amber-400"
          >
            <Zap size={13} className="text-amber-400 animate-pulse" />
            <span className="hidden sm:inline">⚡ Controls Dock ({phase === 'execute' ? 'Stage 3 Robot' : phase === 'plan_path' ? 'Stage 2 Waypoints' : 'Stage 1 Foundry'})</span>
            <span className="inline sm:hidden">⚡ Open Controls</span>
            <ChevronUp size={13} />
          </button>
        </div>
      ) : (
        <div
          className={
            bottomDockMode === 'floating'
              ? 'absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100vw-16px)] max-w-[560px] transition-all duration-150'
              : 'w-full border-t border-slate-800/80 bg-[#0a0d16]/95 backdrop-blur-md transition-all duration-150 flex justify-center'
          }
          style={bottomDockMode === 'floating' ? { maxWidth: `${Math.min(bottomDockWidth, 600)}px` } : undefined}
        >
          <div
            className={`flex flex-col gap-2 font-mono w-full ${
              bottomDockMode === 'floating'
                ? 'bg-slate-950/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-2 sm:p-3'
                : 'p-2 sm:p-3 max-w-[560px] mx-auto'
            }`}
          >
            {/* Top Toolbar: Stage Title, Tabs, and Mode Switchers */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1 border-b border-slate-800/80 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-200 flex items-center gap-1 text-[11px] sm:text-xs">
                  {phase === 'execute' ? (
                    <>
                      <Zap size={12} className="text-amber-400" />
                      <span>Stage 3</span>
                    </>
                  ) : phase === 'plan_path' ? (
                    <>
                      <Crosshair size={12} className="text-rose-400" />
                      <span>Stage 2</span>
                    </>
                  ) : (
                    <>
                      <Flame size={12} className="text-orange-400" />
                      <span>Stage 1</span>
                    </>
                  )}
                </span>
              </div>

              {/* Sizing & Layout Controls Bar */}
              <div className="flex items-center gap-1">
                {/* Height Mode Switcher for Stage 3 */}
                {phase === 'execute' && (
                  <button
                    onClick={() => setBottomHeightMode(bottomHeightMode === 'compact' ? 'studio' : 'compact')}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] transition-all cursor-pointer"
                    title="Toggle Dials View"
                  >
                    <span>{bottomHeightMode === 'compact' ? '🎛️ Dials' : '⚡ Slim'}</span>
                  </button>
                )}

                {/* Minimize to Pill Button */}
                <button
                  onClick={() => setBottomDockMode('minimized')}
                  className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs transition-all cursor-pointer"
                  title="Minimize Dock"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>

            {/* STAGE 3 CONTROLS */}
            {phase === 'execute' && (
              <div className="flex flex-col gap-2.5">
                {/* Bead Style & Spec Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">Geometry:</span>
                    <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                      <button
                        onClick={() => {
                          playClickSound();
                          setWeldSettings((prev) => ({ ...prev, bead_style: 'STACKED_DIMES' }));
                        }}
                        className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                          weldSettings.bead_style === 'STACKED_DIMES'
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        🪙 Stacked Dimes
                      </button>
                      <button
                        onClick={() => {
                          playClickSound();
                          setWeldSettings((prev) => ({ ...prev, bead_style: 'RIBBON' }));
                        }}
                        className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                          weldSettings.bead_style === 'RIBBON'
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        🌊 Continuous Ribbon
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        playClickSound();
                        setPhase('plan_path');
                        setIsWelding(false);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs border border-slate-800 transition-all cursor-pointer"
                    >
                      <RotateCcw size={11} />
                      <span>Waypoints</span>
                    </button>
                  </div>
                </div>

                {/* Compact Mode: High-density Micro Steppers */}
                {bottomHeightMode === 'compact' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 rounded-xl p-2 border border-slate-800">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Active Wire Profile Selector */}
                      <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1.5 rounded-lg border border-cyan-500/30">
                        <span className="text-cyan-400 text-[10px] font-bold">Wire:</span>
                        <select
                          value={activeProfileId}
                          onChange={(e) => setActiveProfileId(e.target.value)}
                          className="bg-slate-900 text-cyan-200 font-mono text-[11px] font-bold rounded px-1.5 py-0.5 border border-slate-700 outline-none cursor-pointer"
                        >
                          {Object.values(wireProfiles || DEFAULT_WIRE_PROFILES).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Voltage Stepper */}
                      <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[11px]">Volt:</span>
                        <button
                          onClick={() => setVoltage((v) => Math.max(15.0, Math.round((v - 0.5) * 10) / 10))}
                          className="p-0.5 hover:text-amber-400 text-slate-400"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="text-amber-300 font-bold w-12 text-center">{voltage.toFixed(1)}V</span>
                        <button
                          onClick={() => setVoltage((v) => Math.min(25.0, Math.round((v + 0.5) * 10) / 10))}
                          className="p-0.5 hover:text-amber-400 text-slate-400"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Wire Feed Stepper */}
                      <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[11px]">WFS:</span>
                        <button
                          onClick={() => setWireFeed((w) => Math.max(100, w - 25))}
                          className="p-0.5 hover:text-cyan-400 text-slate-400"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="text-cyan-300 font-bold w-12 text-center">{wireFeed}</span>
                        <button
                          onClick={() => setWireFeed((w) => Math.min(600, w + 25))}
                          className="p-0.5 hover:text-cyan-400 text-slate-400"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Travel Speed Stepper (0 - 200 cm/min) */}
                      <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[11px]">Speed:</span>
                        <button
                          onClick={() => setTravelSpeed((s) => Math.max(0, s - 5))}
                          className="p-0.5 hover:text-emerald-400 text-slate-400"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="text-emerald-300 font-bold w-12 text-center">{travelSpeed}</span>
                        <button
                          onClick={() => setTravelSpeed((s) => Math.min(200, s + 5))}
                          className="p-0.5 hover:text-emerald-400 text-slate-400"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Live Calculated Bead Geometry Readout & Synergistic Arc Health Status */}
                      <div className="hidden sm:flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono">
                          <span className="text-slate-400">Bead:</span>
                          <span className="text-emerald-300 font-bold">{currentWidth.toFixed(1)}mm W</span>
                          <span className="text-slate-500">×</span>
                          <span className="text-cyan-300 font-bold">{currentHeight.toFixed(1)}mm H</span>
                        </div>

                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono font-bold transition-all ${
                          isStable && travelStatus === 'good_speed'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : travelStatus === 'too_fast_disconnected'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse ring-1 ring-amber-500/30'
                            : travelStatus === 'too_slow_glob'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse ring-1 ring-rose-500/30'
                            : arcStatus === 'too_cold_stubbing'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 animate-pulse ring-1 ring-sky-500/30'
                            : 'bg-orange-500/20 text-orange-300 border-orange-500/50 animate-pulse ring-1 ring-orange-500/30'
                        }`}
                        title={`${statusMessage} | ${speedMessage}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{
                            backgroundColor: isStable && travelStatus === 'good_speed'
                              ? '#10b981'
                              : travelStatus === 'too_fast_disconnected'
                              ? '#f59e0b'
                              : travelStatus === 'too_slow_glob'
                              ? '#ef4444'
                              : arcStatus === 'too_cold_stubbing'
                              ? '#0ea5e9'
                              : '#f97316'
                          }} />
                          <span>{defectMessage}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleStrikeArc}
                        disabled={isWelding}
                        className={`flex items-center justify-center gap-2 px-5 py-2 rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer ${
                          isWelding
                            ? 'bg-amber-500/20 border border-amber-500/60 text-amber-300 animate-pulse cursor-wait'
                            : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-orange-500/30'
                        }`}
                      >
                        <Zap size={14} className={isWelding ? 'animate-bounce' : 'fill-slate-950'} />
                        <span>{isWelding ? '⚡ Welding...' : '⚡ Strike Arc'}</span>
                      </button>

                      {beadCount > 0 && (
                        <button
                          onClick={() => {
                            playClickSound();
                            beadsListRef.current = [];
                            setBeadCount(0);
                          }}
                          disabled={isWelding}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white text-xs border border-slate-800 transition-all cursor-pointer"
                        >
                          <Trash2 size={12} />
                          <span>Clear ({beadCount})</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Studio Mode: Full Rotary Dials (0-200 cm/min Travel Speed, No Cool Dial) */
                  <div className="flex flex-col gap-3">
                    {/* Wire Profile & Physics Bar */}
                    <div className="flex flex-wrap flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 py-1.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-cyan-400 font-bold text-[11px] whitespace-nowrap">Spec Profile:</span>
                        <select
                          value={activeProfileId}
                          onChange={(e) => setActiveProfileId(e.target.value)}
                          className="bg-slate-900 text-cyan-200 font-mono text-xs font-bold rounded px-2 py-1 border border-slate-700 outline-none cursor-pointer w-full sm:w-auto"
                        >
                          {Object.values(wireProfiles || DEFAULT_WIRE_PROFILES).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono text-[11px]">
                        <span className="text-slate-400 whitespace-nowrap">
                          Expected: <strong className="text-yellow-300">{expectedVolt.toFixed(1)}V</strong> @ {wireFeed} IPM
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-bold whitespace-nowrap">
                          Bead: {currentWidth > 0 ? `${currentWidth.toFixed(2)}mm W × ${currentHeight.toFixed(2)}mm H` : '0.00mm (Failed)'}
                        </span>
                        <span className={`px-2 py-0.5 rounded border font-bold whitespace-nowrap text-[10px] ${
                          isStable && travelStatus === 'good_speed'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : travelStatus === 'too_fast_disconnected'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : travelStatus === 'too_slow_glob'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                            : arcStatus === 'too_cold_stubbing'
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                            : 'bg-orange-500/20 text-orange-300 border-orange-500/50'
                        }`}>
                          {defectMessage}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-around gap-4 sm:gap-6 py-3 bg-slate-950/70 rounded-xl border border-slate-800/80 px-2 sm:px-6">
                      <WeldDial
                        label="Voltage"
                        min={12.0}
                        max={36.0}
                        step={0.1}
                        value={voltage}
                        onChange={setVoltage}
                        unit="Volts"
                      />
                      <WeldDial
                        label="Wire Feed"
                        min={80}
                        max={650}
                        step={5}
                        value={wireFeed}
                        onChange={setWireFeed}
                        unit="IPM"
                      />
                      <WeldDial
                        label="Travel Speed"
                        min={0}
                        max={200}
                        step={1}
                        value={travelSpeed}
                        onChange={setTravelSpeed}
                        unit="cm/min"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                      <button
                        onClick={handleStrikeArc}
                        disabled={isWelding}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-8 py-2.5 rounded-xl font-bold text-xs shadow-xl transition-all cursor-pointer whitespace-nowrap ${
                          isWelding
                            ? 'bg-amber-500/20 border border-amber-500/60 text-amber-300 animate-pulse cursor-wait'
                            : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-orange-500/30'
                        }`}
                      >
                        <Zap size={16} className={isWelding ? 'animate-bounce' : 'fill-slate-950'} />
                        <span>{isWelding ? '⚡ Welding...' : '⚡ Strike Arc'}</span>
                      </button>

                      {beadCount > 0 && (
                        <button
                          onClick={() => {
                            playClickSound();
                            beadsListRef.current = [];
                            setBeadCount(0);
                          }}
                          disabled={isWelding}
                          className="flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs border border-slate-800 transition-all cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 size={13} />
                          <span>Clear ({beadCount})</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STAGE 1 & 2 CONTROLS */}
            {phase !== 'execute' && (
              <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 text-xs">
                {/* Preset Templates */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-slate-400 text-[11px] whitespace-nowrap">Templates:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'bracket', label: 'L-Bracket' },
                      { id: 'gusset', label: 'Gusset' },
                      { id: 'flange', label: 'Flange' },
                      { id: 'chassis', label: 'I-Beam' },
                    ].map((tmpl) => (
                      <button
                        key={tmpl.id}
                        disabled={phase === 'smelt' || phase === 'plan_path'}
                        onClick={() => loadPresetTemplate(tmpl.id as any)}
                        className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs border transition-all cursor-pointer whitespace-nowrap ${
                          selectedTemplate === tmpl.id
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800 hover:text-white'
                        } ${(phase === 'smelt' || phase === 'plan_path') ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {tmpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleReset}
                    disabled={phase === 'smelt'}
                    className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer ${
                      phase === 'smelt' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <RotateCcw size={12} />
                    <span>Clear</span>
                  </button>

                  {phase === 'done' && (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                      <button
                        onClick={handleReplay}
                        className="flex-1 sm:flex-none flex justify-center items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <RotateCw size={12} />
                        <span>Replay</span>
                      </button>
                      <button
                        onClick={handleStartPathPlan}
                        className="flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <Crosshair size={13} />
                        <span>📍 Plan Weld Path</span>
                      </button>
                    </div>
                  )}

                  {phase === 'plan_path' && (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                      <button
                        onClick={() => setWeldNodes([])}
                        className="flex-1 sm:flex-none flex justify-center items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 size={12} />
                        <span>Clear Path</span>
                      </button>
                      <button
                        onClick={handleStartStage3}
                        disabled={weldNodes.length < 2}
                        className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl font-bold transition-all shadow-lg cursor-pointer whitespace-nowrap ${
                          weldNodes.length >= 2
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30'
                            : 'bg-slate-900 text-slate-600 border border-slate-800/80 cursor-not-allowed'
                        }`}
                      >
                        <Send size={13} />
                        <span>🤖 Send to Robot (Stage 3)</span>
                      </button>
                    </div>
                  )}

                  {phase === 'draw' && (
                    <button
                      onClick={handleSmelt}
                      disabled={points.length < 3}
                      className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl font-bold transition-all shadow-lg cursor-pointer whitespace-nowrap mt-2 sm:mt-0 ${
                        points.length >= 3
                          ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-orange-600/30'
                          : 'bg-slate-900 text-slate-600 border border-slate-800/80 cursor-not-allowed'
                      }`}
                    >
                      <Flame size={13} className={points.length >= 3 ? 'animate-pulse' : ''} />
                      <span>🔥 Smelt &amp; Pour Metal</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
