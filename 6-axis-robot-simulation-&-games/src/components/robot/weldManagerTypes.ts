import * as THREE from 'three';

export type WeldBeadStyle = 'RIBBON' | 'STACKED_DIMES';

export type BeadTiltDirection = 'OVERLAP' | 'OPPOSITE' | '+Y' | '-Y' | '+X' | '-X';

export interface RoboDKWeldSettings {
  // Bead Style & Common
  bead_style: WeldBeadStyle;
  color_hex: string;
  point_spacing: number; // mm (RoboDK sampling spacing)

  // Ribbon Settings (Continuous GMAW/MIG)
  bead_width: number; // mm (e.g. 14.0)
  bead_height: number; // mm (e.g. 1.2)
  shoulder_width_factor: number; // 0.1 - 0.95 (e.g. 0.75)
  shoulder_height_ratio: number; // 0.1 - 0.9 (e.g. 0.25)
  ripple_pitch: number; // mm (e.g. 4.0)
  ripple_amplitude: number; // 0.0 - 0.35 (e.g. 0.08)
  ripple_phase_deg: number; // 0 - 360

  // Stacked Dimes Settings (GTAW/TIG / Pulse MIG)
  dime_length: number; // mm (e.g. 5.5)
  dime_width: number; // mm (e.g. 8.0)
  dime_height: number; // mm (e.g. 1.1)
  dime_overlap_pct: number; // 30% - 85% overlap (e.g. 60%)
  dime_rings: number; // Concentric rings (e.g. 5)
  dime_sides: number; // Polygon resolution (e.g. 16)

  // Manual Bead Tilt & Work Angle
  bead_tilt_angle_deg: number; // 0 - 90 deg (work angle tilt)
  bead_tilt_direction: BeadTiltDirection;
  bead_rotation_deg?: number; // -180 - 180 deg (torch axial rotation / seam twist)
  bead_pitch_deg?: number; // -45 - 45 deg (torch push/pull travel angle)

  // Overlap Blending & Ramp
  overlap_side: '+Y' | '-Y' | '+X' | '-X';
  blend_width_mm: number;
  blend_depth_pct: number;
  overlap_ramp_angle_deg: number;

  // Live Performance & Scaling Controls (On-The-Fly Debug / Tuning)
  scale_multiplier: number; // 0.5 - 8.0x overall size
  width_multiplier: number; // 0.5 - 5.0x width
  height_multiplier: number; // 0.5 - 5.0x crown height
  dimes_scale: number; // 0.2 - 3.0x specific scale for Stacked Dimes
  ribbon_scale: number; // 0.2 - 3.0x specific scale for Continuous Ribbon
  color_mode: 'SOLID_CUSTOM' | 'THERMAL_COOLING';
  cooling_duration_sec: number; // 0.5s - 20.0s transition from molten white-hot to cooled metal
  cooling_rate: number; // Decay rate per second (1.0 / duration)
  live_build: boolean;
  enable_jump_filter: boolean;
  max_segment_mm: number;
}

export const ROBODK_DEFAULT_SETTINGS: RoboDKWeldSettings = {
  bead_style: 'STACKED_DIMES',
  color_hex: '#eab308', // High-contrast Golden Amber / Gold Brass by default
  point_spacing: 1.2,

  // Scaling multi
  scale_multiplier: 2.8,
  width_multiplier: 1.8,
  height_multiplier: 2.0,
  dimes_scale: 1.0,
  ribbon_scale: 1.0,
  color_mode: 'THERMAL_COOLING',
  cooling_duration_sec: 0.5, // 0.5s default cooling curve
  cooling_rate: 2.0, // 1 / 0.5

  // Ribbon
  bead_width: 16.0,
  bead_height: 1.4,
  shoulder_width_factor: 0.75,
  shoulder_height_ratio: 0.25,
  ripple_pitch: 4.0,
  ripple_amplitude: 0.12,
  ripple_phase_deg: 0.0,

  // Stacked dimes
  dime_length: 6.5,
  dime_width: 10.0,
  dime_height: 1.5,
  dime_overlap_pct: 60,
  dime_rings: 5,
  dime_sides: 16,

  // Tilt & Rotation
  bead_tilt_angle_deg: 15.0,
  bead_tilt_direction: 'OVERLAP',
  bead_rotation_deg: 0.0,
  bead_pitch_deg: 0.0,

  // Overlap
  overlap_side: '+Y',
  blend_width_mm: 5.0,
  blend_depth_pct: 95.0,
  overlap_ramp_angle_deg: 45.0,

  live_build: true,
  enable_jump_filter: true,
  max_segment_mm: 8.0,
};

