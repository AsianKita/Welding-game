import level1 from './levels/level1.json';
import {
  AlignmentTolerance,
  LevelConfig,
  PartTransform,
  RelativeTargetConfig,
  Vec3,
} from './types';

/**
 * Level registry. Adding a level is a matter of dropping a JSON file next to
 * level1.json and registering it here - no component changes required.
 */
const LEVELS: Record<string, LevelConfig> = {
  level1: level1 as unknown as LevelConfig,
};

const OVERRIDE_PREFIX = 'weldgame.levelOverride.';

export function listLevelIds(): string[] {
  return Object.keys(LEVELS);
}

/**
 * Returns the level config, merged with any locally authored target state that
 * was saved from the debug tool (so a designer can iterate without editing JSON
 * on every run).
 */
export function loadLevel(levelId: string): LevelConfig {
  const base = LEVELS[levelId];
  if (!base) {
    throw new Error(`Unknown level: ${levelId}`);
  }
  // Structured clone keeps callers from mutating the imported JSON module.
  const config: LevelConfig = JSON.parse(JSON.stringify(base));
  const override = readOverride(levelId);
  if (override && override.length > 0) {
    config.targets = override;
  }
  return config;
}

export function readOverride(levelId: string): RelativeTargetConfig[] | null {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_PREFIX + levelId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RelativeTargetConfig[]) : null;
  } catch {
    return null;
  }
}

export function saveOverride(levelId: string, targets: RelativeTargetConfig[]): void {
  try {
    window.localStorage.setItem(OVERRIDE_PREFIX + levelId, JSON.stringify(targets));
  } catch {
    // Private-mode browsers can throw on localStorage writes; authoring still
    // works through the copy/download JSON buttons.
  }
}

export function clearOverride(levelId: string): void {
  try {
    window.localStorage.removeItem(OVERRIDE_PREFIX + levelId);
  } catch {
    /* ignore */
  }
}

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

/**
 * Expresses `follower` in the anchor's local space so alignment checks are
 * position-independent: the player may build the joint anywhere on the table as
 * long as the relative orientation matches.
 */
export function toRelative(anchor: PartTransform, follower: PartTransform): {
  offset: Vec3;
  rotationDeg: number;
} {
  const dx = follower.position[0] - anchor.position[0];
  const dy = follower.position[1] - anchor.position[1];
  const dz = follower.position[2] - anchor.position[2];
  const a = degToRad(-anchor.rotationDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Inverse Y rotation of the world-space delta.
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return {
    offset: [round(localX), round(dy), round(localZ)],
    rotationDeg: round(normalizeDeg(follower.rotationDeg - anchor.rotationDeg)),
  };
}

/** Converts a point in the anchor's local space back into world space. */
export function toWorld(anchor: PartTransform, local: Vec3): Vec3 {
  const a = degToRad(anchor.rotationDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x = local[0] * cos + local[2] * sin;
  const z = -local[0] * sin + local[2] * cos;
  return [
    anchor.position[0] + x,
    anchor.position[1] + local[1],
    anchor.position[2] + z,
  ];
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
  const dx = rel.offset[0] - target.offset[0];
  const dy = rel.offset[1] - target.offset[1];
  const dz = rel.offset[2] - target.offset[2];
  const positionError = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const rotationError = Math.abs(
    normalizeDeg(rel.rotationDeg - target.rotationDeg)
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
  target: RelativeTargetConfig
): PartTransform {
  return {
    position: toWorld(anchor, target.offset),
    rotationDeg: normalizeDeg(anchor.rotationDeg + target.rotationDeg),
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
