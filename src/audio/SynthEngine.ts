import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const SCALES: Record<string, number[]> = {
  'Minor pentatonic': [0, 3, 5, 7, 10],
  'Major pentatonic': [0, 2, 4, 7, 9],
  'Hirajoshi': [0, 2, 3, 7, 8],
  'Kumoi': [0, 2, 3, 7, 9],
  'Whole tone': [0, 2, 4, 6, 8],
};

export function buildScale(name: string): number[] {
  const steps = SCALES[name] || SCALES['Minor pentatonic'];
  const out: number[] = [];;
  for (let oct = 0; oct < 2; oct++) {
    for (const st of steps) {
      out.push(110 * Math.pow(2, (st + 12 * oct) / 12));
    }
  }
  return out;
}

export interface AudioState {
  actx: AudioContext | null;
  master: GainNode | null;
  wetBus: GainNode | null;
  droneGain: GainNode | null;
  noiseBuf: AudioBuffer | null;
  droneOsc: OscillatorNode[] | null;
  soundOn: boolean;
  activeVoices: number;
  cursor: number;
  load: number;
  loadAt: number;
  thudAt: number;
  swooshAt: number;
  thuds: number;
  /** Name of the scale in `scale`, so the tuning panel can read its own value back. */
  scaleName: string;
  scale: number[];
  volume: number;
  lockVol: number;
  breakVol: number;
  boomVol: number;
  clickVol: number;
  drone: number;
  /** 1 = fire native haptics on sound events, 0 = silent. */
  haptics: number;
  /**
   * Requested output buffer size, in seconds; 0 leaves the choice to the browser.
   *
   * An AudioContext built with no options asks for `latencyHint: 'interactive'`,
   * the smallest buffer the device will give. On a phone WebView that buffer is
   * short enough that any frame overrunning its budget costs the audio thread a
   * deadline, which is heard as a crack — or, when several land together, as
   * crackle. Every voice here is already scheduled 10-30ms ahead, so buying
   * headroom with a little latency costs this game almost nothing.
   */
  latency: number;
}

export const AudioStore: AudioState = {
  actx: null,
  master: null,
  wetBus: null,
  droneGain: null,
  noiseBuf: null,
  droneOsc: null,
  soundOn: true,
  activeVoices: 0,
  cursor: -9,
  load: 0,
  loadAt: 0,
  thudAt: -9,
  swooshAt: -9,
  thuds: 0,
  scaleName: 'Hirajoshi',
  scale: buildScale('Hirajoshi'),
  volume: 0.9,
  lockVol: 1.2,
  breakVol: 1.0,
  boomVol: 1.3,
  clickVol: 1.1,
  drone: 1.0,
  haptics: 1,
  latency: 0.05,
};

export const MAX_VOICES = 22;
export const MAX_THUDS = 10;
export const BEAT = 5; // Hz binaural beat

export function loadAt_(now: number): number {
  return AudioStore.load * Math.pow(0.35, Math.max(0, now - AudioStore.loadAt));
}

/**
 * Minimum gap between haptic impacts, in milliseconds.
 *
 * On a phone the haptic actuator is audible through the chassis: a single
 * impact is a faint click and a rapid train of them is a buzz, both of which
 * arrive alongside the sound that triggered them and read as part of it. The
 * motor also cannot render impacts meaningfully faster than this, so anything
 * closer together is spent buzzing rather than being felt.
 */
const MIN_HAPTIC_GAP_MS = 50;
let lastHapticAt = -Infinity;

export function triggerHaptic(style: 'light' | 'medium' | 'heavy') {
  if (!AudioStore.haptics) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - lastHapticAt < MIN_HAPTIC_GAP_MS) return;
  lastHapticAt = nowMs;
  try {
    const impactStyle =
      style === 'heavy' ? ImpactStyle.Heavy : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    Haptics.impact({ style: impactStyle }).catch(() => {});
  } catch (e) {}
}

export function makeReverbIR(actx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = actx.sampleRate, len = Math.floor(rate * seconds);
  const buf = actx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const fade = i > len * 0.9 ? (len - i) / (len * 0.1) : 1.0;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * fade;
    }
  }
  return buf;
}

// --- Active node tracking for clean teardown ---
const _activeNodes = new Set<AudioNode & { stop?: () => void }>();

export function registerActiveNode(node: AudioNode & { stop?: () => void }) {
  _activeNodes.add(node);
}

export function unregisterActiveNode(node: AudioNode & { stop?: () => void }) {
  _activeNodes.delete(node);
}

let _dcBlockNode: BiquadFilterNode | null = null;
let _isResultsDucked = false;
let _isOptionsDucked = false;
let _isOptionsOpen = false;

export function isOptionsOpen(): boolean {
  if (_isOptionsOpen) return true;
  if (typeof document !== 'undefined') {
    const el = document.getElementById('panel');
    if (el && !el.hasAttribute('hidden')) return true;
  }
  return false;
}

export function setOptionsOpenState(open: boolean) {
  _isOptionsOpen = open;
  applyDrone();
}

