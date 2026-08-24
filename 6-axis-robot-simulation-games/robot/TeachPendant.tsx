import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Square, Plus, Trash2, SkipForward, SkipBack, Repeat, RotateCcw, ArrowLeft, Cpu } from "lucide-react";
import { playClickSound, playGrabSound, playReleaseSound, playServoJogSound } from "./audio";

export interface Waypoint {
  id: string;
  name: string;
  angles: number[]; // 6 joint angles
  isGrabbing: boolean;
  dwellMs: number; // pause at waypoint in milliseconds
}

const DEFAULT_SAMPLE_PROGRAM: Waypoint[] = [
  {
    id: "wp-1",
    name: "P1: Home Ready",
    angles: [0, -0.3, 0.4, 0, 0, 0],
    isGrabbing: false,
    dwellMs: 400,
  },
  {
    id: "wp-2",
    name: "P2: Hover Over Item",
    angles: [-0.6, 0.2, 0.5, 0, 0.5, 0],
    isGrabbing: false,
    dwellMs: 300,
  },
  {
    id: "wp-3",
    name: "P3: Reach & Grip",
    angles: [-0.6, 0.45, 0.7, 0, 0.45, 0],
    isGrabbing: true,
    dwellMs: 500,
  },
  {
    id: "wp-4",
    name: "P4: Lift Up",
    angles: [-0.6, -0.1, 0.3, 0, 0.2, 0],
    isGrabbing: true,
    dwellMs: 300,
  },
  {
    id: "wp-5",
    name: "P5: Swing to Destination",
    angles: [1.2, -0.1, 0.3, 0, 0.2, 0],
    isGrabbing: true,
    dwellMs: 300,
  },
  {
    id: "wp-6",
    name: "P6: Lower to Drop Zone",
    angles: [1.2, 0.35, 0.6, 0, 0.4, 0],
    isGrabbing: true,
    dwellMs: 400,
  },
  {
    id: "wp-7",
    name: "P7: Release Gripper",
    angles: [1.2, 0.35, 0.6, 0, 0.4, 0],
    isGrabbing: false,
    dwellMs: 500,
  },
  {
    id: "wp-8",
    name: "P8: Return to Home",
    angles: [0, -0.3, 0.4, 0, 0, 0],
    isGrabbing: false,
    dwellMs: 400,
  },
];

interface TeachPendantProps {
  currentAngles: number[];
  isGrabbing: boolean;
  onSetJointTargets: (angles: number[]) => void;
  onSetIsGrabbing: (grab: boolean) => void;
  onClose?: () => void;
}

