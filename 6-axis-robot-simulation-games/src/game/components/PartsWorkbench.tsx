import { useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { PartConfig, PartTransform, Vec3 } from '../types';

const TABLE_Y = 0;
const TABLE_WIDTH = 3.6;
const TABLE_DEPTH = 2.4;

export interface WorkbenchTackPoint {
  id: string;
  world: Vec3;
  radius: number;
  done: boolean;
}

export interface PartsWorkbenchProps {
  parts: PartConfig[];
  transforms: Record<string, PartTransform>;
  /** Parts the player may drag right now. */
  draggableIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDrag: (id: string, position: Vec3) => void;
  tackPoints?: WorkbenchTackPoint[];
  onTack?: (id: string) => void;
  weldPath?: Vec3[];
  /** Ghost preview of the authored target arrangement. */
  ghost?: { partId: string; transform: PartTransform } | null;
  /** When true, dragging the pointer along the weld path drives grinding. */
  grinding?: boolean;
  onGrind?: (seconds: number) => void;
  aligned?: boolean;
}

function Table() {
  return (
    <group position={[0, TABLE_Y - 0.06, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[TABLE_WIDTH, 0.12, TABLE_DEPTH]} />
        <meshStandardMaterial color="#1b2434" metalness={0.85} roughness={0.35} />
      </mesh>
      <gridHelper
        args={[TABLE_WIDTH * 0.96, 24, '#38bdf8', '#334155']}
        position={[0, 0.062, 0]}
      />
    </group>
  );
}

function PartMesh({
  part,
  transform,
  selected,
  draggable,
  aligned,
  onSelect,
  onDragStart,
}: {
  part: PartConfig;
  transform: PartTransform;
  selected: boolean;
  draggable: boolean;
  aligned: boolean;
  onSelect: () => void;
  onDragStart: () => void;
}) {
  const color = aligned ? '#22c55e' : part.color || '#64748b';
  return (
    <group
      position={[
        transform.position[0],
        transform.position[1] + part.size[1] / 2,
        transform.position[2],
      ]}
      rotation={[0, (transform.rotationDeg * Math.PI) / 180, 0]}
    >
      <mesh
        castShadow
        receiveShadow
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (!draggable) return;
          e.stopPropagation();
          onSelect();
          onDragStart();
        }}
      >
        <boxGeometry args={part.size} />
        <meshStandardMaterial
          color={color}
          metalness={0.75}
          roughness={0.42}
          emissive={selected ? '#f59e0b' : '#000000'}
          emissiveIntensity={selected ? 0.25 : 0}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...part.size)]} />
        <lineBasicMaterial color={selected ? '#f59e0b' : '#0f172a'} />
      </lineSegments>
    </group>
  );
}

function GhostPart({ part, transform }: { part: PartConfig; transform: PartTransform }) {
  return (
    <group
      position={[
        transform.position[0],
        transform.position[1] + part.size[1] / 2,
        transform.position[2],
      ]}
      rotation={[0, (transform.rotationDeg * Math.PI) / 180, 0]}
    >
      <mesh>
        <boxGeometry args={part.size} />
        <meshStandardMaterial
          color="#38bdf8"
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...part.size)]} />
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

/** Pulsing sphere the player clicks to deposit a tack weld. */
function TackHitbox({
  point,
  onTack,
}: {
  point: WorkbenchTackPoint;
  onTack?: (id: string) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current || point.done) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.15;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh
      ref={ref}
      position={point.world}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (point.done || !onTack) return;
        e.stopPropagation();
        onTack(point.id);
      }}
    >
      <sphereGeometry args={[point.radius, 16, 16]} />
      <meshStandardMaterial
        color={point.done ? '#22c55e' : '#f97316'}
        emissive={point.done ? '#16a34a' : '#ea580c'}
        emissiveIntensity={point.done ? 0.8 : 0.5}
        transparent
        opacity={point.done ? 0.95 : 0.6}
      />
    </mesh>
  );
}

/**
 * Shared 3D workbench used by the assembly, tacking and grinding phases. Parts
 * are primitive boxes so real models can be swapped in later.
 */
export function PartsWorkbench(props: PartsWorkbenchProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3.2, 3.0], fov: 45 }}
      className="touch-none"
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#0a0a0f']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 7, 3]} intensity={1.5} castShadow />
      <pointLight position={[-3, 3, -2]} intensity={0.5} color="#38bdf8" />
      <SceneContents {...props} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={2}
        maxDistance={8}
      />
    </Canvas>
  );
}

function SceneContents({
  parts,
  transforms,
  draggableIds,
  selectedId,
  onSelect,
  onDrag,
  tackPoints = [],
  onTack,
  weldPath = [],
  ghost,
  grinding = false,
  onGrind,
  aligned = false,
}: PartsWorkbenchProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const grindingRef = useRef(false);
  const lastGrindRef = useRef(0);

  const handlePlaneMove = (e: ThreeEvent<PointerEvent>) => {
    if (draggingId) {
      const t = transforms[draggingId];
      if (!t) return;
      onDrag(draggingId, [e.point.x, t.position[1], e.point.z]);
      return;
    }
    if (grinding && grindingRef.current && onGrind && weldPath.length > 0) {
      const now = performance.now();
      const seconds = Math.min(0.2, (now - lastGrindRef.current) / 1000);
      lastGrindRef.current = now;
      const near = weldPath.some((p) => {
        const dx = p[0] - e.point.x;
        const dz = p[2] - e.point.z;
        return Math.sqrt(dx * dx + dz * dz) < 0.28;
      });
      if (near) onGrind(seconds);
    }
  };

  return (
    <group>
      <Table />

      {/* Invisible interaction plane used for dragging & grinding strokes. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, TABLE_Y + 0.001, 0]}
        onPointerMove={handlePlaneMove}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (!grinding) return;
          grindingRef.current = true;
          lastGrindRef.current = performance.now();
          e.stopPropagation();
        }}
        onPointerUp={() => {
          setDraggingId(null);
          grindingRef.current = false;
        }}
        onPointerLeave={() => {
          setDraggingId(null);
          grindingRef.current = false;
        }}
      >
        <planeGeometry args={[TABLE_WIDTH, TABLE_DEPTH]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {ghost && (
        <GhostPart
          part={parts.find((p) => p.id === ghost.partId)!}
          transform={ghost.transform}
        />
      )}

      {parts.map((part) => {
        const t = transforms[part.id];
        if (!t) return null;
        return (
          <PartMesh
            key={part.id}
            part={part}
            transform={t}
            selected={selectedId === part.id}
            draggable={draggableIds.includes(part.id)}
            aligned={aligned}
            onSelect={() => onSelect(part.id)}
            onDragStart={() => setDraggingId(part.id)}
          />
        );
      })}

      {weldPath.length > 1 && (
        <Line
          points={weldPath.map((p) => new THREE.Vector3(p[0], p[1] + 0.02, p[2]))}
          color={grinding ? '#38bdf8' : '#f59e0b'}
          lineWidth={3}
        />
      )}

      {tackPoints.map((tp) => (
        <TackHitbox key={tp.id} point={tp} onTack={onTack} />
      ))}
    </group>
  );
}

export default PartsWorkbench;
