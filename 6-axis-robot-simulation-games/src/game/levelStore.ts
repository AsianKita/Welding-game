import * as THREE from 'three';
import level1 from './levels/level1.json';
import {
  AlignmentTolerance,
  GridConfig,
  LevelConfig,
  PartTransform,
  RelativeTargetConfig,
  TransformSpace,
  Vec3,
} from './types';

/**
 * Fallback authoring grid: 5 cm translation cells and 5 degree rotation steps.
 * Snapping every transform to this grid is what keeps positions and angles on
 * whole-number unit values, which in turn makes the authored target and the
 * player's arrangement compare exactly instead of drifting by float noise.
 */
export const DEFAULT_GRID: GridConfig = { unitCm: 5, rotationDeg: 5 };

/** Snaps a scalar (metres) to the nearest whole grid unit. */
export function snapScalar(value: number, unitCm: number): number {
  const unit = unitCm / 100;
  if (unit <= 0) return round(value);
  return round(Math.round(value / unit) * unit);
}

/** Snaps a world position onto the grid. */
export function snapPosition(position: Vec3, grid: GridConfig): Vec3 {
  return [
    snapScalar(position[0], grid.unitCm),
    snapScalar(position[1], grid.unitCm),
    snapScalar(position[2], grid.unitCm),
  ];
}

/** Snaps Euler degrees to the nearest whole rotation step. */
export function snapRotation(rotation: Vec3, grid: GridConfig): Vec3 {
  const step = grid.rotationDeg > 0 ? grid.rotationDeg : 1;
  return [
    normalizeDeg(Math.round(rotation[0] / step) * step),
    normalizeDeg(Math.round(rotation[1] / step) * step),
    normalizeDeg(Math.round(rotation[2] / step) * step),
  ];
}

/** Snaps a whole transform onto the grid. */
export function snapTransform(
  transform: PartTransform,
  grid: GridConfig
): PartTransform {
  return {
    position: snapPosition(transform.position, grid),
    rotation: snapRotation(transform.rotation, grid),
  };
}

/**
 * Level registry. Adding a level is a matter of dropping a JSON file next to
 * level1.json and registering it here - no component changes required.
 */
const LEVELS: Record<string, LevelConfig> = {
  level1: level1 as unknown as LevelConfig,
};

const TARGET_PREFIX = 'weldgame.levelOverride.';
const WELD_PREFIX = 'weldgame.weldPathOverride.';

export function listLevelIds(): string[] {
  return Object.keys(LEVELS);
}

/**
 * Returns the level config merged with anything authored locally in the debug
 * tool (target arrangement and weld path), so a designer can iterate without
 * editing JSON on every run.
 */
export function loadLevel(levelId: string): LevelConfig {
  const base = LEVELS[levelId];
  if (!base) {
    throw new Error(`Unknown level: ${levelId}`);
  }
  // Deep copy keeps callers from mutating the imported JSON module.
  const config: LevelConfig = JSON.parse(JSON.stringify(base));
  const targets = readTargetOverride(levelId);
  if (targets && targets.length > 0) {
    config.targets = targets;
  }
  const weldPath = readWeldPathOverride(levelId);
  if (weldPath && weldPath.length > 0) {
    config.weldPathLocal = weldPath;
  }
  return config;
}

function readJsonArray<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private-mode browsers can throw on writes; authoring still works through
    // the copy/download JSON buttons.
  }
}

export function readTargetOverride(levelId: string): RelativeTargetConfig[] | null {
  return readJsonArray<RelativeTargetConfig[]>(TARGET_PREFIX + levelId);
}

export function saveTargetOverride(
  levelId: string,
  targets: RelativeTargetConfig[]
): void {
  writeJson(TARGET_PREFIX + levelId, targets);
}

export function readWeldPathOverride(levelId: string): Vec3[] | null {
  return readJsonArray<Vec3[]>(WELD_PREFIX + levelId);
}

export function saveWeldPathOverride(levelId: string, path: Vec3[]): void {
  writeJson(WELD_PREFIX + levelId, path);
}

export function clearOverride(levelId: string): void {
  try {
    window.localStorage.removeItem(TARGET_PREFIX + levelId);
    window.localStorage.removeItem(WELD_PREFIX + levelId);
  } catch {
    /* ignore */
  }
}

