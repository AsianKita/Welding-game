// Data-driven campaign level types.
//
// Everything a level needs (dialogue text, portrait art, placeholder part
// geometry, tolerances, tack points, pass/fail metrics) lives in JSON so levels
// can be authored and re-balanced without touching component code.

export type Vec3 = [number, number, number];

export interface DialogueLine {
  /** Speaker id, used to look up the portrait in `portraits`. */
  speaker: string;
  text: string;
  /** Optional portrait override for this single line (e.g. an angry face). */
  portrait?: string;
}

export interface PortraitConfig {
  /** Display name shown in the dialogue box header. */
  name: string;
  /** Image URL. Empty/missing falls back to a generated placeholder swatch. */
  image?: string;
  /** Placeholder accent colour used when no image is supplied. */
  color?: string;
}

/** A placeholder metal part: a primitive box the player drags into place. */
export interface PartConfig {
  id: string;
  label: string;
  /** Box size in metres: [width, height, depth]. */
  size: Vec3;
  color?: string;
  /** Where the part spawns on the welding table. */
  spawnPosition: Vec3;
  /** Spawn rotation in degrees. Either a single Y angle or a full [x, y, z]. */
  spawnRotationDeg?: number | Vec3;
  /** When true the part is the anchor that the others are measured against. */
  anchor?: boolean;
}

/**
 * Expected orientation of a follower part *relative to the anchor part*.
 * Authored with the in-game debug tool ("Save Target State").
 */
export interface RelativeTargetConfig {
  partId: string;
  /** Follower position expressed in the anchor's local space. */
  offset: Vec3;
  /**
   * Follower rotation relative to the anchor, in degrees. A single number is
   * treated as a Y-only angle (legacy level files).
   */
  rotationDeg: number | Vec3;
}

export interface AlignmentTolerance {
  /** Max positional error, metres. */
  position: number;
  /** Max rotational error, degrees. */
  rotationDeg: number;
}

export interface TackPointConfig {
  id: string;
  /** Tack position in the anchor part's local space. */
  local: Vec3;
  radius?: number;
}

export interface GrindingConfig {
  /** Seconds of continuous grinding required to reach 100% prep. */
  durationSeconds: number;
  /** Prep fraction (0-1) required before the weld may start. */
  requiredProgress: number;
}

export interface WeldMetricsConfig {
  /** Fraction (0-1) of deposited beads that must be healthy to pass. */
  minGoodWeldPercentage: number;
  /** Minimum number of beads that must be deposited to count as a weld. */
  minBeadCount?: number;
}

export interface LevelDialogueConfig {
  intro: DialogueLine[];
  assemblyHint?: DialogueLine[];
  incorrectAssembly: DialogueLine[];
  tackingHint?: DialogueLine[];
  missedTack: DialogueLine[];
  grindingHint?: DialogueLine[];
  skippedGrind: DialogueLine[];
  executionHint?: DialogueLine[];
  badWeld: DialogueLine[];
  success: DialogueLine[];
  levelFailed: DialogueLine[];
}

/** Discrete unit grid so every authored value is a whole number. */
export interface GridConfig {
  /** Translation snap in centimetres (scene units are metres). */
  unitCm: number;
  /** Rotation snap in whole degrees. */
  rotationDeg: number;
}

export interface LevelConfig {
  id: string;
  title: string;
  /** Starting hard hats. */
  maxHp: number;
  portraits: Record<string, PortraitConfig>;
  dialogue: LevelDialogueConfig;
  parts: PartConfig[];
  /** Authored target arrangement, relative to the anchor part. */
  targets: RelativeTargetConfig[];
  tolerance: AlignmentTolerance;
  /** Discrete authoring grid. Omitted levels fall back to DEFAULT_GRID. */
  grid?: GridConfig;
  tackPoints: TackPointConfig[];
  grinding: GrindingConfig;
  metrics: WeldMetricsConfig;
  /**
   * Weld path handed to the fabrication sim, in the anchor part's local space.
   * Sampled along the joint seam.
   */
  weldPathLocal: Vec3[];
}

/** Aggregated result emitted by the welding simulation. */
export interface WeldReport {
  beadCount: number;
  goodBeadCount: number;
  goodPercentage: number;
  /** Bead counts keyed by weld health value. */
  healthBreakdown: Record<string, number>;
}

/** Live transform of a placeholder part on the table. Rotation is XYZ degrees. */
export interface PartTransform {
  position: Vec3;
  rotation: Vec3;
}

/** Camera framing presets offered by the viewport buttons. */
export type CameraPreset = 'iso' | 'top' | 'front' | 'side';

/** Which frame the nudge controls operate in. */
export type TransformSpace = 'world' | 'local';

export type LevelPhase =
  | 'intro'
  | 'assembly'
  | 'tacking'
  | 'grinding'
  | 'execution'
  | 'evaluation'
  | 'failed';
