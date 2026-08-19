import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Palette,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Layers,
  Trash2,
  Eye,
  Check,
  Flame,
  Clock,
  Zap,
  Target,
  Activity,
  Save,
  RefreshCw,
  Compass,
  X,
} from 'lucide-react';
import { RoboDKWeldSettings } from './weldManagerTypes';
import WeldDial from './WeldDial';
import WeldCalibrationTool from './WeldCalibrationTool';
import { useDebugSettings } from '../../hooks/useDebugSettings';
import { WireProfile } from './weldProfiles';

interface WeldDebugToolProps {
  settings: RoboDKWeldSettings;
  onUpdateSettings: (newSettings: RoboDKWeldSettings) => void;
  beadCount: number;
  onClearBeads?: () => void;
  onReWeld?: () => void;
  currentVolt?: number;
  currentWFS?: number;
  currentSpeed?: number;
  activeProfile?: WireProfile;
  profiles?: Record<string, WireProfile>;
  onSelectProfile?: (id: string) => void;
  onUpdateProfile?: (profile: WireProfile) => void;
  isEmbedded?: boolean;
  onClose?: () => void;
}

const HIGH_CONTRAST_COLORS = [
  { hex: '#eab308', name: 'Gold Brass', ring: 'ring-yellow-400', desc: 'High-contrast golden alloy' },
  { hex: '#06b6d4', name: 'Electric Cyan', ring: 'ring-cyan-400', desc: 'Arc-plasma high visibility' },
  { hex: '#3b82f6', name: 'Sapphire Blue', ring: 'ring-blue-400', desc: 'Titanium / TIG temper blue' },
  { hex: '#a855f7', name: 'Stainless Violet', ring: 'ring-purple-400', desc: 'Aerospace heat-tint purple' },
  { hex: '#22c55e', name: 'Laser Emerald', ring: 'ring-green-400', desc: 'Vibrant neon green' },
  { hex: '#ef4444', name: 'Molten Copper', ring: 'ring-red-400', desc: 'Glowing copper-red' },
  { hex: '#f8fafc', name: 'Chrome Silver', ring: 'ring-slate-100', desc: 'Polished mirror chrome' },
  { hex: '#facc15', name: 'Caution Yellow', ring: 'ring-yellow-300', desc: 'Maximum contrast vs dark plate' },
];

