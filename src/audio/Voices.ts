import { AudioStore, BEAT, isOptionsOpen, loadAt_, MAX_THUDS, MAX_VOICES, triggerHaptic } from './SynthEngine';

export const BREAK_VOICE = {
  mul: 1, dur: 0.42, jitter: 0.10, peak: 0.18, attack: 0.010, tick: 0.10,
  partials: [[1, 1], [2, 0.34]] as [number, number][], open: 2600, close: 700, dry: 0.62
};

export const BOND_VOICE = {
  mul: 2.5, dur: 0.32, jitter: 0.18, peak: 0.22, attack: 0.004, tick: 0.26,
  partials: [[1, 1], [2, 0.42]] as [number, number][], open: 3400, close: 1000, dry: 0.62
};

export const BURST_VOICE = {
  mul: 2, dur: 3.2, jitter: 1.4, peak: 0.17, attack: 0.35, tick: 0,
  partials: [[1, 1], [1.5, 0.25]] as [number, number][], open: 1100, close: 420, dry: 0.3
};

/**
 * High-pitch countdown tick — a short, bright beep that rings above normal
 * game sounds.  `isGo` switches to a triumphant rising double-blip for the
 * "Start!" / "0" moment.
 */
export function playCountdownTick(isGo: boolean = false, ignoreOptionsGuard: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.master) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const actx = AudioStore.actx;
  const now = actx.currentTime;
  const t = now + 0.012;                 // tiny lookahead
  const dest = AudioStore.master;

  // Sits at the top of the mix without towering over it: this is a bare sine at
  // 1180 Hz, near the ear's most sensitive band, and it bypasses both the
  // per-kind level knobs and the duck mixer, so it reads louder than its
  // amplitude suggests next to the game's 110-400 Hz voices.
  const vol = isGo ? 0.065 : 0.045;
  const freq = 1180;                     // bright, above the game palette
  const dur = isGo ? 0.16 : 0.09;

  const parts: (AudioNode & { stop?: () => void })[] = [];

  // Main tone oscillator
  const osc = actx.createOscillator();
  const env = actx.createGain();
  parts.push(osc, env);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);

  env.gain.value = 0.0001;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.006);
  env.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.5);
  env.gain.linearRampToValueAtTime(0.0001, t + dur);
  env.gain.linearRampToValueAtTime(0, t + dur + 0.02);

  osc.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.04);

  // Soft harmonic overtone for sparkle
  const h = actx.createOscillator();
  const hg = actx.createGain();
  parts.push(h, hg);
  h.type = 'sine';
  h.frequency.setValueAtTime(freq * 2.0, t);
  hg.gain.value = 0.0001;
  hg.gain.setValueAtTime(0.0001, now);
  hg.gain.setValueAtTime(0.0001, t);
  hg.gain.linearRampToValueAtTime(vol * 0.22, t + 0.006);
  hg.gain.linearRampToValueAtTime(0.0001, t + dur * 0.65);
  hg.gain.linearRampToValueAtTime(0, t + dur + 0.02);
  h.connect(hg);
  hg.connect(dest);
  h.start(t);
  h.stop(t + dur + 0.04);

  // Haptic feedback
  triggerHaptic(isGo ? 'heavy' : 'medium');

  osc.onended = () => {
    for (const n of parts) { try { n.disconnect(); } catch (_) {} }
    parts.length = 0;
  };
}


function rampFreq(param: any, targetVal: number, targetTime: number) {
  if (param.linearRampToValueAtTime) {
    param.linearRampToValueAtTime(targetVal, targetTime);
  } else if (param.exponentialRampToValueAtTime) {
    param.exponentialRampToValueAtTime(Math.max(1, targetVal), targetTime);
  }
}

