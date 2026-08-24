import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface HoleMeshProps {
  position: [number, number, number];
}

export default function HoleMesh({ position }: HoleMeshProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const outerRingRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.8;
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.z -= delta * 0.4;
    }
    if (glowRef.current) {
      const scale = 1 + Math.sin(Date.now() * 0.004) * 0.08;
      glowRef.current.scale.set(scale, scale, 1);
    }
  });

  return (
    <group position={position}>
      {/* Deep dark pit cylinder */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.26, 0.2, 0.8, 32]} />
        <meshBasicMaterial color="#020617" />
      </mesh>

      {/* Surface dark hole */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <circleGeometry args={[0.27, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Inner glowing green pulse ring */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.24, 0.32, 32]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Spinning dashed hex ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
        <ringGeometry args={[0.3, 0.35, 6]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Outer warning ring */}
      <mesh ref={outerRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.36, 0.4, 32]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
