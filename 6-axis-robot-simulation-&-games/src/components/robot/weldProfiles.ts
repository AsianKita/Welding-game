export interface WeldSpec {
  min: number;
  opt: number;
  max: number;
}

export interface WireProfile {
  id: string;
  name: string;
  diameter: number; // inches, e.g. 0.045, 0.035
  wfs: WeldSpec; // IPM
  volts: WeldSpec; // Volts
  baseSpeed: number; // cm/min
  targetWidth: number; // mm
  targetHeight: number; // mm
}

export type ArcStatus =
  | 'stable_spray'
  | 'too_hot_globular'
  | 'too_cold_stubbing'
  | 'failed_exceeds_max'
  | 'failed_below_min'
  | 'failed';

export type TravelStatus =
  | 'too_fast_disconnected'
  | 'too_slow_glob'
  | 'good_speed';

export type WeldHealth = 'perfect' | 'too_cold' | 'too_hot';

/**
 * Gate 2: Travel Speed Evaluator
 * Evaluates current travel speed against manufacturer baseline nominal speed.
 * - > 40% faster than nominal: 'too_fast_disconnected'
 * - > 40% slower than nominal: 'too_slow_glob'
 * - within ±40%: 'good_speed'
 */
export function evaluateTravelSpeed(
  currentSpeed: number,
  profile: WireProfile
): {
  travelStatus: TravelStatus;
  speedMessage: string;
  speedRatio: number;
} {
  const norm = normalizeWireProfile(profile);
  const nominal = norm.baseSpeed || 30;
  const safeSpeed = Math.max(1, currentSpeed);
  const speedRatio = safeSpeed / nominal;

  if (safeSpeed > nominal * 1.4) {
    return {
      travelStatus: 'too_fast_disconnected',
      speedMessage: '⚠️ Too Fast: Disconnected Bead',
      speedRatio: Number(speedRatio.toFixed(2)),
    };
  }

  if (safeSpeed < nominal * 0.6) {
    return {
      travelStatus: 'too_slow_glob',
      speedMessage: '🔥 Too Slow: Burn-Through Risk',
      speedRatio: Number(speedRatio.toFixed(2)),
    };
  }

  return {
    travelStatus: 'good_speed',
    speedMessage: '✓ Good Travel Speed',
    speedRatio: Number(speedRatio.toFixed(2)),
  };
}

// Default Industry Standard Manufacturer Spec Sheets
export const DEFAULT_WIRE_PROFILES: Record<string, WireProfile> = {
  fcaw_045: {
    id: 'fcaw_045',
    name: 'FCAW .045" (E71T-1 Dual Shield)',
    diameter: 0.045,
    wfs: { min: 195, opt: 300, max: 475 },
    volts: { min: 20.0, opt: 24.0, max: 28.0 },
    baseSpeed: 30, // cm/min
    targetWidth: 9.5, // mm
    targetHeight: 2.5, // mm
  },
  solid_035: {
    id: 'solid_035',
    name: 'GMAW Solid .035" (ER70S-6)',
    diameter: 0.035,
    wfs: { min: 150, opt: 280, max: 450 },
    volts: { min: 17.0, opt: 21.0, max: 26.0 },
    baseSpeed: 28,
    targetWidth: 8.0,
    targetHeight: 2.2,
  },
  solid_045: {
    id: 'solid_045',
    name: 'GMAW Solid .045" (ER70S-6 Heavy)',
    diameter: 0.045,
    wfs: { min: 180, opt: 320, max: 500 },
    volts: { min: 21.0, opt: 26.0, max: 31.0 },
    baseSpeed: 32,
    targetWidth: 11.0,
    targetHeight: 3.0,
  },
  al_4043: {
    id: 'al_4043',
    name: 'GMAW Aluminum 3/64" (ER4043)',
    diameter: 0.047,
    wfs: { min: 240, opt: 380, max: 550 },
    volts: { min: 19.0, opt: 23.0, max: 27.0 },
    baseSpeed: 40,
    targetWidth: 10.5,
    targetHeight: 2.8,
  },
  stainless_308: {
    id: 'stainless_308',
    name: 'GMAW Stainless .035" (ER308L)',
    diameter: 0.035,
    wfs: { min: 160, opt: 260, max: 400 },
    volts: { min: 18.0, opt: 22.0, max: 25.5 },
    baseSpeed: 26,
    targetWidth: 7.8,
    targetHeight: 2.0,
  },
};

/**
 * Normalizes any profile object (including legacy profiles loaded from localStorage)
 * to ensure all synergistic spec sheet fields exist safely without crashing.
 */