/**
 * Returns tone (end frequency in Hz), duration (seconds), and volume scaling
 * for burst binaural bass boom based on the burst chain size levels:
 * - Level 0-5 (0..4): tone 80Hz, dur 0.60s, vol 0.33
 * - Level 5-10 (5..9): tone 105Hz, dur 1.00s, vol 0.55
 * - Level 10-15 (10..14): tone 135Hz, dur 1.10s, vol 0.85
 * - Level 15-20 (15..19): tone 170Hz, dur 1.25s, vol 0.90
 * - Level 20+ (>=20): tone 210Hz, dur 1.40s, vol 0.95
 *
 * At vol 1.5 a 20+ boom alone peaked at -0.2 dBFS, so any voice landing on top
 * of it clipped the output; see the trim in `playBurstBassBoom`.
 */
export function getBurstBassBoomProps(chainSize: number) {
  if (chainSize >= 20) {
    return { tone: 210, dur: 1.40, vol: 0.95 };
  } else if (chainSize >= 15) {
    return { tone: 170, dur: 1.25, vol: 0.90 };
  } else if (chainSize >= 10) {
    return { tone: 135, dur: 1.10, vol: 0.85 };
  } else if (chainSize >= 5) {
    return { tone: 105, dur: 1.00, vol: 0.55 };
  } else {
    return { tone: 80, dur: 0.60, vol: 0.33 };
  }
}

/**
 * Synthesizes a clear, punchy binaural bass boom for bursts.
 * Features a rapid pitch-drop dive (startPitch -> endPitch), lowpass filter sweep,
 * soft dynamics compressor to prevent crackle, and scaling by chain size.
 */