/** Smoothly ramp drone gain to 0 (duck=true, options open, or soundOn=false) or restore it. */
export function applyDrone() {
  const { actx, droneGain, drone, soundOn } = AudioStore;
  if (!actx || !droneGain) return;
  const optionsActive = isOptionsOpen();
  const targetGain = _isResultsDucked || _isOptionsDucked || optionsActive || !soundOn ? 0 : 0.026 * Math.max(0, drone);
  if (optionsActive || _isOptionsDucked) {
    droneGain.gain.setValueAtTime(0, actx.currentTime);
  } else {
    droneGain.gain.setTargetAtTime(targetGain, actx.currentTime, 0.4);
  }
}

export function fadeDroneForResults(duck: boolean) {
  _isResultsDucked = duck;
  applyDrone();
}

export function fadeDroneForOptions(duck: boolean) {
  _isOptionsDucked = duck;
  applyDrone();
}

// --- Lifecycle ---

export function initAudio() {
  if (AudioStore.actx) {
    if (AudioStore.actx.state === 'suspended') AudioStore.actx.resume();
    return;
  }
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  const actx = AudioStore.latency > 0 ? new AC({ latencyHint: AudioStore.latency }) : new AC();
  AudioStore.actx = actx;

  const master = actx.createGain();
  master.gain.value = AudioStore.soundOn ? AudioStore.volume : 0;

  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 24; comp.ratio.value = 2.0;
  comp.attack.value = 0.05; comp.release.value = 0.4;

  const dcBlock = actx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 22;
  dcBlock.Q.value = 0.7;

  master.connect(comp);
  comp.connect(dcBlock);
  dcBlock.connect(actx.destination);
  AudioStore.master = master;
  _dcBlockNode = dcBlock;

  const nlen = Math.floor(actx.sampleRate * 2.0);
  AudioStore.noiseBuf = actx.createBuffer(1, nlen, actx.sampleRate);
  const nd = AudioStore.noiseBuf.getChannelData(0);
  const fadeLen = Math.floor(actx.sampleRate * 0.01);
  let lastSample = 0;
  for (let i = 0; i < nlen; i++) {
    const raw = Math.random() * 2 - 1;
    // 1-pole lowpass filter (pink/brown noise characteristic for crackle-free swooshes)
    lastSample = 0.65 * lastSample + 0.35 * raw;
    let s = lastSample;
    if (i < fadeLen) s *= (i / fadeLen);
    else if (i > nlen - fadeLen) s *= ((nlen - i) / fadeLen);
    nd[i] = s;
  }

  const conv = actx.createConvolver();
  conv.buffer = makeReverbIR(actx, 1.3, 3.0);
  const wetBus = actx.createGain();
  wetBus.gain.value = 0.35;
  wetBus.connect(conv);
  conv.connect(master);
  AudioStore.wetBus = wetBus;

  startDrone();
}

/**
 * Change the output buffer size.
 *
 * The hint is fixed for an AudioContext's lifetime, so this tears the context
 * down and builds a new one; voices in flight are lost, which is acceptable for
 * a deliberate settings change. It is a no-op until audio has actually started,
 * which keeps it safe for the headless harness, where there is no AudioContext
 * and no `window` for `initAudio` to read.
 */
export function setLatencyHint(seconds: number) {
  AudioStore.latency = seconds;
  const old = AudioStore.actx;
  if (!old) return;
  AudioStore.actx = null;
  AudioStore.master = null;
  AudioStore.wetBus = null;
  AudioStore.droneGain = null;
  AudioStore.droneOsc = null;
  AudioStore.noiseBuf = null;
  _dcBlockNode = null;
  AudioStore.activeVoices = 0;
  AudioStore.thuds = 0;
  try { old.close(); } catch (e) {}
  initAudio();
}

export function startDrone() {
  if (!AudioStore.actx || !AudioStore.master) return;
  const actx = AudioStore.actx;
  const soundOn = AudioStore.soundOn;
  const optionsActive = isOptionsOpen();
  const droneVal = _isResultsDucked || _isOptionsDucked || optionsActive || !soundOn ? 0 : Math.max(0, AudioStore.drone);
  const targetGain = 0.026 * droneVal;

  const droneGain = actx.createGain();
  droneGain.gain.value = targetGain;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 420;
  droneGain.connect(lp);
  
  // Drone bypasses dynamics compressor to prevent 5Hz idle gain pumping & crackle
  const dest = _dcBlockNode || AudioStore.master;
  lp.connect(dest);
  AudioStore.droneGain = droneGain;

  AudioStore.droneOsc = [[110 - BEAT / 2, -1], [110 + BEAT / 2, 1]].map(([f, side]) => {
    const o = actx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    const p = actx.createStereoPanner ? actx.createStereoPanner() : null;
    if (p) { p.pan.value = side; o.connect(p); p.connect(droneGain); }
    else o.connect(droneGain);
    o.start();
    return o;
  });
}

export function applyGain() {
  if (AudioStore.actx && AudioStore.master) {
    AudioStore.master.gain.setTargetAtTime(
      AudioStore.soundOn ? AudioStore.volume : 0,
      AudioStore.actx.currentTime,
      0.08
    );
    applyDrone();
  }
}

/** Stop and disconnect all actively tracked audio nodes, reset voice counters. */
export function stopAllVoices() {
  for (const node of _activeNodes) {
    try { (node as any).stop?.(); } catch (_) {}
    try { node.disconnect(); } catch (_) {}
  }
  _activeNodes.clear();
  AudioStore.activeVoices = 0;
  AudioStore.thuds = 0;
  AudioStore.cursor = 0;
}