export function normalizeWireProfile(rawProfile: any): WireProfile {
  if (!rawProfile) return DEFAULT_WIRE_PROFILES.fcaw_045;

  const id = rawProfile.id || 'fcaw_045';
  const defaultMatch = DEFAULT_WIRE_PROFILES[id] || DEFAULT_WIRE_PROFILES.fcaw_045;

  const diameter = typeof rawProfile.diameter === 'number' ? rawProfile.diameter : defaultMatch.diameter;
  const baseSpeed = typeof rawProfile.baseSpeed === 'number' ? rawProfile.baseSpeed : defaultMatch.baseSpeed;
  const targetWidth = typeof rawProfile.targetWidth === 'number' ? rawProfile.targetWidth : defaultMatch.targetWidth;
  const targetHeight = typeof rawProfile.targetHeight === 'number' ? rawProfile.targetHeight : defaultMatch.targetHeight;

  const wfs: WeldSpec =
    rawProfile.wfs && typeof rawProfile.wfs.min === 'number' && typeof rawProfile.wfs.max === 'number'
      ? rawProfile.wfs
      : defaultMatch.wfs;

  const volts: WeldSpec =
    rawProfile.volts && typeof rawProfile.volts.min === 'number' && typeof rawProfile.volts.max === 'number'
      ? rawProfile.volts
      : defaultMatch.volts;

  return {
    id,
    name: rawProfile.name || defaultMatch.name,
    diameter,
    wfs,
    volts,
    baseSpeed,
    targetWidth,
    targetHeight,
  };
}

/**
 * Gate 1: Arc Stability Evaluator (The Synergistic Z-Curve Envelope)
 * Calculates expected synergistic voltage for a given WFS and evaluates arc status:
 * - currentWFS < activeProfile.wfs.min: 'too_cold_stubbing' (HUD: "⚠️ Too Cold: WFS Below Minimum")
 * - currentWFS > activeProfile.wfs.max: 'too_hot_globular' (HUD: "🌋 Too Hot: WFS Exceeds Capacity")
 * - Voltage within ±2.0V of the synergistic curve: 'stable_spray'
 * - Voltage > 2.0V above expected: 'too_hot_globular'
 * - Voltage < 2.0V below expected: 'too_cold_stubbing'
 */
export function evaluateArcStability(
  currentVolt: number,
  currentWFS: number,
  profile: WireProfile
): {
  arcStatus: ArcStatus;
  weldHealth: WeldHealth;
  expectedVolt: number;
  wfsPct: number;
  statusMessage: string;
  isStable: boolean;
} {
  const norm = normalizeWireProfile(profile);

  // 1. Calculate WFS percentage across manufacturer min/max envelope
  const wfsRange = norm.wfs.max - norm.wfs.min;
  const wfsPct = wfsRange > 0 ? (currentWFS - norm.wfs.min) / wfsRange : 0.5;

  // 2. Calculate expected synergistic Voltage for that WFS
  const voltRange = norm.volts.max - norm.volts.min;
  const expectedVolt = norm.volts.min + wfsPct * voltRange;

  // 3. Absolute WFS boundaries mapped directly to hot/cold visual states
  if (currentWFS < norm.wfs.min) {
    return {
      arcStatus: 'too_cold_stubbing',
      weldHealth: 'too_cold',
      expectedVolt: Number(expectedVolt.toFixed(1)),
      wfsPct: Math.max(0, Math.min(1, wfsPct)),
      statusMessage: '⚠️ Too Cold: WFS Below Minimum',
      isStable: false,
    };
  }

  if (currentWFS > norm.wfs.max) {
    return {
      arcStatus: 'too_hot_globular',
      weldHealth: 'too_hot',
      expectedVolt: Number(expectedVolt.toFixed(1)),
      wfsPct: Math.max(0, Math.min(1, wfsPct)),
      statusMessage: '🌋 Too Hot: WFS Exceeds Capacity',
      isStable: false,
    };
  }

  // 4. Synergistic Evaluation (±2.0V Tolerance)
  const voltDelta = currentVolt - expectedVolt;

  if (voltDelta > 2.0) {
    return {
      arcStatus: 'too_hot_globular',
      weldHealth: 'too_hot',
      expectedVolt: Number(expectedVolt.toFixed(1)),
      wfsPct: Math.max(0, Math.min(1, wfsPct)),
      statusMessage: '🌋 High Voltage / Globular: Reduce Voltage (-V) or Increase WFS (+IPM)',
      isStable: false,
    };
  }

  if (voltDelta < -2.0) {
    return {
      arcStatus: 'too_cold_stubbing',
      weldHealth: 'too_cold',
      expectedVolt: Number(expectedVolt.toFixed(1)),
      wfsPct: Math.max(0, Math.min(1, wfsPct)),
      statusMessage: '❄️ Wire Stubbing: Increase Voltage (+V) or Reduce WFS (-IPM)',
      isStable: false,
    };
  }

  return {
    arcStatus: 'stable_spray',
    weldHealth: 'perfect',
    expectedVolt: Number(expectedVolt.toFixed(1)),
    wfsPct: Math.max(0, Math.min(1, wfsPct)),
    statusMessage: '⚡ Stable Arc Transfer (Synergistic Match)',
    isStable: true,
  };
}

