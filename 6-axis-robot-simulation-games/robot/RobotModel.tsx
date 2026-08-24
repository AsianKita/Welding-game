import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Joint limits in radians [min, max]
export const JOINT_LIMITS: [number, number][] = [
  [-Math.PI * 1.5, Math.PI * 1.5], // J1 - base pan
  [-Math.PI * 0.75, Math.PI * 0.75], // J2 - shoulder pitch
  [-Math.PI * 0.85, Math.PI * 0.85], // J3 - elbow pitch
  [-Math.PI * 1.5, Math.PI * 1.5], // J4 - wrist roll
  [-Math.PI * 0.75, Math.PI * 0.75], // J5 - wrist pitch
  [-Math.PI * 2, Math.PI * 2], // J6 - end effector tool roll
];

interface RobotModelProps {
  jointTargets: number[];
  jointRefs: React.MutableRefObject<THREE.Group[]>;
  isInteracting: boolean;
  gripperTipRef?: React.MutableRefObject<THREE.Object3D | null>;
  isGrabbing?: boolean;
}

const metalMaterial = (color: string, roughness = 0.35, metalness = 0.75) => (
  <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
);

const JointMesh = ({ color, radius, height }: { color: string; radius: number; height: number }) => (
  <mesh castShadow receiveShadow>
    <cylinderGeometry args={[radius, radius, height, 32]} />
    {metalMaterial(color, 0.28, 0.85)}
  </mesh>
);

const LinkMesh = ({
  width,
  height,
  depth,
  color,
  position,
  rotation,
}: {
  width: number;
  height: number;
  depth: number;
  color: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) => (
  <mesh castShadow receiveShadow position={position} rotation={rotation}>
    <boxGeometry args={[width, height, depth]} />
    {metalMaterial(color, 0.4, 0.65)}
  </mesh>
);

export default function RobotModel({
  jointTargets,
  jointRefs,
  isInteracting,
  gripperTipRef,
  isGrabbing,
}: RobotModelProps) {
  const idleTime = useRef(0);

  useFrame((_, delta) => {
    jointRefs.current.forEach((group, i) => {
      if (!group) return;
      const axis = i === 0 || i === 3 || i === 5 ? "y" : "x";
      const current = group.rotation[axis];
      const target = jointTargets[i];
      // Responsive smooth motion
      group.rotation[axis] = THREE.MathUtils.lerp(current, target, 1 - Math.pow(0.0001, delta));
    });

    if (!isInteracting) {
      idleTime.current += delta * 0.25;
      const t = idleTime.current;
      if (jointRefs.current[1]) {
        jointRefs.current[1].rotation.x = THREE.MathUtils.lerp(
          jointRefs.current[1].rotation.x,
          jointTargets[1] + Math.sin(t) * 0.015,
          1 - Math.pow(0.01, delta)
        );
      }
      if (jointRefs.current[2]) {
        jointRefs.current[2].rotation.x = THREE.MathUtils.lerp(
          jointRefs.current[2].rotation.x,
          jointTargets[2] + Math.cos(t * 0.7) * 0.012,
          1 - Math.pow(0.01, delta)
        );
      }
    } else {
      idleTime.current = 0;
    }
  });

  const setRef = (index: number) => (el: THREE.Group | null) => {
    if (el) jointRefs.current[index] = el;
  };

  // Gripper finger spread based on grab state
  const fingerSpread = isGrabbing ? 0.022 : 0.065;

  return (
    <group position={[0, -1.5, 0]}>
      {/* Base mounting pedestal */}
      <mesh receiveShadow castShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.55, 0.65, 0.1, 48]} />
        {metalMaterial("#0f172a", 0.7, 0.4)}
      </mesh>

      {/* Warning perimeter ring around base */}
      <mesh position={[0, 0.102, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.48, 32]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* J1 - Base Pan Rotation */}
      <group ref={setRef(0)} position={[0, 0.1, 0]}>
        <JointMesh color="#ea580c" radius={0.28} height={0.28} />
        <LinkMesh width={0.22} height={0.8} depth={0.22} color="#1e293b" position={[0, 0.55, 0]} />

        {/* J2 - Shoulder Pitch */}
        <group ref={setRef(1)} position={[0, 0.95, 0]}>
          <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.16, 0.16, 0.3, 32]} />
            {metalMaterial("#0284c7", 0.25, 0.85)}
          </mesh>
          <LinkMesh width={0.16} height={0.9} depth={0.16} color="#334155" position={[0, 0.5, 0]} />

          {/* J3 - Elbow Pitch */}
          <group ref={setRef(2)} position={[0, 0.95, 0]}>
            <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.13, 0.13, 0.24, 32]} />
              {metalMaterial("#10b981", 0.25, 0.85)}
            </mesh>
            <LinkMesh width={0.12} height={0.7} depth={0.12} color="#1e293b" position={[0, 0.4, 0]} />

            {/* J4 - Wrist Roll */}
            <group ref={setRef(3)} position={[0, 0.75, 0]}>
              <JointMesh color="#8b5cf6" radius={0.09} height={0.18} />
              <LinkMesh width={0.08} height={0.25} depth={0.08} color="#334155" position={[0, 0.17, 0]} />

              {/* J5 - Wrist Pitch */}
              <group ref={setRef(4)} position={[0, 0.3, 0]}>
                <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.07, 0.07, 0.16, 32]} />
                  {metalMaterial("#f43f5e", 0.25, 0.85)}
                </mesh>
                <LinkMesh width={0.06} height={0.15} depth={0.06} color="#1e293b" position={[0, 0.12, 0]} />

                {/* J6 - End Effector / Tool Roll */}
                <group ref={setRef(5)} position={[0, 0.2, 0]}>
                  <JointMesh color="#eab308" radius={0.055} height={0.1} />

                  {/* Gripper Tool Assembly */}
                  <group position={[0, 0.09, 0]}>
                    {/* Tool base block */}
                    <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
                      <boxGeometry args={[0.14, 0.04, 0.08]} />
                      {metalMaterial("#0f172a", 0.4, 0.6)}
                    </mesh>

                    {/* Left Clamp Finger */}
                    <group position={[-fingerSpread, 0.07, 0]}>
                      <mesh castShadow receiveShadow>
                        <boxGeometry args={[0.018, 0.13, 0.035]} />
                        {metalMaterial("#94a3b8", 0.3, 0.9)}
                      </mesh>
                      {/* Rubber Grip Pad */}
                      <mesh position={[0.01, 0, 0]}>
                        <boxGeometry args={[0.005, 0.09, 0.03]} />
                        <meshStandardMaterial color="#0284c7" roughness={0.9} />
                      </mesh>
                    </group>

                    {/* Right Clamp Finger */}
                    <group position={[fingerSpread, 0.07, 0]}>
                      <mesh castShadow receiveShadow>
                        <boxGeometry args={[0.018, 0.13, 0.035]} />
                        {metalMaterial("#94a3b8", 0.3, 0.9)}
                      </mesh>
                      {/* Rubber Grip Pad */}
                      <mesh position={[-0.01, 0, 0]}>
                        <boxGeometry args={[0.005, 0.09, 0.03]} />
                        <meshStandardMaterial color="#0284c7" roughness={0.9} />
                      </mesh>
                    </group>

                    {/* Invisible gripper tip for world position tracking */}
                    <object3D
                      ref={(el) => {
                        if (el && gripperTipRef) gripperTipRef.current = el;
                      }}
                      position={[0, 0.14, 0]}
                    />
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