// --------------------------------------------------------------------- math

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Wraps an angle in degrees into the (-180, 180] range. */
export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Accepts both the legacy Y-only angle and a full XYZ triple. */
export function toEulerDegrees(rotation: number | Vec3 | undefined): Vec3 {
  if (Array.isArray(rotation)) {
    return [rotation[0] || 0, rotation[1] || 0, rotation[2] || 0];
  }
  return [0, rotation || 0, 0];
}

function quatFromDegrees(rotation: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      degToRad(rotation[0]),
      degToRad(rotation[1]),
      degToRad(rotation[2]),
      'XYZ'
    )
  );
}

function degreesFromQuat(q: THREE.Quaternion): Vec3 {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [
    round(normalizeDeg(THREE.MathUtils.radToDeg(e.x))),
    round(normalizeDeg(THREE.MathUtils.radToDeg(e.y))),
    round(normalizeDeg(THREE.MathUtils.radToDeg(e.z))),
  ];
}

/**
 * Expresses `follower` in the anchor's local space so alignment checks are
 * position-independent: the player may build the joint anywhere on the table as
 * long as the relative orientation matches.
 */
export function toRelative(
  anchor: PartTransform,
  follower: PartTransform
): { offset: Vec3; rotationDeg: Vec3 } {
  const anchorQuat = quatFromDegrees(anchor.rotation);
  const inv = anchorQuat.clone().invert();

  const delta = new THREE.Vector3(
    follower.position[0] - anchor.position[0],
    follower.position[1] - anchor.position[1],
    follower.position[2] - anchor.position[2]
  ).applyQuaternion(inv);

  const relQuat = inv.clone().multiply(quatFromDegrees(follower.rotation));

  return {
    offset: [round(delta.x), round(delta.y), round(delta.z)],
    rotationDeg: degreesFromQuat(relQuat),
  };
}

/** Converts a point in the anchor's local space back into world space. */
export function toWorld(anchor: PartTransform, local: Vec3): Vec3 {
  const p = new THREE.Vector3(local[0], local[1], local[2])
    .applyQuaternion(quatFromDegrees(anchor.rotation))
    .add(new THREE.Vector3(...anchor.position));
  return [p.x, p.y, p.z];
}

/** Inverse of {@link toWorld}: world point -> anchor local space. */
export function toLocal(anchor: PartTransform, world: Vec3): Vec3 {
  const p = new THREE.Vector3(world[0], world[1], world[2])
    .sub(new THREE.Vector3(...anchor.position))
    .applyQuaternion(quatFromDegrees(anchor.rotation).invert());
  return [round(p.x), round(p.y), round(p.z)];
}

export interface AlignmentResult {
  aligned: boolean;
  positionError: number;
  rotationError: number;
}

/** Compares the live follower transform against the authored relative target. */
export function evaluateAlignment(
  anchor: PartTransform,
  follower: PartTransform,
  target: RelativeTargetConfig,
  tolerance: AlignmentTolerance
): AlignmentResult {
  const rel = toRelative(anchor, follower);
  const targetRot = toEulerDegrees(target.rotationDeg);

  const dx = rel.offset[0] - target.offset[0];
  const dy = rel.offset[1] - target.offset[1];
  const dz = rel.offset[2] - target.offset[2];
  const positionError = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Shortest-arc angle between the two orientations, so a 359 degree error
  // reads as 1 degree instead of failing the check.
  const rotationError = THREE.MathUtils.radToDeg(
    quatFromDegrees(rel.rotationDeg).angleTo(quatFromDegrees(targetRot))
  );

  return {
    aligned:
      positionError <= tolerance.position &&
      rotationError <= tolerance.rotationDeg,
    positionError,
    rotationError,
  };
}

/** Snaps the follower exactly onto the authored target once it is close enough. */
export function snapToTarget(
  anchor: PartTransform,
  target: RelativeTargetConfig,
  grid: GridConfig = DEFAULT_GRID
): PartTransform {
  const quat = quatFromDegrees(anchor.rotation).multiply(
    quatFromDegrees(toEulerDegrees(target.rotationDeg))
  );
  // Snap the resolved target too: the ghost and the player's part must be able
  // to land on exactly the same grid point, otherwise the wireframe reads as
  // permanently offset by a fraction of a unit.
  return snapTransform(
    {
      position: toWorld(anchor, target.offset),
      rotation: degreesFromQuat(quat),
    },
    grid
  );
}

