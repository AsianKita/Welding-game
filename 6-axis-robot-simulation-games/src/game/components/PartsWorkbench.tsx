import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CameraPreset, GridConfig, PartConfig, PartTransform, TransformSpace, Vec3 } from '../types';
import { DEFAULT_GRID, snapPosition, snapToNearestEdge } from '../levelStore';

/** Imperative handle exposed by drei's OrbitControls. */
type OrbitControlsHandle = React.ComponentRef<typeof OrbitControls>;

const TABLE_Y = 0;
const TABLE_WIDTH = 3.6;
const TABLE_DEPTH = 2.4;

const CAMERA_PRESETS: Record<CameraPreset, [number, number, number]> = {
  iso: [2.6, 2.6, 3.0],
  top: [0, 4.2, 0.01],
  front: [0, 1.3, 3.8],
  side: [3.8, 1.3, 0.01],
};

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
  cameraPreset: CameraPreset;
  tackPoints?: WorkbenchTackPoint[];
  onTack?: (id: string) => void;
  weldPath?: Vec3[];
  /** Ghost preview of the authored target arrangement. */
  ghost?: { partId: string; transform: PartTransform } | null;
  /** When true, dragging the pointer along the weld path drives grinding. */
  grinding?: boolean;
  onGrind?: (seconds: number) => void;
  grindProgress?: number;
  aligned?: boolean;
  /** Debug weld-path authoring: click a part surface to drop a weld node. */
  weldAuthoring?: boolean;
  onAuthorWeldNode?: (world: Vec3) => void;
  /** Discrete unit grid that drag positions snap to. */
  grid?: GridConfig;
  /** Drives the gizmo orientation so it matches the control pad's space. */
  space?: TransformSpace;
}

function rotationRadians(t: PartTransform): [number, number, number] {
  return [
    (t.rotation[0] * Math.PI) / 180,
    (t.rotation[1] * Math.PI) / 180,
    (t.rotation[2] * Math.PI) / 180,
  ];
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

/**
 * Moves the camera to the requested preset. OrbitControls stays in charge of
 * free look; this only retargets when the player taps a view button, so the
 * view never fights pointer movement.
 */
function CameraRig({
  preset,
  controlsRef,
}: {
  preset: CameraPreset;
  controlsRef: React.MutableRefObject<OrbitControlsHandle | null>;
}) {
  const { camera } = useThree();
  useEffect(() => {
    const [x, y, z] = CAMERA_PRESETS[preset];
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [preset, camera, controlsRef]);
  return null;
}

function PartMesh({
  part,
  transform,
  selected,
  draggable,
  aligned,
  onSelect,
  onDragStart,
  onSurfaceClick,
}: {
  part: PartConfig;
  transform: PartTransform;
  selected: boolean;
  draggable: boolean;
  aligned: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onSurfaceClick?: (world: Vec3) => void;
}) {
  const color = aligned ? '#22c55e' : part.color || '#64748b';
  return (
    <group
      position={[
        transform.position[0],
        transform.position[1] + part.size[1] / 2,
        transform.position[2],
      ]}
      rotation={rotationRadians(transform)}
    >
      <mesh
        castShadow
        receiveShadow
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (onSurfaceClick) {
            e.stopPropagation();
            onSurfaceClick([e.point.x, e.point.y, e.point.z]);
            return;
          }
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
          emissiveIntensity={selected ? 0.3 : 0}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...part.size)]} />
        <lineBasicMaterial color={selected ? '#f59e0b' : '#0f172a'} />
      </lineSegments>
    </group>
  );
}

/**
 * Fusion-style transform gizmo pinned to the selected part.
 *
 * Three orthogonal RGB arrows (X red, Y green, Z blue) show which way the Move
 * buttons push, and three matching rings show which way the Rotate buttons
 * spin. It is a read-only reference marker - all actual editing happens through
 * the control pad and drag - so it never steals pointer events.
 */
