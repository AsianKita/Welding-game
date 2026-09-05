/**
 * Core data structures for the level-based campaign.
 *
 * Everything the designer can tune (dialogue, portraits, part geometry,
 * tolerances, HP) lives in JSON config files under `src/game/levels/`.
 * No gameplay text or asset path should be hardcoded in a component.
 */

/** A plain, JSON-serializable transform. Positions are metres, rotations radians (XYZ euler). */
export interface TransformData {
  position: [number, number, number];
  rotation: [number, number, number];
}

/** Placeholder art descriptor. `src` is optional so the game runs with zero binary assets. */
export interface PortraitConfig {
  /** Stable id referenced by dialogue lines. */
  id: string;
  /** Display name shown in the dialogue box header. */
  name: string;
  /** Optional image URL. When absent the UI renders the `initials`/`color` placeholder. */
  src?: string;
  /** Fallback placeholder text (1-3 chars). */
  initials: string;
  /** Fallback placeholder background colour (any CSS colour). */
  color: string;
  /** Optional mood tag so one character can have several swappable portraits. */
  mood?: string;
}

/** One line of dialogue. */
export interface DialogueLine {
  /** Portrait id, resolved against `LevelConfig.portraits`. */
  speaker: string;
  text: string;
  /** Optional portrait mood override for this line. */
  mood?: string;
}

/**
 * Banter is dialogue triggered by a gameplay event rather than by the script.
 * `damage: true` means firing it costs the player 1 HP.
 */
export interface BanterEntry {
  id: string;
  damage: boolean;
  lines: DialogueLine[];
}

/** Primitive placeholder geometry. Swap for real models later without touching code. */
export type PartShape = 'box' | 'cylinder';

export interface PartDefinition {
  id: string;
  label: string;
  shape: PartShape;
  /** Box: [width, height, depth]. Cylinder: [radius, height, radialSegments]. */
  size: [number, number, number];
  color: string;
  /** Where the part spawns at the start of the Assembly state. */
  spawn: TransformData;
  /** Optional model path, used instead of the primitive once real art exists. */
  model?: string;
}

/** How close the player's arrangement must be to the authored target. */
export interface AlignmentTolerance {
  /**
   * When true (default), part transforms are compared in the reference part's
   * local frame, so the joint can be assembled anywhere on the table as long as
   * the parts are correct relative to each other.
   */
  relative?: boolean;
  /** Max per-axis positional error, metres. */
  positionMeters: number;
  /** Max per-axis rotational error, degrees. */
  rotationDegrees: number;
  /** When true, rotations are compared modulo 180 deg so flipped parts still count. */
  symmetricRotation: boolean;
}

/** A saved "Expected Orientation": the authored transform for every part. */
export interface TargetState {
  levelId: string;
  /** partId -> transform */
  parts: Record<string, TransformData>;
  savedAt?: string;
  /** Free-form note for the level author. */
  note?: string;
}

/** Pass/fail thresholds for the Evaluation state, tuned per level. */
export interface EvaluationConfig {
  /** Fraction (0..1) of bead samples that must be arc-stable at a good travel speed. */
  minGoodWeldPercentage: number;
  /** Minimum beads that must be deposited for the run to count as a real attempt. */
  minBeadCount: number;
}

/** Placeholder grinding/prep phase (State 2.5). */
export interface GrindingConfig {
  /** Number of prep samples spread along the seam. */
  sampleCount: number;
  /** Grinder head radius, metres: how close the tool must pass to clear a sample. */
  toolRadius: number;
  /** Fraction (0..1) of samples that must be cleared to finish prep. */
  requiredProgress: number;
}

/** Corner hitbox for the Tacking state (State 2). */
export interface TackPointConfig {
  id: string;
  position: [number, number, number];
  radius: number;
}

export interface LevelConfig {
  id: string;
  title: string;
  /**
   * Part whose transform defines the local frame for relative alignment,
   * tack points and the seam. Defaults to the first entry in `parts`.
   */
  referencePartId?: string;
  /** Starting HP, rendered as hard hats. */
  maxHp: number;
  portraits: PortraitConfig[];
  /** Scripted dialogue keyed by state name, e.g. `intro`, `assemblyComplete`. */
  script: Record<string, DialogueLine[]>;
  /** Event-driven banter keyed by event name, e.g. `incorrectAssembly`. */
  banter: Record<string, BanterEntry>;
  parts: PartDefinition[];
  tolerance: AlignmentTolerance;
  tackPoints: TackPointConfig[];
  /**
   * Seam polyline in the reference part's local space. Drives the grinding
   * samples and the weld path injected into the welding simulation.
   */
  seam: [number, number, number][];
  grinding: GrindingConfig;
  evaluation: EvaluationConfig;
  /** Default target state shipped with the level; overridable via the Debug Tool. */
  targetState?: TargetState;
}

/** Per-part result of comparing the live scene against the target state. */
export interface PartAlignmentResult {
  partId: string;
  aligned: boolean;
  /** Largest per-axis positional error, metres. */
  positionError: number;
  /** Largest per-axis rotational error, degrees. */
  rotationError: number;
}

export interface AlignmentResult {
  aligned: boolean;
  parts: PartAlignmentResult[];
}

/** Ordered states of the Level 1 machine. */
export type LevelPhase =
  | 'intro'
  | 'assembly'
  | 'tacking'
  | 'grinding'
  | 'execution'
  | 'evaluation'
  | 'success'
  | 'failed';