export function playBurstBassBoom(chainSize: number = 3, xNorm: number = 0, ignoreOptionsGuard: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.master || AudioStore.burstVol <= 0) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const actx = AudioStore.actx;
  const now = actx.currentTime;
  const t = now + 0.015;
  const dest = AudioStore.master;

  const { tone, dur, vol } = getBurstBassBoomProps(chainSize);
  const peak = vol * AudioStore.burstVol * 0.65;
  const BEAT_OFFSET = 5; // 5 Hz binaural beat differential

  const startPitch = tone * 3.4;
  const midPitch = tone * 1.1;
  const endPitch = tone * 0.50;

  const parts: (AudioNode & { stop?: () => void })[] = [];

  // Soft dynamics compressor prevents digital clipping crackle while allowing massive bass punch
  const comp = actx.createDynamicsCompressor();
  parts.push(comp);
  comp.threshold.setValueAtTime(-14, t);
  comp.knee.setValueAtTime(18, t);
  comp.ratio.setValueAtTime(4.5, t);
  comp.attack.setValueAtTime(0.005, t);
  comp.release.setValueAtTime(0.15, t);

  // Trim after the compressor. Its automatic makeup gain otherwise hands back
  // most of any cut made upstream, holding the top tiers within ~2 dB of full
  // scale — where anything else playing at the same moment clips the output.
  const trim = actx.createGain();
  parts.push(trim);
  trim.gain.value = 0.63;
  comp.connect(trim);
  trim.connect(dest);

  // Lowpass filter sweep: starts wide for initial boom impact punch, closes into resonant sub tail
  const lp = actx.createBiquadFilter();
  parts.push(lp);
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(startPitch * 2.2, now);
  lp.frequency.setValueAtTime(startPitch * 2.2, t);
  rampFreq(lp.frequency, midPitch * 2.4, t + 0.05);
  rampFreq(lp.frequency, endPitch * 1.6, t + dur);
  lp.Q.setValueAtTime(1.1, t);
  lp.connect(comp);

  // Boom gain envelope: fast punch attack, body sustain, smooth clean decay
  const env = actx.createGain();
  parts.push(env);
  env.gain.value = 0.0001;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + 0.014);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, peak * 0.82), t + 0.06);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, peak * 0.40), t + dur * 0.55);
  env.gain.linearRampToValueAtTime(0.0001, t + dur);
  env.gain.linearRampToValueAtTime(0, t + dur + 0.04);
  env.connect(lp);

  // For higher tiers (>= 15), add deep 808 sub-drop layer for dramatic cinematic weight
  if (chainSize >= 15) {
    const subOsc = actx.createOscillator();
    const subGain = actx.createGain();
    parts.push(subOsc, subGain);
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(startPitch * 0.5, t);
    rampFreq(subOsc.frequency, endPitch * 0.45, t + dur);
    subGain.gain.value = 0.0001;
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.linearRampToValueAtTime(peak * 0.3, t + 0.02);
    subGain.gain.linearRampToValueAtTime(0.0001, t + dur);
    subGain.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    subOsc.connect(subGain);
    subGain.connect(lp);
    subOsc.start(t);
    subOsc.stop(t + dur + 0.05);
  }

  // Left binaural channel oscillator with rapid pitch-drop sweep
  const leftOsc = actx.createOscillator();
  parts.push(leftOsc);
  leftOsc.type = 'sine';
  const startL = startPitch - BEAT_OFFSET / 2;
  const midL = midPitch - BEAT_OFFSET / 2;
  const endL = endPitch - BEAT_OFFSET / 2;
  leftOsc.frequency.setValueAtTime(startL, t);
  rampFreq(leftOsc.frequency, midL, t + 0.05);
  rampFreq(leftOsc.frequency, endL, t + dur);

  if (actx.createStereoPanner) {
    const panL = actx.createStereoPanner();
    parts.push(panL);
    panL.pan.setValueAtTime(Math.max(-1, Math.min(1, xNorm * 0.7 - 0.35)), t);
    leftOsc.connect(panL);
    panL.connect(env);
  } else {
    leftOsc.connect(env);
  }
  leftOsc.start(t);
  leftOsc.stop(t + dur + 0.05);

  // Right binaural channel oscillator with rapid pitch-drop sweep
  const rightOsc = actx.createOscillator();
  parts.push(rightOsc);
  rightOsc.type = 'sine';
  const startR = startPitch + BEAT_OFFSET / 2;
  const midR = midPitch + BEAT_OFFSET / 2;
  const endR = endPitch + BEAT_OFFSET / 2;
  rightOsc.frequency.setValueAtTime(startR, t);
  rampFreq(rightOsc.frequency, midR, t + 0.05);
  rampFreq(rightOsc.frequency, endR, t + dur);

  if (actx.createStereoPanner) {
    const panR = actx.createStereoPanner();
    parts.push(panR);
    panR.pan.setValueAtTime(Math.max(-1, Math.min(1, xNorm * 0.7 + 0.35)), t);
    rightOsc.connect(panR);
    panR.connect(env);
  } else {
    rightOsc.connect(env);
  }
  rightOsc.start(t);
  rightOsc.stop(t + dur + 0.05);

  rightOsc.onended = () => {
    for (const n of parts) { try { n.disconnect(); } catch (_) {} }
    parts.length = 0;
  };
}

