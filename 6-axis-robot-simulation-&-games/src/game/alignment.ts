import * as THREE from 'three';
import type {
  AlignmentResult,
  AlignmentTolerance,
  PartAlignmentResult,
  TargetState,
  TransformData,
} from './types';

const RAD_TO_DEG = 180 / Math.PI;

/** Wraps an angle (radians) into (-PI, PI]. */
function wrapRadians(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Smallest angular difference between two euler components, in degrees.
 * When `symmetric` is set, a 180 deg flip is treated as equivalent, so a
 * plate placed "backwards" still counts as aligned.
 */
export function angleErrorDegrees(a: number, b: number, symmetric: boolean): number {
  let diff = Math.abs(wrapRadians(a - b));
  if (symmetric && diff > Math.PI / 2) diff = Math.PI - diff;
  return diff * RAD_TO_DEG;
}

/** Compares one live transform against its authored target transform. */
export function comparePartTransform(
  partId: string,
  current: TransformData,
  target: TransformData,
  tolerance: AlignmentTolerance
): PartAlignmentResult {
  let positionError = 0;
  for (let i = 0; i < 3; i++) {
    positionError = Math.max(positionError, Math.abs(current.position[i] - target.position[i]));
  }

  let rotationError = 0;
  for (let i = 0; i < 3; i++) {
    rotationError = Math.max(
      rotationError,
      angleErrorDegrees(current.rotation[i], target.rotation[i], tolerance.symmetricRotation)
    );
  }

  return {
    partId,
    aligned:
      positionError <= tolerance.positionMeters && rotationError <= tolerance.rotationDegrees,
    positionError,
    rotationError,
  };
}

const _matrix = new THREE.Matrix4();
const _refMatrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();

function toMatrix(transform: TransformData, out: THREE.Matrix4): THREE.Matrix4 {
  _pos.fromArray(transform.position);
  _euler.set(transform.rotation[0], transform.rotation[1], transform.rotation[2], 'XYZ');
  _quat.setFromEuler(_euler);
  return out.compose(_pos, _quat, _scale);
}

/**
 * Expresses `transform` in the local frame of `reference`.
 * This is what makes alignment position-independent: the player can build the
 * joint anywhere on the table as long as the parts are correct relative to each other.
 */
export function toRelativeTransform(
  transform: TransformData,
  reference: TransformData
): TransformData {
  toMatrix(reference, _refMatrix).invert();
  toMatrix(transform, _matrix).premultiply(_refMatrix);
  _matrix.decompose(_pos, _quat, new THREE.Vector3());
  _euler.setFromQuaternion(_quat, 'XYZ');
  return {
    position: [_pos.x, _pos.y, _pos.z],
    rotation: [_euler.x, _euler.y, _euler.z],
  };
}

/**
 * Rebases every part into the reference part's frame. The reference itself
 * becomes the identity transform, so it always trivially matches.
 */
function toRelativeSet(
  transforms: Record<string, TransformData>,
  referencePartId: string
): Record<string, TransformData> {
  const reference = transforms[referencePartId];
  if (!reference) return transforms;
  const out: Record<string, TransformData> = {};
  for (const [partId, transform] of Object.entries(transforms)) {
    out[partId] =
      partId === referencePartId
        ? { position: [0, 0, 0], rotation: [0, 0, 0] }
        : toRelativeTransform(transform, reference);
  }
  return out;
}

/**
 * Compares the player's whole arrangement against the saved "Expected Orientation".
 * A part with no authored target is reported as unaligned so authoring gaps are visible
 * instead of silently passing.
 */
export function evaluateAlignment(
  current: Record<string, TransformData>,
  target: TargetState | null | undefined,
  tolerance: AlignmentTolerance,
  referencePartId?: string
): AlignmentResult {
  const partIds = Object.keys(current);
  const relative = tolerance.relative !== false && !!referencePartId;

  const currentSet = relative ? toRelativeSet(current, referencePartId!) : current;
  const targetSet =
    relative && target ? toRelativeSet(target.parts, referencePartId!) : target?.parts;

  const parts = partIds.map((partId) => {
    const expected = targetSet?.[partId];
    if (!expected) {
      return {
        partId,
        aligned: false,
        positionError: Number.POSITIVE_INFINITY,
        rotationError: Number.POSITIVE_INFINITY,
      } satisfies PartAlignmentResult;
    }
    return comparePartTransform(partId, currentSet[partId], expected, tolerance);
  });

  return {
    aligned: parts.length > 0 && parts.every((p) => p.aligned),
    parts,
  };
}
