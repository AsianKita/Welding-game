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

/**
 * Compares the player's whole arrangement against the saved "Expected Orientation".
 * A part with no authored target is reported as unaligned so authoring gaps are visible
 * instead of silently passing.
 */
export function evaluateAlignment(
  current: Record<string, TransformData>,
  target: TargetState | null | undefined,
  tolerance: AlignmentTolerance
): AlignmentResult {
  const partIds = Object.keys(current);
  const parts = partIds.map((partId) => {
    const expected = target?.parts?.[partId];
    if (!expected) {
      return {
        partId,
        aligned: false,
        positionError: Number.POSITIVE_INFINITY,
        rotationError: Number.POSITIVE_INFINITY,
      } satisfies PartAlignmentResult;
    }
    return comparePartTransform(partId, current[partId], expected, tolerance);
  });

  return {
    aligned: parts.length > 0 && parts.every((p) => p.aligned),
    parts,
  };
}