export function playNote(rel: number, xNorm: number, kind: 'bond' | 'break' | 'burst', boost?: number, chainSize?: number, ignoreOptionsGuard: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.master) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  if (kind === 'burst') {
    playBurstBassBoom(chainSize ?? 3, xNorm, ignoreOptionsGuard);
    return;
  }

  const actx = AudioStore.actx;
  if (AudioStore.activeVoices >= MAX_VOICES) return;

  const spec = kind === 'bond' ? BOND_VOICE : BREAK_VOICE;
  const now = actx.currentTime;

  const LOOKAHEAD = 0.03;
  const spacing = Math.min(0.2, 0.025 + loadAt_(now) * 0.035);
  if (AudioStore.cursor < now || AudioStore.cursor > now + 0.5) AudioStore.cursor = now;
  const t = Math.max(now + LOOKAHEAD, AudioStore.cursor + spacing);
  if (t > now + 0.3) return;
  AudioStore.cursor = t;

  const i = scaleDegree(rel);
  const f = AudioStore.scale[i] * spec.mul;
  const beat = BEAT + (i % 3) * 0.4;
  const busy = loadAt_(t);
  const duck = 1 / (1 + busy * 0.8);
  if (duck < 0.1) return;

  AudioStore.load = busy + duck;
  AudioStore.loadAt = t;

  const dur = (spec.dur + Math.random() * spec.jitter) * (0.45 + 0.55 * duck);
  const level = kind === 'bond' ? AudioStore.lockVol : AudioStore.breakVol;
  if (level <= 0) return;

  // Haptics fire here, past every condition that can still drop this note. Fired
  // any earlier they buzz for notes the mixer deliberately discarded — which is
  // exactly when the engine is busiest and the least able to afford it.
  if (kind === 'bond') triggerHaptic('light');
  else if (kind === 'break') triggerHaptic('medium');
  const peak = spec.peak * duck * (1 - i * 0.03) * level * (boost || 1);

  const parts: any[] = [];

  const env = actx.createGain();
  parts.push(env);
  env.gain.value = 0.0001;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + spec.attack);
  env.gain.linearRampToValueAtTime(0.0001, t + dur);
  env.gain.linearRampToValueAtTime(0, t + dur + 0.03);

  const lp = actx.createBiquadFilter();
  parts.push(lp);
  lp.type = 'lowpass';
  lp.frequency.value = spec.open;
  lp.frequency.setValueAtTime(spec.open, now);
  lp.frequency.setValueAtTime(spec.open, t);
  rampFreq(lp.frequency, spec.close, t + dur * 0.7);
  lp.Q.value = 0.6;

  env.connect(lp);
  const dry = actx.createGain(); parts.push(dry);
  dry.gain.value = spec.dry || 0.62;
  lp.connect(dry); dry.connect(AudioStore.master);
  if (AudioStore.wetBus) lp.connect(AudioStore.wetBus);

  const oscs: OscillatorNode[] = [];
  [[-1, f, 1 - 0.3 * xNorm], [1, f + beat, 1 + 0.3 * xNorm]].forEach(([side, freq, bias]) => {
    const w = Math.max(0.35, bias) * 0.5;
    let dest: AudioNode = env;
    if (actx.createStereoPanner) {
      const pan = actx.createStereoPanner();
      parts.push(pan);
      pan.pan.value = side;
      pan.connect(env);
      dest = pan;
    }
    for (const [ratio, amt] of spec.partials) {
      const o = actx.createOscillator(), g = actx.createGain();
      parts.push(o, g);
      o.type = 'sine'; o.frequency.value = freq * ratio;
      rampFreq(o.frequency, freq * ratio * 0.995, t + dur);
      g.gain.value = amt * w;
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
      oscs.push(o);
    }
  });

  if (spec.tick && AudioStore.noiseBuf) {
    const src = actx.createBufferSource();
    src.buffer = AudioStore.noiseBuf;
    src.loop = true;
    const bp = actx.createBiquadFilter();
    parts.push(src, bp);
    bp.type = 'bandpass';
    bp.frequency.value = f * 1.6;
    bp.frequency.setValueAtTime(f * 1.6, now);
    bp.frequency.setValueAtTime(f * 1.6, t);
    bp.Q.value = 1.4;
    const ng = actx.createGain();
    parts.push(ng);
    ng.gain.value = 0.0001;
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.setValueAtTime(Math.max(0.0001, peak * spec.tick), t);
    ng.gain.linearRampToValueAtTime(0.0001, t + 0.05);
    ng.gain.linearRampToValueAtTime(0, t + 0.07);
    src.connect(bp); bp.connect(ng); ng.connect(lp);
    src.start(t); src.stop(t + 0.09);
  }

  AudioStore.activeVoices++;
  const endSignalNode = oscs.length ? oscs[oscs.length - 1] : null;
  if (endSignalNode) {
    endSignalNode.onended = () => {
      AudioStore.activeVoices = Math.max(0, AudioStore.activeVoices - 1);
      for (const n of parts) { try { n.disconnect(); } catch (e) {} }
      parts.length = 0;
    };
  }
}

