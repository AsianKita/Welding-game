import level1Json from './levels/level1.json';
import type { LevelConfig, PortraitConfig, TargetState, TransformData } from './types';

/**
 * Registry of shipped levels. Configs are plain JSON so designers can edit
 * dialogue, portraits, part sizes and tolerances without touching code.
 */
export const LEVELS: Record<string, LevelConfig> = {
  // JSON tuples widen to number[], so the cast goes through `unknown`.
  level_1: level1Json as unknown as LevelConfig,
};

export const DEFAULT_LEVEL_ID = 'level_1';

export function getLevelConfig(levelId: string = DEFAULT_LEVEL_ID): LevelConfig {
  const config = LEVELS[levelId];
  if (!config) throw new Error(`Unknown level id: ${levelId}`);
  return config;
}

export function getPortrait(config: LevelConfig, portraitId: string): PortraitConfig {
  return (
    config.portraits.find((p) => p.id === portraitId) ?? {
      id: portraitId,
      name: portraitId,
      initials: portraitId.slice(0, 2).toUpperCase(),
      color: '#475569',
    }
  );
}

const TARGET_STATE_KEY_PREFIX = 'welding_game_target_state_';

function storageKey(levelId: string) {
  return `${TARGET_STATE_KEY_PREFIX}${levelId}`;
}

function isTransform(value: unknown): value is TransformData {
  const t = value as TransformData | undefined;
  return (
    !!t &&
    Array.isArray(t.position) &&
    t.position.length === 3 &&
    t.position.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Array.isArray(t.rotation) &&
    t.rotation.length === 3 &&
    t.rotation.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** Validates an untrusted object (localStorage or a pasted JSON file) as a TargetState. */
export function parseTargetState(raw: unknown, levelId: string): TargetState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<TargetState>;
  if (!candidate.parts || typeof candidate.parts !== 'object') return null;

  const parts: Record<string, TransformData> = {};
  for (const [partId, transform] of Object.entries(candidate.parts)) {
    if (!isTransform(transform)) return null;
    parts[partId] = {
      position: [...transform.position] as [number, number, number],
      rotation: [...transform.rotation] as [number, number, number],
    };
  }
  if (Object.keys(parts).length === 0) return null;

  return {
    levelId: typeof candidate.levelId === 'string' ? candidate.levelId : levelId,
    parts,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : undefined,
    note: typeof candidate.note === 'string' ? candidate.note : undefined,
  };
}

/**
 * Loads the authored "Expected Orientation" for a level.
 * Falls back to the target state shipped in the level JSON.
 */
export function loadTargetState(levelId: string): TargetState | null {
  try {
    const saved = localStorage.getItem(storageKey(levelId));
    if (saved) {
      const parsed = parseTargetState(JSON.parse(saved), levelId);
      if (parsed) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load saved target state, using level default.', e);
  }
  return LEVELS[levelId]?.targetState ?? null;
}

/** Persists the authored target state produced by the Debug Tool. */
export function saveTargetState(state: TargetState): boolean {
  try {
    const payload: TargetState = { ...state, savedAt: new Date().toISOString() };
    localStorage.setItem(storageKey(state.levelId), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error('Failed to save target state', e);
    return false;
  }
}

/** Drops the local override so the level JSON default applies again. */
export function clearTargetState(levelId: string): boolean {
  try {
    localStorage.removeItem(storageKey(levelId));
    return true;
  } catch (e) {
    console.error('Failed to clear target state', e);
    return false;
  }
}

/** Pretty-printed JSON, ready to paste into the level config's `targetState` field. */
export function serializeTargetState(state: TargetState): string {
  return JSON.stringify(state, null, 2);
}