function TransformGizmo({
  part,
  transform,
  space,
}: {
  part: PartConfig;
  transform: PartTransform;
  space: TransformSpace;
}) {
  const axes: { dir: Vec3; color: string; ring: [number, number, number] }[] = [
    { dir: [1, 0, 0], color: '#ef4444', ring: [0, Math.PI / 2, 0] },
    { dir: [0, 1, 0], color: '#22c55e', ring: [Math.PI / 2, 0, 0] },
    { dir: [0, 0, 1], color: '#3b82f6', ring: [0, 0, 0] },
  ];
  // Scale the marker to the part so it stays readable on any plate size.
  const reach = Math.max(...part.size) * 0.75 + 0.12;

  return (
    <group
      position={[
        transform.position[0],
        transform.position[1] + part.size[1] / 2,
        transform.position[2],
      ]}
      // In Perp mode the gizmo follows the part, matching what the buttons do.
      rotation={space === 'local' ? rotationRadians(transform) : [0, 0, 0]}
      raycast={() => null}
    >
      {/* Rotation rings, one per axis. */}
      {axes.map(({ color, ring }, i) => (
        <mesh key={`ring-${i}`} rotation={ring} raycast={() => null}>
          <torusGeometry args={[reach * 0.62, 0.006, 8, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Orthogonal arrows: shaft + cone head, mirrored on the negative side. */}
      {axes.map(({ dir, color }, i) =>
        [1, -1].map((sign) => {
          const v = new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(sign);
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            v
          );
          const rot = new THREE.Euler().setFromQuaternion(quat);
          return (
            <group
              key={`arrow-${i}-${sign}`}
              rotation={[rot.x, rot.y, rot.z]}
              raycast={() => null}
            >
              <mesh position={[0, reach * 0.5, 0]} raycast={() => null}>
                <cylinderGeometry args={[0.006, 0.006, reach, 8]} />
                <meshBasicMaterial color={color} transparent opacity={0.9} />
              </mesh>
              <mesh position={[0, reach, 0]} raycast={() => null}>
                <coneGeometry args={[0.026, 0.07, 12]} />
                <meshBasicMaterial color={color} />
              </mesh>
            </group>
          );
        })
      )}
    </group>
  );
}

function GhostPart({
  part,
  transform,
}: {
  part: PartConfig;
  transform: PartTransform;
}) {
  return (
    <group
      position={[
        transform.position[0],
        transform.position[1] + part.size[1] / 2,
        transform.position[2],
      ]}
      rotation={rotationRadians(transform)}
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
    ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4) * 0.15);
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
 * Handheld angle grinder: body, gear head, guard and an abrasive disc that
 * spins up while the player is actually grinding, throwing a spark fan off the
 * contact point.
 */
function AngleGrinder({
  position,
  active,
}: {
  position: THREE.Vector3;
  active: boolean;
}) {
  const discRef = useRef<THREE.Mesh>(null);
  const sparksRef = useRef<THREE.Points>(null);
  const spinRef = useRef(0);

  const sparkGeometry = useMemo(() => {
    const count = 90;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    );
    return geo;
  }, []);

  // Per-spark launch vectors and lifetimes, regenerated as each spark dies.
  const sparks = useMemo(
    () =>
      Array.from({ length: 90 }, () => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
      })),
    []
  );

  useFrame((_, delta) => {
    // Spin up / coast down so the disc reads as a real tool.
    const targetSpeed = active ? 42 : 0;
    spinRef.current = THREE.MathUtils.lerp(
      spinRef.current,
      targetSpeed,
      delta * (active ? 6 : 2)
    );
    if (discRef.current) {
      discRef.current.rotation.y += spinRef.current * delta;
    }

    const attr = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
    sparks.forEach((s, i) => {
      if (s.life <= 0) {
        if (active && Math.random() < 0.55) {
          s.life = 0.18 + Math.random() * 0.3;
          s.pos.set(0, 0, 0);
          // Fan the sparks backwards and down, like a real grinder throw.
          const spread = (Math.random() - 0.5) * 1.1;
          s.vel.set(
            Math.cos(spread) * (0.9 + Math.random() * 1.4),
            0.25 + Math.random() * 0.7,
            Math.sin(spread) * (0.9 + Math.random() * 1.4)
          );
        } else {
          attr.setXYZ(i, 0, -999, 0);
          return;
        }
      }
      s.life -= delta;
      s.vel.y -= delta * 3.4; // gravity
      s.pos.addScaledVector(s.vel, delta);
      attr.setXYZ(i, s.pos.x, s.pos.y, s.pos.z);
    });
    attr.needsUpdate = true;
  });

  return (
    <group position={position}>
      {/* Spark shower originates at the disc contact point. */}
      <points ref={sparksRef} geometry={sparkGeometry} position={[0, 0.02, 0]}>
        <pointsMaterial
          size={0.022}
          color="#ffcc55"
          transparent
          opacity={active ? 0.95 : 0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Tool tilted onto the work like a grinder held at an angle. */}
      <group position={[0, 0.16, 0]} rotation={[0, 0, -0.42]}>
        {/* Motor body */}
        <mesh position={[0.26, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.055, 0.06, 0.34, 20]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.55} />
        </mesh>
        {/* Grip band */}
        <mesh position={[0.38, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.058, 0.058, 0.12, 20]} />
          <meshStandardMaterial color="#0f172a" roughness={0.9} />
        </mesh>
        {/* Gear head */}
        <mesh position={[0.06, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.07, 0.065, 0.12, 20]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.65} roughness={0.35} />
        </mesh>
        {/* Side handle */}
        <mesh position={[0.12, 0.16, 0]} rotation={[0, 0, 0.25]}>
          <cylinderGeometry args={[0.02, 0.02, 0.17, 12]} />
          <meshStandardMaterial color="#0f172a" roughness={0.85} />
        </mesh>
        {/* Disc guard */}
        <mesh position={[0, 0.055, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.115, 0.016, 8, 24, Math.PI]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Abrasive cut-off disc */}
        <mesh ref={discRef} position={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.115, 0.115, 0.008, 28]} />
          <meshStandardMaterial
            color={active ? '#fb923c' : '#475569'}
            emissive={active ? '#f97316' : '#000000'}
            emissiveIntensity={active ? 0.55 : 0}
            metalness={0.4}
            roughness={0.7}
          />
        </mesh>
      </group>

      {/* Hot glow on the metal under the disc */}
      {active && (
        <pointLight position={[0, 0.05, 0]} intensity={2.4} distance={0.9} color="#ff8c1a" />
      )}
    </group>
  );
}