export function playMagneticElectricSound(xNorm: number = 0, ignoreOptionsGuard: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.master) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const actx = AudioStore.actx;
  if (AudioStore.activeVoices >= MAX_VOICES) return;

  const now = actx.currentTime;
  const t = now + 0.012;
  const dur = 0.20;
  // Kept well under the bond lock: the square-wave arc sits at 2-5 kHz, where it
  // reads far louder than its measured level against the lower game voices.
  const peak = 0.027 * AudioStore.lockVol;
  if (peak <= 0.001) return;

  triggerHaptic('light');

  const parts: (AudioNode & { stop?: () => void })[] = [];

  // Master gain envelope for magnetic electric sound: double micro-spark pulse profile
  const env = actx.createGain();
  parts.push(env);
  env.gain.value = 0.0001;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + 0.003);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, peak * 0.4), t + 0.020);
  env.gain.linearRampToValueAtTime(Math.max(0.0001, peak * 0.75), t + 0.035);
  env.gain.linearRampToValueAtTime(0.0001, t + dur);
  env.gain.linearRampToValueAtTime(0, t + dur + 0.03);

  // Highpass / bandpass electrical arc filter for sharp sizzle
  const hp = actx.createBiquadFilter();
  parts.push(hp);
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1400, now);
  hp.frequency.setValueAtTime(1400, t);
  rampFreq(hp.frequency, 400, t + dur);

  // Resonant lowpass filter sweep: electric brightness (5200Hz) snapping down into magnetic seal (650Hz)
  const lp = actx.createBiquadFilter();
  parts.push(lp);
  lp.type = 'lowpass';
  lp.Q.value = 8.0;
  lp.frequency.setValueAtTime(5200, now);
  lp.frequency.setValueAtTime(5200, t);
  rampFreq(lp.frequency, 1600, t + 0.04);
  rampFreq(lp.frequency, 650, t + dur);

  env.connect(hp);
  hp.connect(lp);

  const dry = actx.createGain();
  parts.push(dry);
  dry.gain.value = 0.65;
  lp.connect(dry);

  if (actx.createStereoPanner) {
    const pan = actx.createStereoPanner();
    parts.push(pan);
    pan.pan.value = Math.max(-1, Math.min(1, xNorm || 0)) * 0.7;
    dry.connect(pan);
    pan.connect(AudioStore.master);
  } else {
    dry.connect(AudioStore.master);
  }
  if (AudioStore.wetBus) lp.connect(AudioStore.wetBus);

  // 1. High Sizzling Electric FM Zap (Square + Sawtooth ring mod arc, 2400Hz -> 450Hz)
  const carrier = actx.createOscillator();
  const modOsc = actx.createOscillator();
  const modGain = actx.createGain();
  parts.push(carrier, modOsc, modGain);

  carrier.type = 'square';
  carrier.frequency.setValueAtTime(2400, t);
  rampFreq(carrier.frequency, 450, t + dur);

  modOsc.type = 'sawtooth';
  modOsc.frequency.setValueAtTime(220, t);
  rampFreq(modOsc.frequency, 85, t + dur);

  modGain.gain.setValueAtTime(1200, t);
  rampFreq(modGain.gain, 150, t + dur);

  modOsc.connect(modGain);
  modGain.connect(carrier.frequency);

  const carrierGain = actx.createGain();
  parts.push(carrierGain);
  carrierGain.gain.value = 0.40;
  carrier.connect(carrierGain);
  carrierGain.connect(env);

  modOsc.start(t);
  modOsc.stop(t + dur + 0.05);
  carrier.start(t);
  carrier.stop(t + dur + 0.05);

  // 2. High Voltage Sparkle Discharge Arc (Filtered high frequency noise sizzle "zzzt!")
  if (AudioStore.noiseBuf) {
    const src = actx.createBufferSource();
    src.buffer = AudioStore.noiseBuf;
    src.loop = true;
    const bp = actx.createBiquadFilter();
    const ng = actx.createGain();
    parts.push(src, bp, ng);

    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4800, t);
    rampFreq(bp.frequency, 2200, t + 0.07);
    bp.Q.value = 6.0;

    ng.gain.value = 0.0001;
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.setValueAtTime(peak * 0.45, t);
    ng.gain.linearRampToValueAtTime(0.0001, t + 0.06);
    ng.gain.linearRampToValueAtTime(0, t + 0.08);

    src.connect(bp);
    bp.connect(ng);
    ng.connect(lp);
    src.start(t);
    src.stop(t + 0.09);
  }

  // 3. Soft Magnetic Suction Sub Drop (130Hz -> 320Hz -> 90Hz)
  const subOsc = actx.createOscillator();
  const subGain = actx.createGain();
  parts.push(subOsc, subGain);

  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(130, t);
  rampFreq(subOsc.frequency, 320, t + 0.03);
  rampFreq(subOsc.frequency, 90, t + dur);

  subGain.gain.value = 0.0001;
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.setValueAtTime(0.0001, t);
  subGain.gain.linearRampToValueAtTime(peak * 0.35, t + 0.015);
  subGain.gain.linearRampToValueAtTime(0.0001, t + dur);
  subGain.gain.linearRampToValueAtTime(0, t + dur + 0.03);

  subOsc.connect(subGain);
  subGain.connect(lp);
  subOsc.start(t);
  subOsc.stop(t + dur + 0.05);

  AudioStore.activeVoices++;
  carrier.onended = () => {
    AudioStore.activeVoices = Math.max(0, AudioStore.activeVoices - 1);
    for (const n of parts) { try { n.disconnect(); } catch (e) {} }
    parts.length = 0;
  };
}

