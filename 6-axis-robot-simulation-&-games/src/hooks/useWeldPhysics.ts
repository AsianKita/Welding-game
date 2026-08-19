import { useMemo } from 'react';
import {
  WireProfile,
  ArcStatus,
  TravelStatus,
  WeldHealth,
  evaluateArcStability,
  evaluateTravelSpeed,
  calculateSynergisticGeometry,
  normalizeWireProfile,
} from '../components/robot/weldProfiles';

export interface WeldPhysicsResult {
  // Gate 1: Arc Stability
  arcStatus: ArcStatus;
  weldHealth: WeldHealth;
  expectedVolt: number;
  wfsPct: number;
  statusMessage: string;
  isStable: boolean;

  // Gate 2: Travel Speed & Bead Geometry
  travelStatus: TravelStatus;
  speedMessage: string;
  defectMessage: string;
  width: number;
  height: number;
  depositRateRatio: number;
  speedRatio: number;

  // Baseline reference at current speed
  targetWidth: number;
  targetHeight: number;
}

/**
 * Two-Gate Synergistic Physics Hook
 * Evaluates real-world manufacturer data sheet envelopes:
 * Gate 1: Arc Stability (Volts vs. WFS Z-Curve Envelope)
 * Gate 2: Bead Geometry (Deposit Volume vs. Travel Speed)
 */
export function useWeldPhysics(
  voltage: number,
  wireFeed: number,
  travelSpeed: number,
  profile: WireProfile
): WeldPhysicsResult {
  return useMemo(() => {
    const safeProfile = normalizeWireProfile(profile);

    // Gate 1: Arc Stability
    const stability = evaluateArcStability(voltage, wireFeed, safeProfile);

    // Gate 2: Travel Speed Evaluation
    const speedEval = evaluateTravelSpeed(travelSpeed, safeProfile);

    // Gate 2: Bead Geometry
    const geometry = calculateSynergisticGeometry(voltage, wireFeed, travelSpeed, safeProfile);

    // Baseline Reference (At optimal volts & WFS for the given speed)
    const baseGeometry = calculateSynergisticGeometry(
      safeProfile.volts.opt,
      safeProfile.wfs.opt,
      travelSpeed,
      safeProfile
    );

    // Dynamic Defect Message priority combining Gate 1 and Gate 2
    let defect = '';
    if (stability.arcStatus === 'too_cold_stubbing') {
      defect = wireFeed < safeProfile.wfs.min
        ? '⚠️ Too Cold: WFS Below Minimum'
        : '❄️ Too Cold: Stringy/Stubbing';
    } else if (stability.arcStatus === 'too_hot_globular') {
      defect = wireFeed > safeProfile.wfs.max
        ? '🌋 Too Hot: WFS Exceeds Capacity'
        : '🌋 Too Hot: Undercut / Wide';
    } else if (speedEval.travelStatus === 'too_fast_disconnected') {
      defect = '⚠️ Too Fast: Disconnected Bead';
    } else if (speedEval.travelStatus === 'too_slow_glob') {
      defect = '🔥 Too Slow: Burn-Through Risk';
    } else {
      defect = '✓ Optimal Synergistic Arc & Speed';
    }

    return {
      arcStatus: stability.arcStatus,
      weldHealth: stability.weldHealth,
      expectedVolt: stability.expectedVolt,
      wfsPct: stability.wfsPct,
      statusMessage: stability.statusMessage,
      isStable: stability.isStable,
      travelStatus: speedEval.travelStatus,
      speedMessage: speedEval.speedMessage,
      defectMessage: defect,
      width: geometry.width,
      height: geometry.height,
      depositRateRatio: geometry.depositRateRatio,
      speedRatio: geometry.speedRatio,
      targetWidth: baseGeometry.width,
      targetHeight: baseGeometry.height,
    };
  }, [
    voltage,
    wireFeed,
    travelSpeed,
    profile,
    profile?.id,
    profile?.wfs?.min,
    profile?.wfs?.opt,
    profile?.wfs?.max,
    profile?.volts?.min,
    profile?.volts?.opt,
    profile?.volts?.max,
    profile?.diameter,
    profile?.baseSpeed,
    profile?.targetWidth,
    profile?.targetHeight,
  ]);
}
