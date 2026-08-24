import { useEffect, useRef } from 'react';
import { ArcStatus, TravelStatus, WeldHealth } from '../components/robot/weldProfiles';

let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Advanced Audio Feedback Hook for Real-time Welding Simulation
 * Maps physics states to granular defect acoustic profiles:
 * - 'stable_spray' / 'good_speed': Smooth high-frequency sizzling white/pink noise ("bacon frying")
 * - 'too_cold_stubbing': Erratic, rhythmic machine-gun popping/stuttering oscillator
 * - 'too_hot_globular': Aggressive, loud roaring pink noise with resonant lowpass filter (rushing air / fiery blast)
 * - 'too_fast_disconnected': Thin, scratchy, high-frequency hiss with intermittent flutter
 * - 'too_slow_glob': Deep, bass-heavy bubbling / boiling resonant sound
 */
export function useWeldAudio(
  isWelding: boolean,
  arcStatusOrHealth: ArcStatus | WeldHealth = 'stable_spray',
  travelStatus: TravelStatus = 'good_speed',
  voltage: number = 19.5
) {
  // Normalize arcStatus
  let currentArcStatus: ArcStatus = 'stable_spray';
  if (arcStatusOrHealth === 'too_cold' || arcStatusOrHealth === 'too_cold_stubbing') {
    currentArcStatus = 'too_cold_stubbing';
  } else if (arcStatusOrHealth === 'too_hot' || arcStatusOrHealth === 'too_hot_globular') {
    currentArcStatus = 'too_hot_globular';
  } else if (arcStatusOrHealth === 'perfect' || arcStatusOrHealth === 'stable_spray') {
    currentArcStatus = 'stable_spray';
  } else {
    currentArcStatus = arcStatusOrHealth as ArcStatus;
  }

  const isWeldingRef = useRef(isWelding);
  const arcStatusRef = useRef(currentArcStatus);
  const travelStatusRef = useRef(travelStatus);

  isWeldingRef.current = isWelding;
  arcStatusRef.current = currentArcStatus;
  travelStatusRef.current = travelStatus;

  const nodesRef = useRef<{
    masterGain: GainNode | null;
    noiseSource: AudioBufferSourceNode | null;

    // 1. Stable Spray Path
    sprayFilter: BiquadFilterNode | null;
    sprayGain: GainNode | null;

    // 2. Cold Stubbing Path (Machine Gun)
    coldOsc: OscillatorNode | null;
    coldGain: GainNode | null;
    coldInterval: number | null;

    // 3. Hot Globular Path (Roaring furnace / rushing air)
    hotFilter: BiquadFilterNode | null;
    hotSubOsc: OscillatorNode | null;
    hotSubGain: GainNode | null;
    hotGain: GainNode | null;

    // 4. Fast Disconnected Path (Thin scratchy high hiss)
    fastFilter: BiquadFilterNode | null;
    fastGain: GainNode | null;
    fastFlutterInterval: number | null;

    // 5. Slow Glob Path (Deep bass-heavy bubbling/boiling)
    slowOsc: OscillatorNode | null;
    slowOsc2: OscillatorNode | null;
    slowFilter: BiquadFilterNode | null;
    slowGain: GainNode | null;
    slowBubbleInterval: number | null;
  }>({
    masterGain: null,
    noiseSource: null,
    sprayFilter: null,
    sprayGain: null,
    coldOsc: null,
    coldGain: null,
    coldInterval: null,
    hotFilter: null,
    hotSubOsc: null,
    hotSubGain: null,
    hotGain: null,
    fastFilter: null,
    fastGain: null,
    fastFlutterInterval: null,
    slowOsc: null,
    slowOsc2: null,
    slowFilter: null,
    slowGain: null,
    slowBubbleInterval: null,
  });

  // Build audio graph on weld start
  useEffect(() => {
    if (!isWelding) {
      const n = nodesRef.current;
      if (n.coldInterval) {
        clearInterval(n.coldInterval);
        n.coldInterval = null;
      }
      if (n.fastFlutterInterval) {
        clearInterval(n.fastFlutterInterval);
        n.fastFlutterInterval = null;
      }
      if (n.slowBubbleInterval) {
        clearInterval(n.slowBubbleInterval);
        n.slowBubbleInterval = null;
      }
      if (n.masterGain && sharedAudioCtx) {
        const now = sharedAudioCtx.currentTime;
        n.masterGain.gain.cancelScheduledValues(now);
        n.masterGain.gain.setValueAtTime(n.masterGain.gain.value, now);
        n.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
      }
      return;
    }

    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Master Gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.38, now + 0.05);
    masterGain.connect(ctx.destination);

    // 1. Generate 3-second White / Pink noise buffer
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    const left = noiseBuffer.getChannelData(0);
    const right = noiseBuffer.getChannelData(1);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;

      left[i] = white * 0.6 + pink * 0.4;
      right[i] = (Math.random() * 2 - 1) * 0.6 + pink * 0.4;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // --- 1. STABLE SPRAY ARC: High-frequency sizzle ("bacon frying") ---
    const sprayFilter = ctx.createBiquadFilter();
    sprayFilter.type = 'bandpass';
    sprayFilter.frequency.setValueAtTime(3700 + (voltage - 18) * 110, now);
    sprayFilter.Q.setValueAtTime(2.2, now);

    const sprayGain = ctx.createGain();
    const isStableBase =
      currentArcStatus === 'stable_spray' && travelStatus === 'good_speed';
    sprayGain.gain.setValueAtTime(isStableBase ? 0.45 : 0.001, now);

    noiseSource.connect(sprayFilter);
    sprayFilter.connect(sprayGain);
    sprayGain.connect(masterGain);

    // --- 2. COLD STUBBING: Machine-gun staccato popping oscillator ---
    const coldOsc = ctx.createOscillator();
    coldOsc.type = 'sawtooth';
    coldOsc.frequency.setValueAtTime(58, now);

    const coldGain = ctx.createGain();
    coldGain.gain.setValueAtTime(currentArcStatus === 'too_cold_stubbing' ? 0.5 : 0.001, now);

    coldOsc.connect(coldGain);
    coldGain.connect(masterGain);
    coldOsc.start();

    // Rhythmic machine-gun staccato pulses (35-65ms interval)
    const coldInterval = window.setInterval(() => {
      if (!isWeldingRef.current || arcStatusRef.current !== 'too_cold_stubbing' || !sharedAudioCtx) return;
      const t = sharedAudioCtx.currentTime;
      coldOsc.frequency.setValueAtTime(50 + Math.random() * 85, t);
      coldGain.gain.setValueAtTime(0.65 + Math.random() * 0.25, t);
      coldGain.gain.exponentialRampToValueAtTime(0.08, t + 0.035);
    }, 45);

    // --- 3. HOT GLOBULAR: Aggressive loud roaring pink noise & lowpass filter (rushing air/roar) ---
    const hotFilter = ctx.createBiquadFilter();
    hotFilter.type = 'lowpass';
    hotFilter.frequency.setValueAtTime(1250, now);
    hotFilter.Q.setValueAtTime(4.8, now);

    const hotGain = ctx.createGain();
    hotGain.gain.setValueAtTime(currentArcStatus === 'too_hot_globular' ? 0.85 : 0.001, now);

    const hotSubOsc = ctx.createOscillator();
    hotSubOsc.type = 'sine';
    hotSubOsc.frequency.setValueAtTime(68, now);

    const hotSubGain = ctx.createGain();
    hotSubGain.gain.setValueAtTime(currentArcStatus === 'too_hot_globular' ? 0.35 : 0.001, now);

    hotSubOsc.connect(hotSubGain);
    hotSubGain.connect(masterGain);
    hotSubOsc.start();

    noiseSource.connect(hotFilter);
    hotFilter.connect(hotGain);
    hotGain.connect(masterGain);

    // --- 4. FAST DISCONNECTED: Thin, scratchy, high-frequency hiss with intermittent skips ---
    const fastFilter = ctx.createBiquadFilter();
    fastFilter.type = 'highpass';
    fastFilter.frequency.setValueAtTime(5800, now);
    fastFilter.Q.setValueAtTime(3.2, now);

    const fastGain = ctx.createGain();
    fastGain.gain.setValueAtTime(travelStatus === 'too_fast_disconnected' ? 0.55 : 0.001, now);

    noiseSource.connect(fastFilter);
    fastFilter.connect(fastGain);
    fastGain.connect(masterGain);

    // High frequency scratchy flutter
    const fastFlutterInterval = window.setInterval(() => {
      if (!isWeldingRef.current || travelStatusRef.current !== 'too_fast_disconnected' || !sharedAudioCtx) return;
      const t = sharedAudioCtx.currentTime;
      const scratch = Math.random() < 0.3 ? 0.05 : 0.45 + Math.random() * 0.25;
      fastGain.gain.setValueAtTime(scratch, t);
      fastFilter.frequency.setValueAtTime(5200 + Math.random() * 2400, t);
    }, 70);

    // --- 5. SLOW GLOB / BURN-THROUGH: Deep, bass-heavy bubbling/boiling sound ---
    const slowOsc = ctx.createOscillator();
    slowOsc.type = 'triangle';
    slowOsc.frequency.setValueAtTime(95, now);

    const slowOsc2 = ctx.createOscillator();
    slowOsc2.type = 'sine';
    slowOsc2.frequency.setValueAtTime(140, now);

    const slowFilter = ctx.createBiquadFilter();
    slowFilter.type = 'lowpass';
    slowFilter.frequency.setValueAtTime(320, now);
    slowFilter.Q.setValueAtTime(5.5, now);

    const slowGain = ctx.createGain();
    slowGain.gain.setValueAtTime(travelStatus === 'too_slow_glob' ? 0.65 : 0.001, now);

    slowOsc.connect(slowFilter);
    slowOsc2.connect(slowFilter);
    slowFilter.connect(slowGain);
    slowGain.connect(masterGain);
    slowOsc.start();
    slowOsc2.start();

    // Boiling / bubbling modulation interval
    const slowBubbleInterval = window.setInterval(() => {
      if (!isWeldingRef.current || travelStatusRef.current !== 'too_slow_glob' || !sharedAudioCtx) return;
      const t = sharedAudioCtx.currentTime;
      const bubbleFreq = 75 + Math.sin(t * 14) * 35 + (Math.random() - 0.5) * 20;
      slowOsc.frequency.setValueAtTime(bubbleFreq, t);
      slowOsc2.frequency.setValueAtTime(bubbleFreq * 1.5, t);
      slowFilter.frequency.setValueAtTime(260 + Math.random() * 160, t);
      slowGain.gain.setValueAtTime(0.5 + Math.random() * 0.3, t);
    }, 80);

    noiseSource.start();

    nodesRef.current = {
      masterGain,
      noiseSource,
      sprayFilter,
      sprayGain,
      coldOsc,
      coldGain,
      coldInterval,
      hotFilter,
      hotSubOsc,
      hotSubGain,
      hotGain,
      fastFilter,
      fastGain,
      fastFlutterInterval,
      slowOsc,
      slowOsc2,
      slowFilter,
      slowGain,
      slowBubbleInterval,
    };

    return () => {
      if (coldInterval) clearInterval(coldInterval);
      if (fastFlutterInterval) clearInterval(fastFlutterInterval);
      if (slowBubbleInterval) clearInterval(slowBubbleInterval);
      try {
        noiseSource.stop();
        coldOsc.stop();
        hotSubOsc.stop();
        slowOsc.stop();
        slowOsc2.stop();
        noiseSource.disconnect();
        coldOsc.disconnect();
        hotSubOsc.disconnect();
        slowOsc.disconnect();
        slowOsc2.disconnect();
        masterGain.disconnect();
      } catch {
        // Clean disconnect
      }
    };
  }, [isWelding, voltage]);

  // Live dynamic crossfade when arcStatus or travelStatus changes during active welding
  useEffect(() => {
    if (!isWelding) return;
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const n = nodesRef.current;

    const isCold = currentArcStatus === 'too_cold_stubbing';
    const isHot = currentArcStatus === 'too_hot_globular';
    const isFast = travelStatus === 'too_fast_disconnected';
    const isSlow = travelStatus === 'too_slow_glob';
    const isSpray = !isCold && !isHot && !isFast && !isSlow;

    if (n.sprayGain) {
      n.sprayGain.gain.cancelScheduledValues(now);
      n.sprayGain.gain.linearRampToValueAtTime(isSpray ? 0.45 : 0.001, now + 0.08);
    }
    if (n.coldGain) {
      n.coldGain.gain.cancelScheduledValues(now);
      n.coldGain.gain.linearRampToValueAtTime(isCold ? 0.55 : 0.001, now + 0.08);
    }
    if (n.hotGain && n.hotSubGain) {
      n.hotGain.gain.cancelScheduledValues(now);
      n.hotSubGain.gain.cancelScheduledValues(now);
      n.hotGain.gain.linearRampToValueAtTime(isHot ? 0.85 : 0.001, now + 0.08);
      n.hotSubGain.gain.linearRampToValueAtTime(isHot ? 0.35 : 0.001, now + 0.08);
    }
    if (n.fastGain) {
      n.fastGain.gain.cancelScheduledValues(now);
      n.fastGain.gain.linearRampToValueAtTime(isFast ? 0.55 : 0.001, now + 0.08);
    }
    if (n.slowGain) {
      n.slowGain.gain.cancelScheduledValues(now);
      n.slowGain.gain.linearRampToValueAtTime(isSlow ? 0.65 : 0.001, now + 0.08);
    }
  }, [currentArcStatus, travelStatus, isWelding]);
}