function scaleDegree(rel: number): number {
  const validRel = isNaN(rel) ? 0.5 : rel;
  return Math.max(0, Math.min(9, Math.floor(validRel * 10)));
}

// Launch swoosh. Ball-on-ball collisions are `playKnock`.
export function playThud(kind: 'swoosh', xNorm: number, force: number, ignoreOptionsGuard: boolean = false, isWhite: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.noiseBuf || !AudioStore.master || AudioStore.clickVol <= 0) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const actx = AudioStore.actx;
  const now = actx.currentTime;
  if (AudioStore.thuds >= MAX_THUDS) return;

  const normForce = Math.min(1, Math.max(0, force));
  if (now - AudioStore.swooshAt < 0.08) return;
  AudioStore.swooshAt = now;

  // Tight 10ms lookahead for immediate audio response without JS frame-lag crackle
  const t = now + 0.010;
  const dur = isWhite ? 0.28 : 0.22;
  const peakMult = isWhite ? 0.072 : 0.22;
  const peak = peakMult * Math.max(0.15, normForce) * AudioStore.clickVol;
  if (peak < 0.001) return;

  if (isWhite) {
    triggerHaptic('medium');
  }

  const src = actx.createBufferSource();
  src.buffer = AudioStore.noiseBuf;
  src.loop = true;
  src.playbackRate.value = isWhite ? 1.75 : 0.85;

  // 1. Envelope Gain Node FIRST (initialized to 0.0001 to prevent step discontinuities into filter)
  const g = actx.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + (isWhite ? 0.05 : 0.04));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.03);

  // 2. Lowpass Filter SECOND (receives zero-initialized gain output)
  const bp = actx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.Q.value = isWhite ? 1.4 : 0.7;
  const startFreq = isWhite ? 1100 : 350;
  bp.frequency.value = startFreq;
  bp.frequency.setValueAtTime(startFreq, now);
  bp.frequency.setValueAtTime(startFreq, t);
  rampFreq(bp.frequency, isWhite ? 3200 : 1000, t + dur * 0.4);
  rampFreq(bp.frequency, isWhite ? 800 : 250, t + dur);

  // Connect: src -> g -> bp
  const parts: any[] = [src, g, bp];
  src.connect(g);
  g.connect(bp);

  // Smooth pitch-swept sine sub-oscillator
  const osc = actx.createOscillator();
  const oscGain = actx.createGain();
  parts.push(osc, oscGain);
  osc.type = 'sine';

  const startP = isWhite ? 480 : 130;
  const midP = isWhite ? 1150 : 260;
  const endP = isWhite ? 550 : 100;

  osc.frequency.value = startP;
  osc.frequency.setValueAtTime(startP, now);
  osc.frequency.setValueAtTime(startP, t);
  rampFreq(osc.frequency, midP, t + dur * 0.4);
  rampFreq(osc.frequency, endP, t + dur);

  oscGain.gain.value = 0.0001;
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.setValueAtTime(0.0001, t);
  oscGain.gain.linearRampToValueAtTime(peak * 0.45, t + 0.04);
  oscGain.gain.linearRampToValueAtTime(0.0001, t + dur);
  oscGain.gain.linearRampToValueAtTime(0, t + dur + 0.03);

  osc.connect(oscGain);
  oscGain.connect(bp);
  osc.start(t);
  osc.stop(t + dur + 0.05);

  // If white ball, add high shimmer overtone for sparkle launch presence
  if (isWhite) {
    const hOsc = actx.createOscillator();
    const hGain = actx.createGain();
    parts.push(hOsc, hGain);
    hOsc.type = 'sine';
    hOsc.frequency.value = startP * 2;
    hOsc.frequency.setValueAtTime(startP * 2, now);
    hOsc.frequency.setValueAtTime(startP * 2, t);
    rampFreq(hOsc.frequency, midP * 2, t + dur * 0.4);
    rampFreq(hOsc.frequency, endP * 2, t + dur);

    hGain.gain.value = 0.0001;
    hGain.gain.setValueAtTime(0.0001, now);
    hGain.gain.setValueAtTime(0.0001, t);
    hGain.gain.linearRampToValueAtTime(peak * 0.35, t + 0.03);
    hGain.gain.linearRampToValueAtTime(0.0001, t + dur * 0.7);
    hGain.gain.linearRampToValueAtTime(0, t + dur + 0.03);

    hOsc.connect(hGain);
    hGain.connect(bp);
    hOsc.start(t);
    hOsc.stop(t + dur + 0.05);
  }

  if (actx.createStereoPanner) {
    const pan = actx.createStereoPanner();
    parts.push(pan);
    pan.pan.value = Math.max(-1, Math.min(1, xNorm || 0)) * 0.7;
    bp.connect(pan);
    pan.connect(AudioStore.master);
  } else {
    bp.connect(AudioStore.master);
  }

  const bufDur = AudioStore.noiseBuf.duration || 2.0;
  const offset = Math.random() * Math.max(0, bufDur - 0.5);
  src.start(t, offset);
  src.stop(t + dur + 0.05);

  AudioStore.thuds++;
  src.onended = () => {
    AudioStore.thuds = Math.max(0, AudioStore.thuds - 1);
    for (const n of parts) { try { n.disconnect(); } catch (e) {} }
    parts.length = 0;
  };
}

