import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type ShapeType = "cube" | "cylinder" | "pyramid";

export interface SpawnedObject {
  id: number;
  type: ShapeType;
  position: [number, number, number];
  rotation: [number, number, number];
}

interface FallingObjectsProps {
  objects: SpawnedObject[];
  onUpdate: (objects: SpawnedObject[]) => void;
  grabbedId: number | null;
  gripperTipRef: React.MutableRefObject<THREE.Object3D | null>;
  holePosition: [number, number, number] | null;
  onObjectInHole?: (obj: SpawnedObject) => void;
}

const FLOOR_Y = -1.5;
const GRAVITY = -4.5;
const BOUNCE = 0.25;
const DAMPING = 0.98;
const HOLE_RADIUS = 0.28;

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

const COLORS: Record<ShapeType, string> = {
  cube: "#38bdf8",
  cylinder: "#f97316",
  pyramid: "#4ade80",
};

export default function FallingObjects({
  objects,
  onUpdate,
  grabbedId,
  gripperTipRef,
  holePosition,
  onObjectInHole,
}: FallingObjectsProps) {
  const velocities = useRef<Map<number, { vy: number; vr: [number, number, number] }>>(new Map());
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const gripperWorldPos = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Update gripper world position
    if (gripperTipRef.current) {
      gripperTipRef.current.getWorldPosition(gripperWorldPos.current);
    }

    objects.forEach((obj) => {
      const mesh = meshRefs.current.get(obj.id);
      if (!mesh) return;

      // Grabbed object follows gripper smoothly
      if (obj.id === grabbedId) {
        mesh.position.copy(gripperWorldPos.current);
        velocities.current.set(obj.id, {
          vy: 0,
          vr: [0, 0, 0],
        });
        return;
      }

      if (!velocities.current.has(obj.id)) {
        velocities.current.set(obj.id, {
          vy: 0,
          vr: [
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
          ],
        });
      }

      const vel = velocities.current.get(obj.id)!;
      const halfH = obj.type === "cube" ? 0.11 : 0.13;
      const floorContact = FLOOR_Y + halfH;

      vel.vy += GRAVITY * dt;
      mesh.position.y += vel.vy * dt;

      // Check if object is over the hole
      if (holePosition && mesh.position.y <= floorContact + 0.08) {
        const dx = mesh.position.x - holePosition[0];
        const dz = mesh.position.z - holePosition[2];
        const dist = Math.hypot(dx, dz);
        if (dist < HOLE_RADIUS) {
          // Object falls into hole - let it sink down into the pit
          if (mesh.position.y < FLOOR_Y - 0.6) {
            onObjectInHole?.(obj);
            return;
          }
          vel.vy = Math.min(vel.vy, -1.2);
          mesh.position.y += vel.vy * dt;
          return;
        }
      }

      if (mesh.position.y <= floorContact) {
        mesh.position.y = floorContact;
        vel.vy = -vel.vy * BOUNCE;
        if (Math.abs(vel.vy) < 0.05) vel.vy = 0;
        vel.vr = vel.vr.map((v) => v * 0.8) as [number, number, number];
      }

      mesh.rotation.x += vel.vr[0] * dt * DAMPING;
      mesh.rotation.y += vel.vr[1] * dt * DAMPING;
      mesh.rotation.z += vel.vr[2] * dt * DAMPING;
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
            }
          }}
          position={obj.position}
          rotation={obj.rotation}
          castShadow
          receiveShadow
        >
          <ShapeGeometry type={obj.type} />
          <meshStandardMaterial
            color={COLORS[obj.type]}
            roughness={0.35}
            metalness={0.55}
            emissive={obj.id === grabbedId ? COLORS[obj.type] : "#000000"}
            emissiveIntensity={obj.id === grabbedId ? 0.35 : 0}
          />
        </mesh>
      ))}
    </>
  );
}