export function WeldDebugTool({
  settings,
  onUpdateSettings,
  beadCount,
  onClearBeads,
  onReWeld,
  currentVolt = 24.5,
  currentWFS = 320,
  currentSpeed = 25,
  activeProfile,
  profiles,
  onSelectProfile,
  onUpdateProfile,
  isEmbedded = false,
  onClose,
}: WeldDebugToolProps) {
  const { saveAllSettings, loadAllSettings, clearAllSettings } = useDebugSettings();

  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'scale' | 'color' | 'thermal' | 'calib' | 'style' | 'splat' | 'layout'>('thermal');
  const [windowWidth, setWindowWidth] = useState<number>(360); // 270 to 480 px
  const [windowOpacity, setWindowOpacity] = useState<number>(95);
  const [useDialMode, setUseDialMode] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  // Hydrate State on Load from localStorage
  useEffect(() => {
    const saved = loadAllSettings();
    if (saved) {
      if (typeof saved.debugWindowWidth === 'number') {
        setWindowWidth(saved.debugWindowWidth);
      }
      if (typeof saved.debugWindowOpacity === 'number') {
        setWindowOpacity(saved.debugWindowOpacity);
      }
      if (saved.activeTab) {
        setActiveTab(saved.activeTab as any);
      }
      if (typeof saved.useDialMode === 'boolean') {
        setUseDialMode(saved.useDialMode);
      }
      if (typeof saved.isOpen === 'boolean') {
        setIsOpen(saved.isOpen);
      }
      if (saved.activeProfileId && onSelectProfile) {
        onSelectProfile(saved.activeProfileId);
      }
      if (
        saved.customProfiles &&
        typeof saved.customProfiles === 'object' &&
        !Array.isArray(saved.customProfiles) &&
        onUpdateProfile
      ) {
        Object.values(saved.customProfiles).forEach((p: any) => {
          if (p && typeof p === 'object') {
            onUpdateProfile(p);
          }
        });
      }
      if (typeof saved.coolingDurationSec === 'number') {
        const dur = Math.max(0.2, saved.coolingDurationSec);
        onUpdateSettings({
          ...settings,
          cooling_duration_sec: dur,
          cooling_rate: Number((1.0 / dur).toFixed(4)),
        });
      }
    }
  }, []);

  const handleSaveAll = () => {
    const currentState = {
      debugWindowWidth: windowWidth,
      debugWindowOpacity: windowOpacity,
      activeTab,
      useDialMode,
      isOpen,
      coolingDurationSec: settings.cooling_duration_sec,
      scaleMultiplier: settings.scale_multiplier,
      heightMultiplier: settings.height_multiplier,
      widthMultiplier: settings.width_multiplier,
      colorMode: settings.color_mode,
      colorHex: settings.color_hex,
      activeProfileId: activeProfile?.id,
      customProfiles: profiles,
      settings: settings,
    };

    saveAllSettings(currentState);
    setSaveStatus('saved');
    setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);
  };

  const handleResetAll = () => {
    const confirmReset = window.confirm(
      'Are you sure you want to clear all saved debug settings? The page will refresh to restore factory defaults.'
    );
    if (confirmReset) {
      clearAllSettings();
      setResetNotice('Settings cleared! Refreshing...');
      setTimeout(() => {
        window.location.reload();
      }, 600);
    }
  };

  const updateParam = <K extends keyof RoboDKWeldSettings>(
    key: K,
    value: RoboDKWeldSettings[K]
  ) => {
    onUpdateSettings({
      ...settings,
      [key]: value,
    });
  };

  const setCoolingDuration = (durationSec: number) => {
    const dur = Math.max(0.2, durationSec);
    onUpdateSettings({
      ...settings,
      cooling_duration_sec: dur,
      cooling_rate: Number((1.0 / dur).toFixed(4)),
    });
  };

  const scaleMultiplier = settings.scale_multiplier || 2.8;
  const heightMultiplier = settings.height_multiplier || 2.0;
  const widthMultiplier = settings.width_multiplier || 1.8;
  const currentColor = settings.color_hex || '#eab308';
  const colorMode = settings.color_mode || 'THERMAL_COOLING';
  const coolingDuration = settings.cooling_duration_sec ?? 3.5;
  const coolingRate = settings.cooling_rate ?? 0.285;
  const splatterArea = settings.splatter_area_mm ?? 60.0;
  const splatterDropCount = settings.splatter_count ?? 7;
  const splatterDensity = settings.splatter_density ?? 0.85;
  const splatterSize = settings.splatter_size_mm ?? 9.0;
  const splatterVariance = settings.splatter_size_variance ?? 0.6;

  if (!isOpen && !isEmbedded) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/95 hover:bg-slate-850 border border-amber-500/60 text-amber-300 hover:text-white shadow-2xl backdrop-blur-md font-mono text-xs font-bold transition-all cursor-pointer group"
        title="Open Bead Sizing & Color Debug Tool"
      >
        <Sliders size={14} className="text-amber-400 group-hover:rotate-45 transition-transform" />
        <span>Bead Tuning ({windowWidth}px)</span>
        <span
          className="w-3.5 h-3.5 rounded-full border border-white/40 inline-block shadow-sm"
          style={{ backgroundColor: currentColor }}
        />
        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">
          {scaleMultiplier.toFixed(1)}x
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        width: isEmbedded ? '100%' : `${windowWidth}px`,
        opacity: isEmbedded ? 1 : windowOpacity / 100,
      }}
      className={`${
        isEmbedded
          ? 'w-full bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2'
          : 'bg-slate-950/95 backdrop-blur-md border border-amber-500/50 rounded-2xl shadow-2xl overflow-hidden'
      } font-mono text-xs z-30 flex flex-col transition-all`}
    >
      {/* Top Bar for Floating Mode */}
      {!isEmbedded && (
        <div className="p-2.5 bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-950 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm">
              <Sliders size={13} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-xs leading-tight">
                  Bead Sizing &amp; Color
                </span>
                <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[9px]">
                  {windowWidth}px
                </span>
              </div>
              <span className="text-[9px] text-amber-300/80">
                Live Real-Time Tuning
              </span>
            </div>
          </div>

          {/* Quick Size Controls & Minimize in Header */}
          <div className="flex items-center gap-1">
            <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-800 text-[10px]">
              <button
                onClick={() => setWindowWidth(270)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  windowWidth <= 280 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="Compact (270px)"
              >
                S
              </button>
              <button
                onClick={() => setWindowWidth(330)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  windowWidth > 280 && windowWidth <= 350 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="Standard (330px)"
              >
                M
              </button>
              <button
                onClick={() => setWindowWidth(410)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  windowWidth > 350 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
                title="Wide (410px)"
              >
                L
              </button>
            </div>

            <button
              onClick={() => {
                if (onClose) onClose();
                else setIsOpen(false);
              }}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title="Close Debug Tool"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Embedded Header with Close Button */}
      {isEmbedded && (
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
          <div className="flex items-center gap-1.5">
            <Sliders size={13} className="text-amber-400" />
            <span className="font-bold text-slate-200 text-xs">Developer Debug &amp; Physics Studio</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title="Close Debug Panel"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Toolbar: Sub-tabs and Persistence (Save / Reset) */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800/80 pb-1.5">
        {/* Subtabs */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setActiveTab('thermal')}
            className={`py-1 px-2 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'thermal'
                ? 'bg-gradient-to-r from-orange-500/30 to-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
            title="Thermal Cooling Transition Speed"
          >
            <Flame size={11} className={activeTab === 'thermal' ? 'text-orange-400 animate-pulse' : 'text-slate-400'} />
            <span>Cool</span>
          </button>

          <button
            onClick={() => setActiveTab('calib')}
            className={`py-1 px-2 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'calib'
                ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-emerald-300 border border-emerald-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
            title="Calibration Graph & Tolerance Band"
          >
            <Target size={11} className={activeTab === 'calib' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'} />
            <span>Calib</span>
          </button>

          <button
            onClick={() => setActiveTab('scale')}
            className={`py-1 px-2 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'scale'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Sliders size={11} />
            <span>Scale</span>
          </button>

          <button
            onClick={() => setActiveTab('color')}
            className={`py-1 px-2 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'color'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full border border-white/60 inline-block shadow-sm"
              style={{ backgroundColor: currentColor }}
            />
            <span>Color</span>
          </button>

          <button
            onClick={() => setActiveTab('style')}
            className={`py-1 px-2 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'style'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Layers size={11} />
            <span>Style</span>
          </button>

          <button
            onClick={() => setActiveTab('splat')}
            className={`py-1 px-2 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'splat'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
            title="Splatter scatter area, count, density and droplet size"
          >
            <Zap size={11} />
            <span>Splat</span>
          </button>

          {!isEmbedded && (
            <button
              onClick={() => setActiveTab('layout')}
              className={`py-1 px-2 rounded-lg font-bold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'layout'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Maximize2 size={11} />
              <span>Size</span>
            </button>
          )}
        </div>

        {/* Persistence Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSaveAll}
            className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-sm ${
              saveStatus === 'saved'
                ? 'bg-emerald-500 text-slate-950 ring-1 ring-emerald-400 shadow-emerald-500/30'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 hover:shadow-amber-500/20 active:scale-95'
            }`}
            title="Save debug and physics tuning to localStorage"
          >
            {saveStatus === 'saved' ? (
              <>
                <Check size={11} className="stroke-[3]" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save size={11} className="stroke-[2.5]" />
                <span>Save</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleResetAll}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-950 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-[10px] font-semibold transition-all cursor-pointer"
            title="Reset defaults"
          >
            <Trash2 size={10} />
            <span>Reset</span>
          </button>

          {resetNotice && (
            <span className="text-[9px] text-rose-400 font-bold animate-pulse">
              {resetNotice}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3.5 space-y-3.5 max-h-[380px] overflow-y-auto custom-scrollbar">
        {/* THERMAL COOLING TAB */}
        {activeTab === 'thermal' && (
          <div className="space-y-3">
            {/* Header with Dial / Slider Control Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                <Flame size={13} className="text-orange-500" />
                <span className="text-xs">Thermal Cooling Transition</span>
              </div>
              <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setUseDialMode(true)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    useDialMode
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🎛️ Dial
                </button>
                <button
                  type="button"
                  onClick={() => setUseDialMode(false)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    !useDialMode
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🎚️ Slider
                </button>
              </div>
            </div>

            {/* Dial Mode */}
            {useDialMode ? (
              <div className="p-3 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 flex flex-col items-center justify-center gap-2 shadow-inner">
                <WeldDial
                  label="Cooldown Time"
                  min={0.2}
                  max={15.0}
                  step={0.1}
                  value={coolingDuration}
                  onChange={(val) => setCoolingDuration(val)}
                  unit="Seconds"
                  size="standard"
                />
                <div className="flex items-center justify-between w-full px-2 text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/80">
                  <span>Fast: 0.2s</span>
                  <span className="text-amber-300 font-bold">
                    Decay: {(1.0 / Math.max(0.1, coolingDuration)).toFixed(2)}/sec
                  </span>
                  <span>Slow: 15.0s</span>
                </div>
              </div>
            ) : (
              /* Slider Mode */
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold text-xs">Transition Duration:</span>
                  <span className="px-2.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold text-xs border border-orange-500/40 font-mono">
                    {coolingDuration.toFixed(1)}s · {(1.0 / Math.max(0.1, coolingDuration)).toFixed(2)}/s
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={15.0}
                  step={0.1}
                  value={coolingDuration}
                  onChange={(e) => setCoolingDuration(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>⚡ 0.2s (Instant Freeze)</span>
                  <span>🌋 15.0s (Molten Soak)</span>
                </div>
              </div>
            )}

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
                Cooling Presets:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: '⚡ Flash', time: 0.6, desc: '0.6s rapid freeze' },
                  { label: '💨 Fast', time: 1.5, desc: '1.5s quick cooling' },
                  { label: '⏱️ Standard', time: 3.5, desc: '3.5s realistic curve' },
                  { label: '🔥 Molten', time: 6.5, desc: '6.5s long heat soak' },
                  { label: '🌋 Volcanic', time: 12.0, desc: '12.0s slow fade' },
                  { label: '❄️ Freeze', time: 99.0, desc: 'Frozen white hot' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      if (preset.time >= 90) {
                        onUpdateSettings({
                          ...settings,
                          cooling_duration_sec: 999,
                          cooling_rate: 0.0,
                        });
                      } else {
                        setCoolingDuration(preset.time);
                      }
                    }}
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer flex flex-col items-center ${
                      (preset.time >= 90 && coolingRate === 0) ||
                      (preset.time < 90 && Math.abs(coolingDuration - preset.time) < 0.2)
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 border-amber-300 font-extrabold shadow-md'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title={preset.desc}
                  >
                    <span>{preset.label}</span>
                    <span className="text-[9px] opacity-75 font-normal">
                      {preset.time >= 90 ? 'Hold Hot' : `${preset.time}s`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pyrometric Color Heat Map Gradient Preview */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400 font-bold">Thermal Decay Spectrum:</span>
                <span className="text-amber-400 font-mono">100% ➔ 0% Heat</span>
              </div>
              <div
                className="w-full h-4 rounded-lg shadow-inner border border-white/20"
                style={{
                  background:
                    'linear-gradient(to right, #ffffff 0%, #ff5500 25%, #dc2626 55%, #7f1d1d 75%, #0284c7 90%, #eab308 100%)',
                }}
              />
              <div className="flex items-center justify-between text-[8px] text-slate-400 font-mono">
                <span className="text-white font-bold">⚪ Arc Hot</span>
                <span className="text-orange-400">🔥 Fiery</span>
                <span className="text-rose-400">🔴 Cherry</span>
                <span className="text-cyan-400">🟣 Temper</span>
                <span className="text-amber-300 font-bold">🟡 Cured</span>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="pt-1">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => updateParam('color_mode', 'THERMAL_COOLING')}
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-bold text-left transition-all cursor-pointer ${
                    colorMode === 'THERMAL_COOLING'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1 font-bold mb-0.5">
                    <Sparkles size={11} className="text-amber-400" />
                    <span>Thermal Active</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-normal leading-tight">
                    Cooling transition enabled
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => updateParam('color_mode', 'SOLID_CUSTOM')}
                  className={`py-1.5 px-2 rounded-xl border text-[10px] font-bold text-left transition-all cursor-pointer ${
                    colorMode === 'SOLID_CUSTOM'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1 font-bold mb-0.5">
                    <Eye size={11} className="text-cyan-400" />
                    <span>Solid Vibrant</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-normal leading-tight">
                    Bypass cooling (static color)
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CALIBRATION & DIFFICULTY TAB */}
        {activeTab === 'calib' && (
          <div className="space-y-2">
            <WeldCalibrationTool
              isEmbedded={true}
              currentVolt={currentVolt}
              currentWFS={currentWFS}
              currentSpeed={currentSpeed}
              activeProfile={activeProfile}
              profiles={profiles}
              onSelectProfile={onSelectProfile}
              onUpdateProfile={onUpdateProfile}
            />
          </div>
        )}

        {/* SCALE TAB */}
        {activeTab === 'scale' && (
          <div className="space-y-3">
            {/* Overall Scale Multiplier */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-bold">Overall Bead Scale:</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-xs border border-amber-500/40">
                  {scaleMultiplier.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={7.0}
                step={0.1}
                value={scaleMultiplier}
                onChange={(e) => updateParam('scale_multiplier', parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              {/* Quick Presets */}
              <div className="grid grid-cols-4 gap-1 pt-1">
                {[
                  { label: '1.0x', val: 1.0 },
                  { label: '2.5x', val: 2.5 },
                  { label: '4.0x', val: 4.0 },
                  { label: '6.0x', val: 6.0 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => updateParam('scale_multiplier', p.val)}
                    className={`py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                      Math.abs(scaleMultiplier - p.val) < 0.15
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Individual Style Scale Matching Section */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-200 font-bold text-[11px]">
                  <Sparkles size={12} className="text-amber-400" />
                  <span>Style Sizing &amp; Balance (1:1 Match)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const avg = Number((((settings.dimes_scale ?? 1.0) + (settings.ribbon_scale ?? 1.0)) / 2).toFixed(2));
                    onUpdateSettings({
                      ...settings,
                      dimes_scale: avg,
                      ribbon_scale: avg,
                    });
                  }}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[9px] font-bold transition-all cursor-pointer"
                  title="Equalize both styles to exact same scale"
                >
                  ⚖️ Match 1:1
                </button>
              </div>

              {/* Stacked Dimes Scale Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cyan-300 font-semibold flex items-center gap-1">
                    <span>🪙 Stacked Dimes Scale:</span>
                  </span>
                  <span className="font-bold font-mono text-cyan-300">
                    {(settings.dimes_scale ?? 1.0).toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.05}
                  value={settings.dimes_scale ?? 1.0}
                  onChange={(e) => updateParam('dimes_scale', parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                />
              </div>

              {/* Continuous Ribbon Scale Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-amber-300 font-semibold flex items-center gap-1">
                    <span>〰️ Continuous Ribbon Scale:</span>
                  </span>
                  <span className="font-bold font-mono text-amber-300">
                    {(settings.ribbon_scale ?? 1.0).toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.05}
                  value={settings.ribbon_scale ?? 1.0}
                  onChange={(e) => updateParam('ribbon_scale', parseFloat(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                />
              </div>
            </div>

            {/* Height / Crown Multiplier */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Crown Height (Y-Scale):</span>
                <span className="text-cyan-400 font-bold">{heightMultiplier.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={4.5}
                step={0.1}
                value={heightMultiplier}
                onChange={(e) => updateParam('height_multiplier', parseFloat(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Width Multiplier */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Seam Width (Z-Scale):</span>
                <span className="text-cyan-400 font-bold">{widthMultiplier.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={4.5}
                step={0.1}
                value={widthMultiplier}
                onChange={(e) => updateParam('width_multiplier', parseFloat(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Bead Rotation & Angle Calibration */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-200 font-bold text-[11px]">
                  <Compass size={12} className="text-emerald-400" />
                  <span>Bead Angle &amp; Rotation Calibration</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSettings({
                      ...settings,
                      bead_tilt_angle_deg: 15.0,
                      bead_rotation_deg: 0.0,
                      bead_pitch_deg: 0.0,
                      bead_tilt_direction: 'OVERLAP',
                    });
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[9px] flex items-center gap-1 transition-all cursor-pointer"
                  title="Reset angles to default 15° work tilt"
                >
                  <RotateCcw size={9} />
                  <span>Reset Angles</span>
                </button>
              </div>

              {/* Work Angle / Tilt Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-emerald-300 font-semibold">
                    📐 Work Tilt Angle:
                  </span>
                  <span className="font-bold font-mono text-emerald-300">
                    {(settings.bead_tilt_angle_deg ?? 15.0).toFixed(1)}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={1}
                  value={settings.bead_tilt_angle_deg ?? 15.0}
                  onChange={(e) => updateParam('bead_tilt_angle_deg', parseFloat(e.target.value))}
                  className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                />
                <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                  <span>0° Flat</span>
                  <span>45° Fillet</span>
                  <span>90° Vertical</span>
                </div>
              </div>

              {/* Seam Axial Rotation Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-amber-300 font-semibold">
                    🔄 Seam Axial Rotation:
                  </span>
                  <span className="font-bold font-mono text-amber-300">
                    {(settings.bead_rotation_deg ?? 0.0).toFixed(1)}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={2}
                  value={settings.bead_rotation_deg ?? 0.0}
                  onChange={(e) => updateParam('bead_rotation_deg', parseFloat(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                />
                <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                  <span>-180° Left</span>
                  <span>0° Neutral</span>
                  <span>+180° Right</span>
                </div>
              </div>

              {/* Travel Angle / Pitch Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cyan-300 font-semibold">
                    🏹 Travel Push / Pull Pitch:
                  </span>
                  <span className="font-bold font-mono text-cyan-300">
                    {(settings.bead_pitch_deg ?? 0.0).toFixed(1)}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={1}
                  value={settings.bead_pitch_deg ?? 0.0}
                  onChange={(e) => updateParam('bead_pitch_deg', parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                />
                <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                  <span>-45° Push</span>
                  <span>0° Neutral</span>
                  <span>+45° Drag/Pull</span>
                </div>
              </div>

              {/* Tilt Direction Preset Selector */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold block">Tilt Direction:</span>
                <div className="grid grid-cols-3 gap-1 text-[9px]">
                  {(['OVERLAP', 'OPPOSITE', '+Y', '-Y', '+X', '-X'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => updateParam('bead_tilt_direction', dir)}
                      className={`py-1 px-1.5 rounded font-mono font-bold border transition-all cursor-pointer text-center ${
                        settings.bead_tilt_direction === dir
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-slate-400">
              💡 <em>Changes apply instantly in 3D to all deposited and future weld beads.</em>
            </div>
          </div>
        )}

        {/* COLOR TAB */}
        {activeTab === 'color' && (
          <div className="space-y-3">
            <div>
              <label className="text-slate-300 font-bold block mb-1.5">
                High-Contrast Weld Bead Color:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {HIGH_CONTRAST_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => updateParam('color_hex', c.hex)}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all cursor-pointer ${
                      currentColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'bg-slate-800 border-white ring-2 ring-amber-400/80 shadow-md scale-105'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                    title={c.desc}
                  >
                    <div
                      className="w-6 h-6 rounded-full border border-white/40 shadow-inner flex items-center justify-center"
                      style={{ backgroundColor: c.hex }}
                    >
                      {currentColor.toLowerCase() === c.hex.toLowerCase() && (
                        <Check size={12} className="text-slate-950 font-bold" />
                      )}
                    </div>
                    <span className="text-[9px] text-slate-300 text-center truncate w-full">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Hex Color Picker */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 text-[11px] font-bold">Custom Hex Color:</span>
                <span className="font-mono text-amber-300 font-bold text-xs">{currentColor}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => updateParam('color_hex', e.target.value)}
                  className="w-10 h-8 rounded border border-slate-700 bg-slate-950 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={currentColor}
                  onChange={(e) => updateParam('color_hex', e.target.value)}
                  className="flex-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs uppercase"
                  placeholder="#EAB308"
                />
              </div>
            </div>

            {/* Color Mode Toggle */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-bold block text-[11px]">
                Cooling &amp; Finish Mode:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => updateParam('color_mode', 'THERMAL_COOLING')}
                  className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold text-left transition-all cursor-pointer ${
                    colorMode === 'THERMAL_COOLING'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1 font-bold mb-0.5">
                    <Sparkles size={11} className="text-amber-400" />
                    <span>Thermal Cooling</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-normal leading-tight">
                    White-hot arc cools to custom color
                  </span>
                </button>

                <button
                  onClick={() => updateParam('color_mode', 'SOLID_CUSTOM')}
                  className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold text-left transition-all cursor-pointer ${
                    colorMode === 'SOLID_CUSTOM'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1 font-bold mb-0.5">
                    <Eye size={11} className="text-cyan-400" />
                    <span>Solid Vibrant</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-normal leading-tight">
                    Always solid custom color vs dark metal
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'style' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateParam('bead_style', 'STACKED_DIMES')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                  settings.bead_style === 'STACKED_DIMES'
                    ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles size={13} className={settings.bead_style === 'STACKED_DIMES' ? 'text-cyan-400' : ''} />
                <span>Stacked Dimes</span>
              </button>

              <button
                type="button"
                onClick={() => updateParam('bead_style', 'RIBBON')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                  settings.bead_style === 'RIBBON'
                    ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers size={13} className={settings.bead_style === 'RIBBON' ? 'text-amber-400' : ''} />
                <span>Ribbon Bead</span>
              </button>
            </div>

            {settings.bead_style === 'STACKED_DIMES' ? (
              <div className="space-y-2.5">
                {/* Dime Scale Dial */}
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-cyan-300 font-semibold">🪙 Stacked Dimes Sizing Scale:</span>
                    <span className="font-bold font-mono text-cyan-400">{(settings.dimes_scale ?? 1.0).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={2.5}
                    step={0.05}
                    value={settings.dimes_scale ?? 1.0}
                    onChange={(e) => updateParam('dimes_scale', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                  />
                </div>

                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300">Dime Stacking Overlap:</span>
                  <span className="font-bold text-cyan-400">{settings.dime_overlap_pct}%</span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={85}
                  step={1}
                  value={settings.dime_overlap_pct}
                  onChange={(e) => updateParam('dime_overlap_pct', parseInt(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Ribbon Scale Dial */}
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-amber-300 font-semibold">〰️ Continuous Ribbon Sizing Scale:</span>
                    <span className="font-bold font-mono text-amber-400">{(settings.ribbon_scale ?? 1.0).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={2.5}
                    step={0.05}
                    value={settings.ribbon_scale ?? 1.0}
                    onChange={(e) => updateParam('ribbon_scale', parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                  />
                </div>

                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300">Ripple Oscillation Pitch:</span>
                  <span className="font-bold text-amber-400">{settings.ripple_pitch.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.2}
                  value={settings.ripple_pitch}
                  onChange={(e) => updateParam('ripple_pitch', parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            )}
          </div>
        )}

        {/* LAYOUT / SIZING TAB */}
        {/* SPLATTER SCATTER TAB */}
        {activeTab === 'splat' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-rose-300 font-bold">
              <Zap size={13} className="text-rose-400" />
              <span className="text-xs">Splatter Scatter (Too-Hot Puddle)</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              Molten droplets thrown around an over-heated weld. Scatter is randomized per
              droplet within the area below.
            </p>

            {/* Scatter Area */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Scatter Area (radius):</span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[11px] border border-rose-500/40">
                  {splatterArea.toFixed(0)} mm
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={200}
                step={1}
                value={splatterArea}
                onChange={(e) => updateParam('splatter_area_mm', parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            {/* Droplet Count */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Spheres Dropped (per bead):</span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[11px] border border-rose-500/40">
                  {splatterDropCount}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                step={1}
                value={splatterDropCount}
                onChange={(e) => updateParam('splatter_count', parseInt(e.target.value, 10))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            {/* Density */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Density (beads that splatter):</span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[11px] border border-rose-500/40">
                  {(splatterDensity * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={splatterDensity}
                onChange={(e) => updateParam('splatter_density', parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            {/* Droplet Size */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Droplet Size:</span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[11px] border border-rose-500/40">
                  {splatterSize.toFixed(1)} mm
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={splatterSize}
                onChange={(e) => updateParam('splatter_size_mm', parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            {/* Size Randomness */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Size Randomness:</span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[11px] border border-rose-500/40">
                  ±{(splatterVariance * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={splatterVariance}
                onChange={(e) => updateParam('splatter_size_variance', parseFloat(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-3 gap-1 pt-0.5">
              {[
                { label: 'Light', area: 30, count: 3, density: 0.35, size: 6 },
                { label: 'Default', area: 60, count: 7, density: 0.85, size: 9 },
                { label: 'Heavy', area: 110, count: 16, density: 1.0, size: 13 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      ...settings,
                      splatter_area_mm: p.area,
                      splatter_count: p.count,
                      splatter_density: p.density,
                      splatter_size_mm: p.size,
                    })
                  }
                  className="py-1 rounded text-[10px] font-bold border bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'layout' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-bold">Window Width:</span>
                <span className="font-mono text-emerald-400 font-bold">{windowWidth}px</span>
              </div>
              <input
                type="range"
                min={250}
                max={460}
                step={10}
                value={windowWidth}
                onChange={(e) => setWindowWidth(parseInt(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex items-center justify-between gap-1 pt-1">
                {[
                  { label: 'Compact', width: 270 },
                  { label: 'Standard', width: 330 },
                  { label: 'Wide', width: 420 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => setWindowWidth(preset.width)}
                    className={`flex-1 py-1 rounded-md text-[10px] border transition-all cursor-pointer ${
                      windowWidth === preset.width
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-bold">Panel Opacity:</span>
                <span className="font-mono text-cyan-400 font-bold">{windowOpacity}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={100}
                step={5}
                value={windowOpacity}
                onChange={(e) => setWindowOpacity(parseInt(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[10px] text-emerald-300 flex items-center justify-between">
              <span>Layout Stat: <strong>{windowWidth}px · {windowOpacity}% Opacity</strong></span>
              <span className="text-emerald-400 font-bold">Ready</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Bar with Bead Count & Actions */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          Beads in Scene: <strong className="text-amber-400 font-mono">{beadCount}</strong>
        </span>

        <div className="flex items-center gap-1.5">
          {onClearBeads && beadCount > 0 && (
            <button
              onClick={onClearBeads}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/40 transition-all cursor-pointer"
              title="Clear all deposited beads"
            >
              <Trash2 size={11} />
              <span>Clear</span>
            </button>
          )}

          {onReWeld && (
            <button
              onClick={onReWeld}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-extrabold transition-all cursor-pointer shadow-md shadow-amber-500/20"
              title="Run weld pass again"
            >
              <RotateCcw size={11} />
              <span>Re-Weld</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