/**
 * Shared 3D workbench used by the assembly, tacking and grinding phases. Parts
 * are primitive boxes so real models can be swapped in later.
 */
export function PartsWorkbench(props: PartsWorkbenchProps) {
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  // While a part is being dragged (or the grinder is down) the orbit camera is
  // switched off, otherwise every pointer move both moved the part and spun the
  // camera, which is what made the view lurch around.
  const [interacting, setInteracting] = useState(false);

  return (
    <Canvas
      shadows
      camera={{ position: CAMERA_PRESETS.iso, fov: 45 }}
      className="touch-none"
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#0a0a0f']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 7, 3]} intensity={1.5} castShadow />
      <pointLight position={[-3, 3, -2]} intensity={0.5} color="#38bdf8" />

      <CameraRig preset={props.cameraPreset} controlsRef={controlsRef} />
      <SceneContents {...props} onInteractingChange={setInteracting} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!interacting}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.7}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={1.6}
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
  weldAuthoring = false,
  onAuthorWeldNode,
  grid = DEFAULT_GRID,
  space = 'world',
  onInteractingChange,
}: PartsWorkbenchProps & { onInteractingChange: (v: boolean) => void }) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [grinderPos, setGrinderPos] = useState(() => new THREE.Vector3(0, 0, 0));
  const [grindingNow, setGrindingNow] = useState(false);
  const grindingDownRef = useRef(false);
  const lastGrindRef = useRef(0);

  useEffect(() => {
    onInteractingChange(Boolean(draggingId) || grindingNow);
  }, [draggingId, grindingNow, onInteractingChange]);

  const endInteraction = useCallback(() => {
    setDraggingId(null);
    grindingDownRef.current = false;
    setGrindingNow(false);
  }, []);

  // Releasing the pointer over a part (or outside the canvas entirely) must
  // still end the gesture, otherwise the orbit camera would stay locked off.
  useEffect(() => {
    window.addEventListener('pointerup', endInteraction);
    window.addEventListener('pointercancel', endInteraction);
    return () => {
      window.removeEventListener('pointerup', endInteraction);
      window.removeEventListener('pointercancel', endInteraction);
    };
  }, [endInteraction]);

  const handlePlaneMove = (e: ThreeEvent<PointerEvent>) => {
    if (draggingId) {
      const t = transforms[draggingId];
      if (!t) return;
      // Drag in the table plane only; height is handled by the Y buttons so a
      // single pointer gesture can never scramble all three axes at once.
      // Snapping to the grid keeps dragged positions on whole unit values, the
      // same values the +/- buttons produce.
      const snapped = snapPosition([e.point.x, t.position[1], e.point.z], grid);
      onDrag(draggingId, [snapped[0], t.position[1], snapped[2]]);
      return;
    }

    if (!grinding) return;
    setGrinderPos(new THREE.Vector3(e.point.x, e.point.y, e.point.z));
    if (!grindingDownRef.current || !onGrind || weldPath.length === 0) return;

    const now = performance.now();
    const seconds = Math.min(0.2, (now - lastGrindRef.current) / 1000);
    lastGrindRef.current = now;
    const near = weldPath.some((p) => {
      const dx = p[0] - e.point.x;
      const dz = p[2] - e.point.z;
      return Math.sqrt(dx * dx + dz * dz) < 0.28;
    });
    setGrindingNow(near);
    if (near) onGrind(seconds);
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
          e.stopPropagation();
          grindingDownRef.current = true;
          lastGrindRef.current = performance.now();
        }}
        onPointerUp={endInteraction}
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
            selected={selectedId === part.id && draggableIds.includes(part.id)}
            draggable={draggableIds.includes(part.id)}
            aligned={aligned}
            onSelect={() => onSelect(part.id)}
            onDragStart={() => setDraggingId(part.id)}
            onSurfaceClick={
              weldAuthoring && onAuthorWeldNode
                ? (world) =>
                    // Weld joints live on edges, and nobody can click an edge
                    // pixel-perfectly, so pull the click onto the nearest one.
                    onAuthorWeldNode(snapToNearestEdge(world, part, t, grid))
                : undefined
            }
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

      {/* Individual weld nodes, so the designer can see what they authored. */}
      {weldAuthoring &&
        weldPath.map((p, i) => (
          <mesh key={i} position={[p[0], p[1] + 0.02, p[2]]}>
            <sphereGeometry args={[0.028, 12, 12]} />
            <meshStandardMaterial
              color="#f472b6"
              emissive="#db2777"
              emissiveIntensity={0.6}
            />
          </mesh>
        ))}

      {tackPoints.map((tp) => (
        <TackHitbox key={tp.id} point={tp} onTack={onTack} />
      ))}

      {/* Reference marker for the selected part, only while it is editable. */}
      {(() => {
        if (!selectedId || !draggableIds.includes(selectedId)) return null;
        const part = parts.find((p) => p.id === selectedId);
        const t = transforms[selectedId];
        if (!part || !t) return null;
        return <TransformGizmo part={part} transform={t} space={space} />;
      })()}

      {grinding && <AngleGrinder position={grinderPos} active={grindingNow} />}
    </group>
  );
}

export default PartsWorkbench;
