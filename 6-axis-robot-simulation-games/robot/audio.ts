// Procedural Web Audio Sound Engine for Industrial Robot Simulation

let audioCtx: AudioContext | null = null;
let isMuted = false;
let masterGain: GainNode | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setSoundMuted(muted: boolean) {
  isMuted = muted;
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(muted ? 0 : 0.3, audioCtx.currentTime);
  }
}

export function getSoundMuted(): boolean {
  return isMuted;
}

// Play pneumatic grab sound (compressed air burst + clamp clink)
export function playGrabSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  // Air hiss (filtered white noise)
  const bufferSize = ctx.sampleRate * 0.12;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800, now);
  filter.Q.setValueAtTime(3, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.4, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

  whiteNoise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);

  whiteNoise.start(now);

  // Metal clamp clink
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(820, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);

  oscGain.gain.setValueAtTime(0.25, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(oscGain);
  oscGain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.09);
}

// Play pneumatic release sound
export function playReleaseSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(540, now + 0.09);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.1);
}

// Play servo motor step hum
let lastServoTime = 0;
export function playServoJogSound(pitchMod = 1) {
  if (isMuted) return;
  const now = performance.now();
  if (now - lastServoTime < 70) return; // throttle
  lastServoTime = now;

  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220 * pitchMod, t);
  osc.frequency.exponentialRampToValueAtTime(160 * pitchMod, t + 0.06);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(600, t);

  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  osc.start(t);
  osc.stop(t + 0.07);
}

// Play success chime (major arpeggio)
export function playSuccessChime() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + i * 0.07);

    gain.gain.setValueAtTime(0, now + i * 0.07);
    gain.gain.linearRampToValueAtTime(0.18, now + i * 0.07 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.4);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now + i * 0.07);
    osc.stop(now + i * 0.07 + 0.45);
  });
}

// Play explosion / mistake buzzer
export function playErrorSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  // Low saw buzz
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.linearRampToValueAtTime(90, now + 0.25);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.26);
}

// Play spawn sound (gentle high blip)
export function playSpawnSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.09);
}

// Button UI click
export function playClickSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.035);
}

// Play heavy block collision / impact thud
export function playImpactSound(intensity = 1) {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

  const vol = Math.min(0.35, 0.18 * intensity);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.13);
}

// Play wooden / plastic tower tumble clatter
export function playTumbleSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  [0, 0.06, 0.14, 0.22].forEach((offset, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = idx % 2 === 0 ? "triangle" : "sawtooth";
    osc.frequency.setValueAtTime(280 - idx * 40, now + offset);
    osc.frequency.exponentialRampToValueAtTime(90, now + offset + 0.08);

    gain.gain.setValueAtTime(0.18, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now + offset);
    osc.stop(now + offset + 0.09);
  });
}

// Ingot drop into molten cauldron: metallic ting + molten plop sizzle
export function playIngotTossSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;

  // High metal clink
  const clink = ctx.createOscillator();
  const clinkGain = ctx.createGain();
  clink.type = "sine";
  clink.frequency.setValueAtTime(1400 + Math.random() * 400, now);
  clink.frequency.exponentialRampToValueAtTime(600, now + 0.08);
  clinkGain.gain.setValueAtTime(0.2, now);
  clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  clink.connect(clinkGain);
  clinkGain.connect(masterGain);
  clink.start(now);
  clink.stop(now + 0.09);

  // Plop into liquid
  const plop = ctx.createOscillator();
  const plopGain = ctx.createGain();
  plop.type = "triangle";
  plop.frequency.setValueAtTime(280, now + 0.03);
  plop.frequency.exponentialRampToValueAtTime(120, now + 0.14);
  plopGain.gain.setValueAtTime(0.25, now + 0.03);
  plopGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  plop.connect(plopGain);
  plopGain.connect(masterGain);
  plop.start(now + 0.03);
  plop.stop(now + 0.15);
}

// Cute lava bubble pop sound
export function playLavaBubbleSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  const startF = 350 + Math.random() * 250;
  osc.frequency.setValueAtTime(startF, now);
  osc.frequency.exponentialRampToValueAtTime(startF + 300, now + 0.04);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.085);
}

// Molten stream pouring hiss/roar
export function playMoltenPourSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;

  // Filtered roaring hiss
  const bufferSize = ctx.sampleRate * 0.4;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.linearRampToValueAtTime(1200, now + 0.2);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

  whiteNoise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);

  whiteNoise.start(now);
}

// Quench cooling steam hiss sound
export function playSteamHissSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;

  const bufferSize = ctx.sampleRate * 0.6;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(2200, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.005, now + 0.55);

  whiteNoise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);

  whiteNoise.start(now);
}

// Electric Arc Strike Snap / Ignition Sound
export function playArcStrikeSound() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;

  // Sharp high-voltage transient snap
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(2400, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);

  oscGain.gain.setValueAtTime(0.35, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.08);

  // Electrical crackle burst
  const bufferSize = ctx.sampleRate * 0.15;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = (Math.random() * 2 - 1) * (Math.random() > 0.6 ? 1 : 0.2);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(3200, now);
  filter.Q.setValueAtTime(4, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
}

// Continuous MIG/TIG Electric Arc Sizzle Sound Loop
let weldingAudioNodes: {
  noiseNode: AudioBufferSourceNode;
  humOsc: OscillatorNode;
  gainNode: GainNode;
} | null = null;

export function startWeldingSoundLoop(voltage = 19.5) {
  if (isMuted || weldingAudioNodes) return;
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;

  const loopGain = ctx.createGain();
  loopGain.gain.setValueAtTime(0.01, now);
  loopGain.gain.linearRampToValueAtTime(0.18, now + 0.05);

  // 120Hz rectified electrical arc hum
  const humOsc = ctx.createOscillator();
  humOsc.type = "sawtooth";
  const baseFreq = 110 + (voltage - 15) * 6;
  humOsc.frequency.setValueAtTime(baseFreq, now);

  const humGain = ctx.createGain();
  humGain.gain.setValueAtTime(0.08, now);

  // High-frequency sizzle noise (simulating shielding gas plasma droplets)
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (Math.random() > 0.4 ? 1 : 0.15);
  }
  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = noiseBuffer;
  noiseNode.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(2800 + (voltage - 15) * 80, now);
  bandpass.Q.setValueAtTime(2.5, now);

  humOsc.connect(humGain);
  humGain.connect(loopGain);

  noiseNode.connect(bandpass);
  bandpass.connect(loopGain);

  loopGain.connect(masterGain);

  humOsc.start(now);
  noiseNode.start(now);

  weldingAudioNodes = { noiseNode, humOsc, gainNode: loopGain };
}

export function stopWeldingSoundLoop() {
  if (!weldingAudioNodes) return;
  const ctx = getAudioContext();
  if (ctx) {
    const now = ctx.currentTime;
    weldingAudioNodes.gainNode.gain.setValueAtTime(
      weldingAudioNodes.gainNode.gain.value,
      now
    );
    weldingAudioNodes.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.06);
    setTimeout(() => {
      try {
        weldingAudioNodes?.humOsc.stop();
        weldingAudioNodes?.noiseNode.stop();
        weldingAudioNodes?.humOsc.disconnect();
        weldingAudioNodes?.noiseNode.disconnect();
        weldingAudioNodes?.gainNode.disconnect();
      } catch {
        // ignore
      }
      weldingAudioNodes = null;
    }, 70);
  } else {
    weldingAudioNodes = null;
  }
}