export interface WeldPreset {
  id: string;
  name: string;
  description: string;
  style: WeldBeadStyle;
  settings: Partial<RoboDKWeldSettings>;
  badgeColor: string;
}

export const ROBODK_PRESETS: WeldPreset[] = [
  {
    id: 'tig_stacked_dimes',
    name: 'TIG Stacked Dimes (GTAW)',
    description: 'Crisp overlapping elliptical coins with distinct ripple crowns and aerospace finish',
    style: 'STACKED_DIMES',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    settings: {
      bead_style: 'STACKED_DIMES',
      dime_length: 5.2,
      dime_width: 8.5,
      dime_height: 1.15,
      dime_overlap_pct: 65,
      bead_tilt_angle_deg: 12.0,
      color_hex: '#38bdf8',
    },
  },
  {
    id: 'mig_spray_ribbon',
    name: 'MIG Continuous Ribbon (GMAW)',
    description: 'Smooth, fluid solid-wire continuous bead with gentle ripple oscillation',
    style: 'RIBBON',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    settings: {
      bead_style: 'RIBBON',
      bead_width: 13.5,
      bead_height: 1.0,
      ripple_pitch: 3.8,
      ripple_amplitude: 0.08,
      shoulder_width_factor: 0.75,
      bead_tilt_angle_deg: 8.0,
      color_hex: '#f59e0b',
    },
  },
  {
    id: 'pulse_mig_weave',
    name: 'Pulse-MIG Weave Pattern',
    description: 'Deep-penetration stacked weave with wider shoulder crowns for thick structural plate',
    style: 'STACKED_DIMES',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    settings: {
      bead_style: 'STACKED_DIMES',
      dime_length: 6.8,
      dime_width: 12.0,
      dime_height: 1.4,
      dime_overlap_pct: 55,
      bead_tilt_angle_deg: 20.0,
      color_hex: '#c084fc',
    },
  },
  {
    id: 'stainless_temper_dimes',
    name: 'Stainless Rainbow Dimes',
    description: 'Tight aerospace overlap with straw/gold and sapphire heat-tinted temper',
    style: 'STACKED_DIMES',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    settings: {
      bead_style: 'STACKED_DIMES',
      dime_length: 4.2,
      dime_width: 6.8,
      dime_height: 0.95,
      dime_overlap_pct: 72,
      bead_tilt_angle_deg: 10.0,
      color_hex: '#ec4899',
    },
  },
  {
    id: 'heavy_corner_fillet',
    name: 'Heavy Fillet Bead (45° Tilt)',
    description: '45° bevel blend ramp for corner joints with asymmetric overlap slope',
    style: 'RIBBON',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    settings: {
      bead_style: 'RIBBON',
      bead_width: 16.0,
      bead_height: 1.3,
      bead_tilt_angle_deg: 35.0,
      bead_tilt_direction: 'OVERLAP',
      blend_width_mm: 6.0,
      overlap_ramp_angle_deg: 45.0,
      color_hex: '#10b981',
    },
  },
];

// Physical bead representation deposited along trajectory
export interface DepositedBeadElement {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  side: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scaleX: number; // length / along tangent
  scaleY: number; // height / along normal
  scaleZ: number; // width / along side
  heat: number;
  style: WeldBeadStyle;
  rippleOffset?: number;
}