/**
 * Translates a transform along a world or part-local axis. Local mode is what
 * lets the player nudge a plate perpendicular to its own face regardless of how
 * it is currently rotated.
 */
export function translate(
  transform: PartTransform,
  axis: 0 | 1 | 2,
  amount: number,
  space: TransformSpace,
  grid: GridConfig = DEFAULT_GRID
): PartTransform {
  const dir = new THREE.Vector3(
    axis === 0 ? 1 : 0,
    axis === 1 ? 1 : 0,
    axis === 2 ? 1 : 0
  );
  if (space === 'local') {
    dir.applyQuaternion(quatFromDegrees(transform.rotation));
  }
  dir.multiplyScalar(amount);
  return {
    ...transform,
    position: snapPosition(
      [
        transform.position[0] + dir.x,
        transform.position[1] + dir.y,
        transform.position[2] + dir.z,
      ],
      grid
    ),
  };
}

/** Rotates a transform about a world or part-local axis by `deg` degrees. */
export function rotate(
  transform: PartTransform,
  axis: 0 | 1 | 2,
  deg: number,
  space: TransformSpace,
  grid: GridConfig = DEFAULT_GRID
): PartTransform {
  const current = quatFromDegrees(transform.rotation);
  const axisVec = new THREE.Vector3(
    axis === 0 ? 1 : 0,
    axis === 1 ? 1 : 0,
    axis === 2 ? 1 : 0
  );
  const delta = new THREE.Quaternion().setFromAxisAngle(axisVec, degToRad(deg));
  // Local rotation post-multiplies (spin about the part's own axis); world
  // rotation pre-multiplies (spin about the table axis).
  const next =
    space === 'local'
      ? current.clone().multiply(delta)
      : delta.clone().multiply(current);
  return { ...transform, rotation: snapRotation(degreesFromQuat(next), grid) };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Snaps a raw surface click onto the nearest *edge* of a box part.
 *
 * Weld joints run along edges, and a player can never click a 1-pixel edge
 * accurately. The two box axes whose faces are closest to the click are pinned
 * to that face, which leaves the third axis free - exactly the edge line - and
 * that free coordinate is then snapped to the grid so authored weld nodes stay
 * on whole-number units.
 */
export function snapToNearestEdge(
  world: Vec3,
  part: { size: Vec3 },
  transform: PartTransform,
  grid: GridConfig = DEFAULT_GRID,
  options: { enabled?: boolean; radiusCm?: number } = {}
): Vec3 {
  const { enabled = true, radiusCm } = options;
  const quat = quatFromDegrees(transform.rotation);
  // Part meshes are drawn lifted by half their height, so the box centre sits
  // above the stored transform position.
  const centre = new THREE.Vector3(
    transform.position[0],
    transform.position[1] + part.size[1] / 2,
    transform.position[2]
  );
  const local = new THREE.Vector3(world[0], world[1], world[2])
    .sub(centre)
    .applyQuaternion(quat.clone().invert());

  const half: Vec3 = [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
  const coords: Vec3 = [local.x, local.y, local.z];
  // Distance from the click to each pair of faces along that axis.
  const gaps = coords.map((c, i) => Math.abs(half[i] - Math.abs(c)));
  const freeAxis = gaps.indexOf(Math.max(...gaps));

  const snapped: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    if (i === freeAxis) {
      // Clamp inside the face before snapping so a node can't fall off the end.
      const limit = half[i];
      snapped[i] = Math.max(
        -limit,
        Math.min(limit, snapScalar(coords[i], grid.unitCm))
      );
      continue;
    }
    const face = coords[i] >= 0 ? half[i] : -half[i];
    // Only pull the click onto an edge when it is actually near one. Without
    // this a click in the middle of a face jumped to a distant edge, which is
    // what made node placement feel disconnected from the cursor.
    const withinRadius =
      radiusCm === undefined || Math.abs(face - coords[i]) <= radiusCm / 100;
    if (enabled && withinRadius) {
      snapped[i] = face;
    } else {
      // Clamp to the box: rounding an axis outwards could otherwise lift the
      // node off the surface the designer clicked.
      const limit = half[i];
      snapped[i] = Math.max(
        -limit,
        Math.min(limit, snapScalar(coords[i], grid.unitCm))
      );
    }
  }

  const out = new THREE.Vector3(snapped[0], snapped[1], snapped[2])
    .applyQuaternion(quat)
    .add(centre);
  return [round(out.x), round(out.y), round(out.z)];
}