export default function TeachPendant({
  currentAngles,
  isGrabbing,
  onSetJointTargets,
  onSetIsGrabbing,
  onClose,
}: TeachPendantProps) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(DEFAULT_SAMPLE_PROGRAM);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);

  const goToWaypoint = useCallback(
    (index: number) => {
      if (index < 0 || index >= waypoints.length) return;
      setCurrentIndex(index);
      const wp = waypoints[index];
      onSetJointTargets(wp.angles);
      onSetIsGrabbing(wp.isGrabbing);
      playServoJogSound(1.2);
      if (wp.isGrabbing) {
        playGrabSound();
      } else {
        playReleaseSound();
      }
    },
    [waypoints, onSetJointTargets, onSetIsGrabbing]
  );

  // Playback execution loop
  useEffect(() => {
    if (!isPlaying || waypoints.length === 0) return;

    const nextIdx = currentIndex === null ? 0 : (currentIndex + 1) % waypoints.length;

    // Check if reached end without looping
    if (currentIndex !== null && currentIndex === waypoints.length - 1 && !isLooping) {
      setIsPlaying(false);
      return;
    }

    const currentWp = waypoints[nextIdx];
    goToWaypoint(nextIdx);

    const stepDuration = Math.max(300, (currentWp.dwellMs + 800) / playbackSpeed);

    playTimerRef.current = setTimeout(() => {
      // triggers next tick
      setCurrentIndex(nextIdx);
    }, stepDuration);

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, currentIndex, waypoints, isLooping, playbackSpeed, goToWaypoint]);

  const handleAddCurrentPose = () => {
    playClickSound();
    const newWp: Waypoint = {
      id: `wp-${Date.now()}`,
      name: `P${waypoints.length + 1}: Point`,
      angles: [...currentAngles],
      isGrabbing,
      dwellMs: 400,
    };
    setWaypoints((prev) => [...prev, newWp]);
  };

  const handleDeleteWaypoint = (id: string) => {
    playClickSound();
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
  };

  const handleResetToDefault = () => {
    playClickSound();
    stopPlayback();
    setWaypoints(DEFAULT_SAMPLE_PROGRAM);
    setCurrentIndex(null);
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 text-white text-xs font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Cpu size={14} />
          </div>
          <span className="font-semibold text-slate-200">Teach Pendant · Trajectory Sequencer</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetToDefault}
            title="Reset to Sample Routine"
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
          >
            <RotateCcw size={12} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Trajectory Playback Controls */}
      <div className="flex flex-wrap items-center gap-2 justify-between bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
        <div className="flex items-center gap-1.5">
          {!isPlaying ? (
            <button
              onClick={() => {
                playClickSound();
                setIsPlaying(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md shadow-emerald-600/20"
            >
              <Play size={12} />
              <span>Run Auto</span>
            </button>
          ) : (
            <button
              onClick={stopPlayback}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all"
            >
              <Pause size={12} />
              <span>Pause</span>
            </button>
          )}

          <button
            onClick={() => {
              playClickSound();
              stopPlayback();
              if (currentIndex !== null && currentIndex > 0) {
                goToWaypoint(currentIndex - 1);
              }
            }}
            title="Step Back"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
          >
            <SkipBack size={13} />
          </button>

          <button
            onClick={() => {
              playClickSound();
              stopPlayback();
              const next = currentIndex === null ? 0 : (currentIndex + 1) % waypoints.length;
              goToWaypoint(next);
            }}
            title="Step Forward"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
          >
            <SkipForward size={13} />
          </button>

          <button
            onClick={() => {
              playClickSound();
              setIsLooping(!isLooping);
            }}
            className={`p-2 rounded-lg border transition-all ${
              isLooping
                ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                : "bg-slate-800 border-slate-700 text-slate-500"
            }`}
            title={isLooping ? "Looping Enabled" : "Single Run"}
          >
            <Repeat size={13} />
          </button>
        </div>

        {/* Speed selectors */}
        <div className="flex items-center gap-1 bg-slate-900 px-1.5 py-1 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-500 mr-1">Speed:</span>
          {[0.5, 1, 2, 3].map((spd) => (
            <button
              key={spd}
              onClick={() => {
                playClickSound();
                setPlaybackSpeed(spd);
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                playbackSpeed === spd
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Waypoints List */}
      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
        {waypoints.map((wp, idx) => {
          const isActive = currentIndex === idx;
          return (
            <div
              key={wp.id}
              onClick={() => {
                stopPlayback();
                goToWaypoint(idx);
              }}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                isActive
                  ? "bg-indigo-950/60 border-indigo-500/50 text-white shadow-sm"
                  : "bg-slate-950/40 border-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                    isActive ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="font-medium text-slate-200">{wp.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                    wp.isGrabbing
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {wp.isGrabbing ? "Clamp" : "Open"}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">
                  {wp.angles.map((a) => Math.round((a * 180) / Math.PI)).join("°, ")}°
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWaypoint(wp.id);
                  }}
                  className="p-1 text-slate-600 hover:text-rose-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Teach Pose Button */}
      <button
        onClick={handleAddCurrentPose}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-all"
      >
        <Plus size={13} className="text-indigo-400" />
        <span>Teach & Record Current Arm Pose</span>
      </button>
    </div>
  );
}
