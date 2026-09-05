import * as THREE from 'three';
import type { GrindingConfig, LevelConfig, TransformData } from './types';

/** Builds a world matrix from a plain transform. */
export function transformToMatrix(transform: TransformData): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(transform.position),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(transform.rotation[0], transform.rotation[1], transform.rotation[2], 'XYZ')
    ),
    new THREE.Vector3(1, 1, 1)
  );
}

/** The part whose frame anchors tack points, the seam and relative alignment. */
export function getReferencePartId(config: LevelConfig): string {
  return config.referencePartId ?? config.parts[0]?.id ?? '';
}

/**
 * Converts points authored in the reference part's local space into world space,
 * so the seam and tacks follow the joint wherever the player assembled it.
 */
export function localPointsToWorld(
  points: Array<[number, number, number]>,
  reference: TransformData | undefined
): THREE.Vector3[] {
  const matrix = reference ? transformToMatrix(reference) : new THREE.Matrix4();
  return points.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(matrix));
}

/** Evenly spaced prep/grind samples along the seam polyline (local space). */
export function buildGrindSamples(
  seam: Array<[number, number, number]>,
  grinding: GrindingConfig
): Array<[number, number, number]> {
  if (seam.length < 2) return seam;
  const curve = new THREE.CatmullRomCurve3(
    seam.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'catmullrom',
    0
  );
  const count = Math.max(2, Math.round(grinding.sampleCount));
  return curve
    .getSpacedPoints(count - 1)
    .map((p) => [p.x, p.y, p.z] as [number, number, number]);
}

/**
 * Footprint polygon of the reference part, projected to the table plane.
 * Used as the workpiece outline injected into the welding simulation.
 */
export function buildWorkpieceOutline(
  config: LevelConfig,
  transforms: Record<string, TransformData>,
  planeY: number
): THREE.Vector3[] {
  const referenceId = getReferencePartId(config);
  const part = config.parts.find((p) => p.id === referenceId);
  const transform = transforms[referenceId];
  if (!part || !transform) return [];

  const halfWidth = part.size[0] / 2;
  const halfDepth = (part.shape === 'cylinder' ? part.size[0] : part.size[2]) / 2;
  const corners: Array<[number, number, number]> = [
    [-halfWidth, 0, -halfDepth],
    [halfWidth, 0, -halfDepth],
    [halfWidth, 0, halfDepth],
    [-halfWidth, 0, halfDepth],
    [-halfWidth, 0, -halfDepth],
  ];

  return localPointsToWorld(corners, transform).map(
    (p) => new THREE.Vector3(p.x, planeY, p.z)
  );
}