/**
 * Gate 2: Bead Geometry Evaluator (Volume vs. Speed)
 * Deposit Rate = currentWFS * (Wire Cross-Sectional Area)
 * calculatedWidth = baseTargetWidth * (Deposit Rate / Base Deposit Rate) * (baseSpeed / currentSpeed)
 * calculatedHeight = baseTargetHeight * (Deposit Rate / Base Deposit Rate) * (baseSpeed / currentSpeed)
 */
export function calculateSynergisticGeometry(
  currentVolt: number,
  currentWFS: number,
  currentSpeed: number,
  profile: WireProfile
): {
  width: number;
  height: number;
  depositRateRatio: number;
  speedRatio: number;
} {
  const norm = normalizeWireProfile(profile);

  // Evaluate Gate 1 stability status
  const stability = evaluateArcStability(currentVolt, currentWFS, norm);

  // Wire cross-sectional area in square inches
  const radius = norm.diameter / 2;
  const wireArea = Math.PI * radius * radius;

  // Deposit rates calculated directly from actual WFS
  const currentDepositRate = Math.max(10, currentWFS) * wireArea;
  const baseDepositRate = Math.max(10, norm.wfs.opt) * wireArea;
  const depositRateRatio = baseDepositRate > 0 ? currentDepositRate / baseDepositRate : 1.0;

  // Speed ratio
  const safeSpeed = Math.max(1.0, currentSpeed);
  const speedRatio = norm.baseSpeed / safeSpeed;

  // Volumetric deposit multiplier
  const volumeMultiplier = depositRateRatio * speedRatio;

  // 2D dimensional scaling: cross-sectional area scales linearly with volume,
  // so width & height scale proportionally to sqrt(volumeMultiplier) with physical aspect ratio preserved
  const dimScale = Math.sqrt(Math.max(0.04, volumeMultiplier));

  // Wet-out effect: Higher voltage relative to expected causes puddle to wet out wider and flatter
  const voltRatio = stability.expectedVolt > 0 ? currentVolt / stability.expectedVolt : 1.0;
  const wetOutFactor = Math.pow(Math.max(0.6, Math.min(1.4, voltRatio)), 0.65);

  const calculatedWidth = norm.targetWidth * dimScale * wetOutFactor;
  const calculatedHeight = norm.targetHeight * dimScale * (1 / Math.max(0.7, wetOutFactor));

  return {
    width: Math.max(0.5, Number(calculatedWidth.toFixed(2))),
    height: Math.max(0.2, Number(calculatedHeight.toFixed(2))),
    depositRateRatio: Number(depositRateRatio.toFixed(3)),
    speedRatio: Number(speedRatio.toFixed(3)),
  };
}

/**
 * Convenience Physics API for Stage 3
 */
export function calcBeadWidth(v: number, s: number, profile: WireProfile, wfs?: number): number {
  const norm = normalizeWireProfile(profile);
  const activeWFS = typeof wfs === 'number' ? wfs : norm.wfs.opt;
  return calculateSynergisticGeometry(v, activeWFS, s, norm).width;
}

export function calcBeadHeight(wfs: number, s: number, profile: WireProfile, v?: number): number {
  const norm = normalizeWireProfile(profile);
  const activeV = typeof v === 'number' ? v : norm.volts.opt;
  return calculateSynergisticGeometry(activeV, wfs, s, norm).height;
}

export function calcTargetGeometry(
  s: number,
  profile: WireProfile
): { targetWidth: number; targetHeight: number } {
  const norm = normalizeWireProfile(profile);
  const geom = calculateSynergisticGeometry(norm.volts.opt, norm.wfs.opt, s, norm);
  return {
    targetWidth: geom.width,
    targetHeight: geom.height,
  };
}

export function evaluateWeldHealth(calcWidth: number, targetWidth: number): WeldHealth {
  if (!targetWidth || targetWidth <= 0) return 'perfect';
  const ratio = (calcWidth - targetWidth) / targetWidth;
  if (ratio > 0.15) {
    return 'too_hot';
  } else if (ratio < -0.15) {
    return 'too_cold';
  }
  return 'perfect';
}
