// Kinematics and coordinate math for 6-axis robot arm

export interface TCPPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  yaw: number;
}

export interface PosePreset {
  id: string;
  name: string;
  description: string;
  angles: number[]; // 6 joint angles in radians
}

export const POSE_PRESETS: PosePreset[] = [
  {
    id: "home",
    name: "Home Position",
    description: "Standard ready posture",
    angles: [0, -0.3, 0.4, 0, 0, 0],
  },
  {
    id: "pick_ready",
    name: "Pick Ready",
    description: "Reaching forward toward floor",
    angles: [0, 0.4, 0.65, 0, 0.45, 0],
  },
  {
    id: "drop_left",
    name: "Drop Left",
    description: "Swung left toward drop pit",
    angles: [-1.4, 0.3, 0.5, 0, 0.7, 0],
  },
  {
    id: "drop_right",
    name: "Drop Right",
    description: "Swung right toward output",
    angles: [1.4, 0.3, 0.5, 0, 0.7, 0],
  },
  {
    id: "high_reach",
    name: "High Reach",
    description: "Extended vertically",
    angles: [0, -0.7, -0.1, 0, -0.7, 0],
  },
  {
    id: "park",
    name: "Park / Folded",
    description: "Compact safe transport posture",
    angles: [0, -1.1, 2.1, 0, -1.0, 0],
  },
];

// Approximate Forward Kinematics calculation for the 6-DOF arm model
// Link lengths matching RobotModel.tsx:
// Base: 0.1, Link1 (shoulder): 0.95, Link2 (elbow): 0.95, Link3 (wrist roll): 0.75, Link4 (wrist pitch): 0.3, Gripper: 0.2
export function calculateTCP(angles: number[]): TCPPose {
  const [j1, j2, j3, j4, j5, j6] = angles;

  // 2D planar arm projection for pitch angles (j2, j3, j5)
  // J2 rotates around X (pitch), J3 rotates around X (pitch), J5 around X
  const L1 = 0.95;
  const L2 = 0.95;
  const L3 = 0.75;
  const L4 = 0.3;
  const Ltool = 0.22;

  const a2 = j2;
  const a3 = a2 + j3;
  const a5 = a3 + j5;

  // Reach in radial direction and height
  const r =
    L1 * Math.sin(a2) +
    L2 * Math.sin(a3) +
    (L3 + L4 + Ltool) * Math.sin(a5);

  const y =
    -1.5 + 0.1 +
    L1 * Math.cos(a2) +
    L2 * Math.cos(a3) +
    (L3 + L4 + Ltool) * Math.cos(a5);

  // Rotate around base pan (J1 around Y)
  const x = r * Math.sin(-j1);
  const z = r * Math.cos(j1);

  const pitch = ((a5 * 180) / Math.PI) % 360;
  const roll = (((j4 + j6) * 180) / Math.PI) % 360;
  const yaw = (((-j1) * 180) / Math.PI) % 360;

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    z: Number(z.toFixed(2)),
    pitch: Number(pitch.toFixed(1)),
    roll: Number(roll.toFixed(1)),
    yaw: Number(yaw.toFixed(1)),
  };
}
