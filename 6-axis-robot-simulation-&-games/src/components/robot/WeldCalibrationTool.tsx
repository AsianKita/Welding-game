import React, { useState, useMemo } from 'react';
import {
  Target,
  Minimize2,
  Maximize2,
  X,
  Sparkles,
  Check,
  Save,
  RotateCcw,
  Sliders,
  Activity,
  Zap,
  Flame,
  Snowflake,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  WireProfile,
  DEFAULT_WIRE_PROFILES,
  normalizeWireProfile,
  evaluateArcStability,
  calculateSynergisticGeometry,
  ArcStatus,
  WeldHealth,
} from './weldProfiles';
import { useDebugSettings } from '../../hooks/useDebugSettings';

interface WeldCalibrationToolProps {
  currentVolt: number;
  currentWFS: number;
  currentSpeed: number;
  activeProfile?: WireProfile;
  profiles?: Record<string, WireProfile>;
  onSelectProfile?: (id: string) => void;
  onUpdateProfile?: (profile: WireProfile) => void;
  onClose?: () => void;
  isEmbedded?: boolean;
}

export default function WeldCalibrationTool({
  currentVolt,
  currentWFS,
  currentSpeed,
  activeProfile: propActiveProfile,
  profiles = DEFAULT_WIRE_PROFILES,
  onSelectProfile,
  onUpdateProfile,
  onClose,
  isEmbedded = false,
}: WeldCalibrationToolProps) {
  const { saveAllSettings, loadAllSettings } = useDebugSettings();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [localProfileId, setLocalProfileId] = useState<string>('fcaw_045');
  const [localProfiles, setLocalProfiles] = useState<Record<string, WireProfile>>(DEFAULT_WIRE_PROFILES);
  const [activeChartTab, setActiveChartTab] = useState<'stability' | 'geometry'>('stability');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const safeProfiles: Record<string, WireProfile> =
    profiles && typeof profiles === 'object' && !Array.isArray(profiles) && Object.keys(profiles).length > 0
      ? profiles
      : DEFAULT_WIRE_PROFILES;

  const rawActive =
    propActiveProfile ||
    safeProfiles[localProfileId] ||
    localProfiles[localProfileId] ||
    DEFAULT_WIRE_PROFILES.fcaw_045;

  const activeProfile = normalizeWireProfile(rawActive);

  const handleProfileSelect = (id: string) => {
    setLocalProfileId(id);
    if (onSelectProfile) {
      onSelectProfile(id);
    }
  };

  const handleUpdateActiveProfile = (updated: WireProfile) => {
    const normalized = normalizeWireProfile(updated);
    if (onUpdateProfile) {
      onUpdateProfile(normalized);
    } else {
      setLocalProfiles((prev) => ({
        ...(prev || DEFAULT_WIRE_PROFILES),
        [normalized.id]: normalized,
      }));
    }
  };

  const handleSpecChange = (
    category: 'wfs' | 'volts',
    field: 'min' | 'opt' | 'max',
    val: number
  ) => {
    const updated: WireProfile = {
      ...activeProfile,
      [category]: {
        ...activeProfile[category],
        [field]: Number(val) || 0,
      },
    };
    handleUpdateActiveProfile(updated);
  };

  const handleFieldChange = (
    field: 'diameter' | 'baseSpeed' | 'targetWidth' | 'targetHeight',
    val: number
  ) => {
    const updated: WireProfile = {
      ...activeProfile,
      [field]: Number(val) || 0,
    };
    handleUpdateActiveProfile(updated);
  };

  const handleResetToDefault = () => {
    const defaultData = DEFAULT_WIRE_PROFILES[activeProfile.id] || DEFAULT_WIRE_PROFILES.fcaw_045;
    handleUpdateActiveProfile(JSON.parse(JSON.stringify(defaultData)));
  };

  const handleSaveToLocalStorage = () => {
    const existing = loadAllSettings() || {};
    const normalized = normalizeWireProfile(activeProfile);
    const updatedProfiles = {
      ...(safeProfiles || DEFAULT_WIRE_PROFILES),
      [normalized.id]: normalized,
    };

    // 1. Explicitly update the activeProfile & profiles React state in memory at the exact same moment
    if (onUpdateProfile) {
      onUpdateProfile(normalized);
    }
    if (onSelectProfile) {
      onSelectProfile(normalized.id);
    }
    setLocalProfiles(updatedProfiles);

    // 2. Persist to localStorage
    saveAllSettings({
      ...existing,
      activeProfileId: normalized.id,
      customProfiles: updatedProfiles,
    });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // Two-Gate Live Calculations
  const stability = evaluateArcStability(currentVolt, currentWFS, activeProfile);
  const geometry = calculateSynergisticGeometry(currentVolt, currentWFS, currentSpeed, activeProfile);
  const baseGeometry = calculateSynergisticGeometry(
    activeProfile.volts.opt,
    activeProfile.wfs.opt,
    currentSpeed,
    activeProfile
  );

  // CHART 1: Synergistic Arc Stability Envelope (Volts vs. WFS)
  // X-axis: WFS (100 to 600 IPM), Y-axis: Volts (14 to 34 Volts)
  const minPlotWFS = 100;
  const maxPlotWFS = 600;
  const minPlotVolt = 14;
  const maxPlotVolt = 34;

  const mapWfsToX = (wfs: number) => {
    const clamped = Math.max(minPlotWFS, Math.min(maxPlotWFS, wfs));
    return ((clamped - minPlotWFS) / (maxPlotWFS - minPlotWFS)) * 360 + 20; // 20px - 380px
  };

  const mapVoltToY = (volt: number) => {
    const clamped = Math.max(minPlotVolt, Math.min(maxPlotVolt, volt));
    return 180 - ((clamped - minPlotVolt) / (maxPlotVolt - minPlotVolt)) * 160; // 20px - 180px
  };

  // Generate Stability Envelope Polygon & Ideal Line
  const wfsMinX = mapWfsToX(activeProfile.wfs.min);
  const wfsMaxX = mapWfsToX(activeProfile.wfs.max);
  const wfsOptX = mapWfsToX(activeProfile.wfs.opt);

  const voltMinAtMinWfsY = mapVoltToY(activeProfile.volts.min);
  const voltMaxAtMaxWfsY = mapVoltToY(activeProfile.volts.max);
  const voltOptAtOptWfsY = mapVoltToY(activeProfile.volts.opt);

  // Band boundaries (+2V upper, -2V lower across the WFS range)
  const upperMinY = mapVoltToY(activeProfile.volts.min + 2.0);
  const upperMaxY = mapVoltToY(activeProfile.volts.max + 2.0);
  const lowerMinY = mapVoltToY(activeProfile.volts.min - 2.0);
  const lowerMaxY = mapVoltToY(activeProfile.volts.max - 2.0);

  const stabilityBandPolygon = `M ${wfsMinX.toFixed(1)} ${upperMinY.toFixed(1)} L ${wfsMaxX.toFixed(1)} ${upperMaxY.toFixed(1)} L ${wfsMaxX.toFixed(1)} ${lowerMaxY.toFixed(1)} L ${wfsMinX.toFixed(1)} ${lowerMinY.toFixed(1)} Z`;
  const idealSynergisticLine = `M ${wfsMinX.toFixed(1)} ${voltMinAtMinWfsY.toFixed(1)} L ${wfsMaxX.toFixed(1)} ${voltMaxAtMaxWfsY.toFixed(1)}`;

  // CHART 2: Bead Geometry vs. Travel Speed (0 to 200 cm/min)
  const geometrySpeedPoints = useMemo(() => {
    const pts = [];
    for (let s = 5; s <= 200; s += 5) {
      const g = calculateSynergisticGeometry(currentVolt, currentWFS, s, activeProfile);
      const target = calculateSynergisticGeometry(activeProfile.volts.opt, activeProfile.wfs.opt, s, activeProfile);
      pts.push({ speed: s, width: g.width, targetWidth: target.width });
    }
    return pts;
  }, [currentVolt, currentWFS, activeProfile]);

  const mapSpeedX = (speed: number) => {
    const clamped = Math.max(0, Math.min(200, speed));
    return (clamped / 200) * 360 + 20;
  };

  const mapBeadWidthY = (width: number) => {
    const clamped = Math.max(0.5, Math.min(22, width));
    return 180 - (clamped / 22) * 160;
  };

  const geomWidthPath = geometrySpeedPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapSpeedX(p.speed).toFixed(1)} ${mapBeadWidthY(p.width).toFixed(1)}`)
    .join(' ');

  const targetWidthPath = geometrySpeedPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapSpeedX(p.speed).toFixed(1)} ${mapBeadWidthY(p.targetWidth).toFixed(1)}`)
    .join(' ');

  if (isCollapsed && !isEmbedded) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md border border-amber-500/50 rounded-xl p-2 shadow-2xl flex items-center gap-2 text-white font-mono text-xs">
        <Target size={14} className="text-amber-400" />
        <span className="font-bold text-amber-300">Spec Calibration ({activeProfile.name})</span>
        <span className="text-slate-400">({stability.arcStatus})</span>
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white ml-2 cursor-pointer"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${
        isEmbedded
          ? 'w-full bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2.5'
          : 'bg-slate-950/95 backdrop-blur-xl border border-amber-500/40 rounded-2xl p-3.5 w-[560px] max-w-[calc(100vw-24px)] shadow-2xl flex flex-col gap-2.5'
      } text-white font-mono select-none transition-all`}
    >
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center border-b border-slate-800/80 pb-1.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Target size={14} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-amber-400 text-xs leading-tight">Two-Gate Synergistic Physics Studio</h3>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {activeProfile.name}
              </span>
            </div>
            <span className="text-[9px] text-slate-400">Manufacturer spec sheet envelope &amp; deposit volume engine</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSaveToLocalStorage}
            className={`flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-sm ${
              saveStatus === 'saved'
                ? 'bg-emerald-500 text-slate-950 ring-1 ring-emerald-400 shadow-emerald-500/30'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 hover:shadow-amber-500/20 active:scale-95'
            }`}
            title="Save custom manufacturer spec sheets to localStorage"
          >
            {saveStatus === 'saved' ? (
              <>
                <Check size={11} className="stroke-[3]" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save size={11} className="stroke-[2.5]" />
                <span>Save Spec</span>
              </>
            )}
          </button>

          {!isEmbedded && (
            <>
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                title="Collapse"
              >
                <Minimize2 size={12} />
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                  title="Close"
                >
                  <X size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Profile Selector */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
        <span className="text-[10px] text-amber-400 font-bold whitespace-nowrap">Spec Profile:</span>
        <select
          value={activeProfile.id}
          onChange={(e) => handleProfileSelect(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-700 text-amber-300 font-bold text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-400 cursor-pointer"
        >
          {Object.values(safeProfiles).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (Ø {p.diameter}" · {p.volts?.min || 18}–{p.volts?.max || 28}V · {p.wfs?.min || 150}–{p.wfs?.max || 450} IPM)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleResetToDefault}
          className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
          title="Reset to factory spec sheet"
        >
          <RotateCcw size={10} />
          <span>Reset</span>
        </button>
      </div>

      {/* GATE 1 & GATE 2 REAL-TIME STATUS HUD BANNER */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
          stability.isStable
            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
            : stability.arcStatus === 'failed_exceeds_max' || stability.arcStatus === 'failed'
            ? 'bg-rose-950/60 border-rose-500/70 text-rose-200 shadow-rose-950/50 ring-1 ring-rose-500/30'
            : stability.arcStatus === 'failed_below_min'
            ? 'bg-sky-950/60 border-sky-500/70 text-sky-200 shadow-sky-950/50 ring-1 ring-sky-500/30'
            : stability.arcStatus === 'too_cold_stubbing'
            ? 'bg-sky-950/40 border-sky-500/50 text-sky-200'
            : 'bg-orange-950/40 border-orange-500/50 text-orange-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stability.isStable ? (
              <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
            ) : stability.arcStatus === 'failed_exceeds_max' ? (
              <AlertTriangle size={16} className="text-rose-400 animate-bounce shrink-0" />
            ) : stability.arcStatus === 'failed_below_min' ? (
              <AlertTriangle size={16} className="text-sky-400 animate-bounce shrink-0" />
            ) : stability.arcStatus === 'too_cold_stubbing' ? (
              <Snowflake size={16} className="text-sky-400 animate-pulse shrink-0" />
            ) : stability.arcStatus === 'too_hot_globular' ? (
              <Flame size={16} className="text-orange-400 animate-pulse shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            )}
            <span className="font-bold text-xs">{stability.statusMessage}</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 shrink-0">
            Expected: <strong className="text-yellow-300">{stability.expectedVolt.toFixed(1)}V</strong> @ {currentWFS} IPM
          </span>
        </div>

        {/* Gate 2 Bead Geometry Summary */}
        <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-300 font-mono pt-1 border-t border-white/10">
          <div className="flex items-center gap-2">
            <span>Deposit Vol: <strong className="text-cyan-300">{(geometry.depositRateRatio * 100).toFixed(0)}%</strong></span>
            <span>·</span>
            <span>Speed Factor: <strong className="text-emerald-300">{geometry.speedRatio.toFixed(2)}x</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Live Bead:</span>
            {geometry.width > 0 ? (
              <>
                <span className="text-yellow-300 font-bold">{geometry.width.toFixed(2)}mm W</span>
                <span>×</span>
                <span className="text-cyan-300 font-bold">{geometry.height.toFixed(2)}mm H</span>
                <span className="text-slate-400">(Base: {baseGeometry.width.toFixed(1)}×{baseGeometry.height.toFixed(1)}mm)</span>
              </>
            ) : (
              <span className="text-rose-400 font-bold animate-pulse">0.00mm (No Deposition / Arc Failed)</span>
            )}
          </div>
        </div>
      </div>

      {/* VISUALIZATION TABS (Stability Envelope vs Geometry) */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveChartTab('stability')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeChartTab === 'stability'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Activity size={11} />
            <span>Gate 1: Arc Stability Envelope (Volts vs. WFS)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveChartTab('geometry')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeChartTab === 'geometry'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Sliders size={11} />
            <span>Gate 2: Bead Geometry (Width vs. Speed)</span>
          </button>
        </div>
      </div>

      {/* SVG GRAPH CONTAINER */}
      <div className="relative w-full h-[150px] bg-slate-950 rounded-xl border border-slate-700/90 overflow-hidden shadow-inner">
        {activeChartTab === 'stability' ? (
          /* CHART 1: VOLTS VS WFS STABILITY ENVELOPE (STRICTLY CAPPED AT WFS BOUNDS) */
          <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="synergisticBandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
              </linearGradient>
              <pattern id="outOfBoundsHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.2" />
              </pattern>
            </defs>

            {/* Out-of-Bounds Physical Limit Zones */}
            {wfsMinX > 0 && (
              <rect x="0" y="0" width={wfsMinX} height="200" fill="url(#outOfBoundsHatch)" />
            )}
            {wfsMaxX < 400 && (
              <rect x={wfsMaxX} y="0" width={400 - wfsMaxX} height="200" fill="url(#outOfBoundsHatch)" />
            )}

            {/* Grid Lines */}
            <line x1="0" y1="50" x2="400" y2="50" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1="0" y1="100" x2="400" y2="100" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1="0" y1="150" x2="400" y2="150" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />

            <line x1={mapWfsToX(200)} y1="0" x2={mapWfsToX(200)} y2="200" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1={mapWfsToX(300)} y1="0" x2={mapWfsToX(300)} y2="200" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1={mapWfsToX(400)} y1="0" x2={mapWfsToX(400)} y2="200" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1={mapWfsToX(500)} y1="0" x2={mapWfsToX(500)} y2="200" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />

            {/* Hard Boundary Physical Limit Lines (Min WFS & Max WFS) */}
            <line
              x1={wfsMinX}
              y1="0"
              x2={wfsMinX}
              y2="200"
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeOpacity="0.8"
            />
            <line
              x1={wfsMaxX}
              y1="0"
              x2={wfsMaxX}
              y2="200"
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeOpacity="0.8"
            />

            {/* Synergistic Stability Band - STRICTLY CAPPED between wfsMinX and wfsMaxX */}
            <path
              d={stabilityBandPolygon}
              fill="url(#synergisticBandGrad)"
              stroke="#22c55e"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />

            {/* Central Ideal Synergistic Trajectory */}
            <path d={idealSynergisticLine} fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" />

            {/* Manufacturer Spec Anchor Points (Min, Opt, Max) */}
            <circle cx={wfsMinX} cy={voltMinAtMinWfsY} r="4" fill="#eab308" stroke="#0f172a" strokeWidth="1.5" />
            <circle cx={wfsOptX} cy={voltOptAtOptWfsY} r="5" fill="#22c55e" stroke="#ffffff" strokeWidth="1.5" />
            <circle cx={wfsMaxX} cy={voltMaxAtMaxWfsY} r="4" fill="#eab308" stroke="#0f172a" strokeWidth="1.5" />

            {/* Zone Labels */}
            <text x="25" y="30" fill="#f87171" fontSize="8" fontFamily="monospace" className="font-bold opacity-70">
              ▲ TOO HOT / GLOBULAR SPATTER (&gt;+2V)
            </text>
            <text x="25" y="174" fill="#38bdf8" fontSize="8" fontFamily="monospace" className="font-bold opacity-70">
              ▼ TOO COLD / WIRE STUBBING (&lt;-2V)
            </text>

            {/* Hard Out-of-Bounds Indicators */}
            <text x={Math.max(22, wfsMinX - 4)} y="15" textAnchor="end" fill="#f87171" fontSize="8" fontFamily="monospace" className="font-bold">
              ◄ OUT OF BOUNDS (&lt;{activeProfile.wfs.min} IPM)
            </text>
            <text x={Math.min(378, wfsMaxX + 4)} y="15" textAnchor="start" fill="#f87171" fontSize="8" fontFamily="monospace" className="font-bold">
              OUT OF BOUNDS (&gt;{activeProfile.wfs.max} IPM) ►
            </text>

            {/* Current Operating Dot */}
            <circle
              cx={mapWfsToX(currentWFS)}
              cy={mapVoltToY(currentVolt)}
              r="7"
              fill={
                stability.isStable
                  ? '#22c55e'
                  : stability.arcStatus === 'failed_exceeds_max' || stability.arcStatus === 'failed'
                  ? '#ef4444'
                  : stability.arcStatus === 'failed_below_min'
                  ? '#0284c7'
                  : stability.arcStatus === 'too_cold_stubbing'
                  ? '#0ea5e9'
                  : '#f97316'
              }
              stroke="#ffffff"
              strokeWidth="2"
              className="animate-pulse"
            />

            {/* Operating Dot Annotation */}
            <text
              x={Math.min(270, Math.max(30, mapWfsToX(currentWFS) + 10))}
              y={Math.max(24, Math.min(170, mapVoltToY(currentVolt) - 8))}
              fill="#ffffff"
              fontSize="10"
              fontFamily="monospace"
              className="font-bold shadow-sm"
            >
              {currentWFS} IPM @ {currentVolt.toFixed(1)}V
            </text>
          </svg>
        ) : (
          /* CHART 2: BEAD GEOMETRY VS TRAVEL SPEED */
          <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="w-full h-full">
            {/* Grid */}
            <line x1="0" y1="50" x2="400" y2="50" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1="0" y1="100" x2="400" y2="100" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1="0" y1="150" x2="400" y2="150" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />

            <line x1={mapSpeedX(50)} y1="0" x2={mapSpeedX(50)} y2="200" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1={mapSpeedX(100)} y1="0" x2={mapSpeedX(100)} y2="200" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
            <line x1={mapSpeedX(150)} y1="0" x2={mapSpeedX(150)} y2="200" stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />

            {/* Target Curve */}
            <path d={targetWidthPath} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="4 2" />

            {/* Active Deposited Geometry Curve */}
            <path d={geomWidthPath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />

            {/* Current Point */}
            <circle
              cx={mapSpeedX(currentSpeed)}
              cy={mapBeadWidthY(geometry.width)}
              r="6.5"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="2"
              className="animate-pulse"
            />

            <text
              x={Math.min(270, Math.max(30, mapSpeedX(currentSpeed) + 10))}
              y={Math.max(24, Math.min(170, mapBeadWidthY(geometry.width) - 8))}
              fill="#38bdf8"
              fontSize="10"
              fontFamily="monospace"
              className="font-bold"
            >
              {currentSpeed} cm/min ({geometry.width.toFixed(1)}mm W)
            </text>
          </svg>
        )}

        {/* Graph Bottom Labels */}
        <span className="absolute bottom-1 right-2 text-[9px] text-slate-400 font-mono">
          {activeChartTab === 'stability' ? 'Wire Feed Speed (100–600 IPM) →' : 'Travel Speed (0–200 cm/min) →'}
        </span>
        <span className="absolute top-1 left-2 text-[9px] text-slate-400 font-mono">
          {activeChartTab === 'stability' ? '↑ Arc Voltage (14–34 Volts)' : '↑ Bead Width (0–22 mm)'}
        </span>
      </div>

      {/* MANUFACTURER SPEC SHEET INPUT FIELDS (MIN / OPT / MAX) */}
      <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
            <Sparkles size={11} className="text-amber-400" />
            <span>Manufacturer Spec Sheet Envelope</span>
          </div>
          <span className="text-[9px] text-slate-400 font-mono">Two-Gate Synergistic Calibration</span>
        </div>

        {/* WFS Spec Row */}
        <div className="grid grid-cols-4 gap-1.5 items-center text-xs">
          <span className="text-cyan-300 font-bold text-[11px]">WFS Spec (IPM):</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-slate-400">Min</span>
            <input
              type="number"
              value={activeProfile.wfs.min}
              onChange={(e) => handleSpecChange('wfs', 'min', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-cyan-300 font-bold text-center text-xs focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-emerald-400 font-bold">Optimal</span>
            <input
              type="number"
              value={activeProfile.wfs.opt}
              onChange={(e) => handleSpecChange('wfs', 'opt', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-emerald-500/60 text-emerald-300 font-bold text-center text-xs focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-slate-400">Max</span>
            <input
              type="number"
              value={activeProfile.wfs.max}
              onChange={(e) => handleSpecChange('wfs', 'max', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-cyan-300 font-bold text-center text-xs focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Voltage Spec Row */}
        <div className="grid grid-cols-4 gap-1.5 items-center text-xs">
          <span className="text-yellow-300 font-bold text-[11px]">Volts Spec (V):</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-slate-400">Min</span>
            <input
              type="number"
              step="0.5"
              value={activeProfile.volts.min}
              onChange={(e) => handleSpecChange('volts', 'min', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-yellow-300 font-bold text-center text-xs focus:outline-none focus:border-yellow-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-emerald-400 font-bold">Optimal</span>
            <input
              type="number"
              step="0.5"
              value={activeProfile.volts.opt}
              onChange={(e) => handleSpecChange('volts', 'opt', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-emerald-500/60 text-emerald-300 font-bold text-center text-xs focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-slate-400">Max</span>
            <input
              type="number"
              step="0.5"
              value={activeProfile.volts.max}
              onChange={(e) => handleSpecChange('volts', 'max', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-yellow-300 font-bold text-center text-xs focus:outline-none focus:border-yellow-400"
            />
          </div>
        </div>

        {/* Baseline Geometry Dimensions */}
        <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-[10px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-400">Diameter (in):</span>
            <input
              type="number"
              step="0.005"
              value={activeProfile.diameter}
              onChange={(e) => handleFieldChange('diameter', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-slate-200 font-bold text-center focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-400">Base Speed:</span>
            <input
              type="number"
              value={activeProfile.baseSpeed}
              onChange={(e) => handleFieldChange('baseSpeed', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-slate-200 font-bold text-center focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-400">Target W (mm):</span>
            <input
              type="number"
              step="0.1"
              value={activeProfile.targetWidth}
              onChange={(e) => handleFieldChange('targetWidth', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-yellow-300 font-bold text-center focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-400">Target H (mm):</span>
            <input
              type="number"
              step="0.1"
              value={activeProfile.targetHeight}
              onChange={(e) => handleFieldChange('targetHeight', parseFloat(e.target.value))}
              className="bg-slate-900 px-2 py-1 rounded border border-slate-700 text-cyan-300 font-bold text-center focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
