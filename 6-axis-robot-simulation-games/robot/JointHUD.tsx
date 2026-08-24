import { calculateTCP } from "./kinematics";

interface JointHUDProps {
  jointAngles: number[];
  showTCP?: boolean;
}

const LABELS = ["J1 Base", "J2 Shoulder", "J3 Elbow", "J4 W-Roll", "J5 W-Pitch", "J6 Tool"];
const COLORS = [
  "text-amber-400",
  "text-sky-400",
  "text-emerald-400",
  "text-purple-400",
  "text-rose-400",
  "text-yellow-400",
];

export default function JointHUD({ jointAngles, showTCP = true }: JointHUDProps) {
  const tcp = calculateTCP(jointAngles);

  return (
    <div className="space-y-1.5 font-mono">
      {/* Joint Readout Grid */}
      <div className="grid grid-cols-6 gap-1 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
        {jointAngles.map((angle, i) => {
          const deg = ((angle * 180) / Math.PI).toFixed(1);
          return (
            <div key={i} className="flex flex-col items-center">
              <span className={`${COLORS[i]} text-[9px] font-bold tracking-tight`}>{LABELS[i]}</span>
              <span className="text-slate-200 text-[11px] font-semibold tabular-nums mt-0.5">{deg}°</span>
            </div>
          );
        })}
      </div>

      {/* TCP Cartesian Coordinates Bar */}
      {showTCP && (
        <div className="flex items-center justify-between px-2.5 py-1 bg-slate-950/70 rounded-md border border-slate-800/60 text-[10px] text-slate-400">
          <div className="flex items-center gap-1">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">TCP Pose:</span>
          </div>
          <div className="flex items-center gap-3 tabular-nums">
            <span><strong className="text-slate-300">X:</strong> {tcp.x}m</span>
            <span><strong className="text-slate-300">Y:</strong> {tcp.y}m</span>
            <span><strong className="text-slate-300">Z:</strong> {tcp.z}m</span>
            <span className="hidden sm:inline"><strong className="text-slate-300">Pitch:</strong> {tcp.pitch}°</span>
          </div>
        </div>
      )}
    </div>
  );
}