// Resonances of a tuned wooden bar (xylophone modes 1:3:6), so a knock has a clear
// pitch. Their fast, staggered decay is what still reads as wood-on-wood.
const KNOCK_MODES = [
  { ratio: 1, amp: 1.0, decay: 0.09 },
  { ratio: 3, amp: 0.4, decay: 0.05 },
  { ratio: 6, amp: 0.18, decay: 0.028 },
];

// A ball's knock note: its colour's bond-lock scale degree, one octave up, so
// collisions play in key with the locks and the drone.
function knockPitch(rel: number): number {
  return AudioStore.scale[scaleDegree(rel)] * BOND_VOICE.mul * 2;
}

function knockEnvelope(param: AudioParam, peak: number, now: number, t: number, attack: number, decay: number) {
  param.value = 0.0001;
  param.setValueAtTime(0.0001, now);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  param.linearRampToValueAtTime(0, t + attack + decay + 0.01);
}

/**
 * Ball-on-ball knock between two unbonded balls: a contact click over a short
 * wooden ring. Each ball rings its own colour's note (`rel` as for `playNote`),
 * so a collision is a two-note chord, the struck ball answering just after the
 * hitter. Harder hits are brighter, not higher, to stay in key.
 */
export function playKnock(xNorm: number, force: number, relHitter: number, relStruck: number, ignoreOptionsGuard: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.noiseBuf || !AudioStore.master || AudioStore.clickVol <= 0) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  if (AudioStore.thuds >= MAX_THUDS) return;
  const normForce = Math.min(1, Math.max(0, force));
  if (normForce < 0.03) return;
  const actx = AudioStore.actx;
  const now = actx.currentTime;
  if (now - AudioStore.thudAt < 0.035) return;
  AudioStore.thudAt = now;

  // Sits well under the bond lock at equal sliders (the hardest knock ~8 dB below
  // a mid-scale lock), since its bright click reads louder than the measured gap.
  const peak = 0.085 * Math.max(0.15, normForce) * AudioStore.clickVol;
  if (peak < 0.001) return;
  // Tight 10ms lookahead for immediate audio response without JS frame-lag crackle
  const t = now + 0.010;
  const bright = 0.55 + 0.45 * normForce;
  const hitterF = knockPitch(relHitter);
  const struckF = knockPitch(relStruck);
  // Two notes at 0.7 each carry the same energy as one note at full level.
  const notes = hitterF === struckF
    ? [{ f: hitterF, at: t, amp: 1 }]
    : [{ f: hitterF, at: t, amp: 0.7 }, { f: struckF, at: t + 0.018, amp: 0.7 }];
  const end = t + 0.018 + KNOCK_MODES[0].decay + 0.03;

  const parts: any[] = [];
  let dest: AudioNode = AudioStore.master!;
  if (actx.createStereoPanner) {
    const pan = actx.createStereoPanner();
    parts.push(pan);
    pan.pan.value = Math.max(-1, Math.min(1, xNorm || 0)) * 0.7;
    pan.connect(dest);
    dest = pan;
  }

  for (const note of notes) {
    KNOCK_MODES.forEach((m, i) => {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      parts.push(osc, g);
      osc.type = 'sine';
      osc.frequency.value = note.f * m.ratio;
      osc.frequency.setValueAtTime(note.f * m.ratio, now);
      knockEnvelope(g.gain, peak * note.amp * m.amp * (i ? bright : 1), now, note.at, 0.0015, m.decay);
      osc.connect(g);
      g.connect(dest);
      osc.start(note.at);
      osc.stop(end);
    });
  }

  // Contact click: a few milliseconds of band-passed noise above the modes.
  const src = actx.createBufferSource();
  src.buffer = AudioStore.noiseBuf;
  src.loop = true;
  src.playbackRate.value = 2.2;
  const cg = actx.createGain();
  knockEnvelope(cg.gain, peak * 2.2 * bright, now, t, 0.0008, 0.012);
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  const clickFreq = Math.min(6000, Math.max(hitterF, struckF) * 3.2);
  bp.frequency.value = clickFreq;
  bp.frequency.setValueAtTime(clickFreq, now);
  parts.push(src, cg, bp);
  src.connect(cg);
  cg.connect(bp);
  bp.connect(dest);

  const bufDur = AudioStore.noiseBuf?.duration || 2.0;
  src.start(t, Math.random() * Math.max(0, bufDur - 0.5));
  src.stop(end);

  AudioStore.thuds++;
  src.onended = () => {
    AudioStore.thuds = Math.max(0, AudioStore.thuds - 1);
    for (const n of parts) { try { n.disconnect(); } catch (e) {} }
    parts.length = 0;
  };
}

