import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PartDefinition, TransformData } from '../types';

interface PlaceholderPartProps {
  definition: PartDefinition;
  transform: TransformData;
  selected: boolean;
  /** When false the part is display-only (Play Mode outside of assembly, or ghost preview). */
  draggable: boolean;
  onSelect: (partId: string) => void;
  onDrag: (partId: string, position: [number, number, number]) => void;
  onDragStateChange: (dragging: boolean) => void;
  /** Optional world-space grid step (metres) applied while dragging. */
  snapStep?: number;
  /** Rendered translucent, unlit and non-interactive: used for the target-state ghost. */
  ghost?: boolean;
  opacity?: number;
}

/**
 * A primitive placeholder for a metal part. Geometry comes entirely from the level
 * config, so replacing these with real models later is a data change, not a code change.
 */
export function PlaceholderPart({
  definition,
  transform,
  selected,
  draggable,
  onSelect,
  onDrag,
  onDragStateChange,
  snapStep = 0,
  ghost = false,
  opacity,
}: PlaceholderPartProps) {
  const { camera, raycaster } = useThree();
  const dragPlane = useRef(new THREE.Plane());
  const dragOffset = useRef(new THREE.Vector3());
  const dragging = useRef(false);
  const hitPoint = useRef(new THREE.Vector3());

  const geometry = useMemo(() => {
    const [a, b, c] = definition.size;
    return definition.shape === 'cylinder' ? (
      <cylinderGeometry args={[a, a, b, Math.max(3, Math.round(c))]} />
    ) : (
      <boxGeometry args={[a, b, c]} />
    );
  }, [definition.shape, definition.size]);

  const snap = (value: number) =>
    snapStep > 0 ? Math.round(value / snapStep) * snapStep : value;

  const updateFromPointer = (event: any) => {
    raycaster.setFromCamera(event.pointer, camera);
    if (!raycaster.ray.intersectPlane(dragPlane.current, hitPoint.current)) return;
    const next = hitPoint.current.clone().add(dragOffset.current);
    onDrag(definition.id, [snap(next.x), transform.position[1], snap(next.z)]);
  };

  const handlePointerDown = (event: any) => {
    event.stopPropagation();
    onSelect(definition.id);
    if (!draggable) return;

    // Drag on the horizontal plane through the part's current height.
    dragPlane.current.set(new THREE.Vector3(0, 1, 0), -transform.position[1]);
    raycaster.setFromCamera(event.pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane.current, hitPoint.current)) {
      dragOffset.current
        .set(transform.position[0], transform.position[1], transform.position[2])
        .sub(hitPoint.current);
    } else {
      dragOffset.current.set(0, 0, 0);
    }

    dragging.current = true;
    onDragStateChange(true);
    event.target?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: any) => {
    if (!dragging.current || !draggable) return;
    event.stopPropagation();
    updateFromPointer(event);
  };

  const endDrag = (event: any) => {
    if (!dragging.current) return;
    dragging.current = false;
    onDragStateChange(false);
    event.target?.releasePointerCapture?.(event.pointerId);
  };

  return (
    <mesh
      position={transform.position}
      rotation={transform.rotation}
      castShadow={!ghost}
      receiveShadow={!ghost}
      renderOrder={ghost ? -1 : 0}
      onPointerDown={ghost ? undefined : handlePointerDown}
      onPointerMove={ghost ? undefined : handlePointerMove}
      onPointerUp={ghost ? undefined : endDrag}
      onPointerCancel={ghost ? undefined : endDrag}
      onPointerMissed={ghost ? undefined : endDrag}
    >
      {geometry}
      <meshStandardMaterial
        color={definition.color}
        transparent={ghost || opacity !== undefined}
        opacity={opacity ?? (ghost ? 0.22 : 1)}
        depthWrite={!ghost}
        wireframe={ghost}
        metalness={ghost ? 0 : 0.65}
        roughness={ghost ? 1 : 0.42}
        emissive={selected && !ghost ? '#f97316' : '#000000'}
        emissiveIntensity={selected && !ghost ? 0.35 : 0}
      />
    </mesh>
  );
}

export default PlaceholderPart;
