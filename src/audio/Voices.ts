import { AudioStore, BEAT, isOptionsOpen, loadAt_, MAX_THUDS, MAX_VOICES, triggerHaptic } from './SynthEngine';

export const BREAK_VOICE = {
  mul: 1, dur: 0.42, jitter: 0.10, peak: 0.18, attack: 0.010, tick: 0.10,
  partials: [[1, 1], [2, 0.34]] as [number, number][], open: 2600, close: 700, dry: 0.62
};

export const BOND_VOICE = {
  mul: 2.5, dur: 0.32, jitter: 0.18, peak: 0.22, attack: 0.004, tick: 0.26,
  partials: [[1, 1], [2, 0.42]] as [number, number][], open: 3400, close: 1000, dry: 0.62
};

export const BOOM_VOICE = {
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

/** Which of the five boom-size tiers a boom falls in, 0 (smallest) to 4. */
export function boomTier(boomSize: number): number {
  if (boomSize >= 20) return 4;
  if (boomSize >= 15) return 3;
  if (boomSize >= 10) return 2;
  if (boomSize >= 5) return 1;
  return 0;
}

export const BOOM_TIER_COUNT = 5;

/**
 * Build a five-tier volume ramp that peaks at `peakTier`.
 *
 * Every tier up to the peak is a step on one even climb from `floor` to 1.0, so
 * the peak sits at the top of the usable range and everything below it ramps up
 * to meet it. Above the peak the ramp steps back down by `falloff` a tier.
 *
 * The ramp is generated rather than typed out so that moving a peak is one
 * number, and so the tiers below it are always redistributed across the whole
 * span instead of keeping whatever values they happened to have.
 */
export function boomVolumeRamp(peakTier: number, floor: number, falloff: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < BOOM_TIER_COUNT; i++) {
    const v = i <= peakTier
      ? (peakTier === 0 ? 1 : floor + (1 - floor) * (i / peakTier))
      : 1 - falloff * (i - peakTier);
    out.push(Math.max(0, Math.round(v * 100) / 100));
  }
  return out;
}

const BOOM_TONE = [80, 105, 135, 170, 210];
const BOOM_DUR = [0.60, 1.00, 1.10, 1.25, 1.40];

/**
 * Level every tier hits the compressor at, before the tier ramp is applied.
 *
 * Held constant on purpose: it is what makes the ramp mean anything. See the
 * note in `playBoom` — a ramp applied upstream of a 4.5:1 compressor
 * arrives at the output as a fraction of itself.
 */
const BOOM_DRIVE = 0.65;

/**
 * Post-compressor output, multiplied by the tier ramp and the user's boom knob.
 *
 * Lower than the 0.63 this used to sit at, because with the ramp now actually
 * reaching the output every tier is genuinely at its ramp value rather than
 * compressed up towards the loudest one.
 */
const BOOM_OUTPUT = 0.32;

/**
 * Volume by tier, one ramp per variant. **Neither is monotonic**, and neither
 * should be "corrected" into a monotonic curve: each peaks at the tier that is
 * meant to be the loudest and eases off above it.
 *
 * - The boom voice peaks at **Level 15-20**: [0.40, 0.60, 0.80, 1.00, 0.85]. The 20+
 *   tier is still the biggest event in the game — longest duration, lowest tone,
 *   longest echo tail, and an 808 sub layer the others do not get — so it lands
 *   on weight rather than on gain. At vol 1.5 a 20+ boom alone measured
 *   -0.2 dBFS, leaving nothing for any voice on top of it; see the trim in
 *   `playBoom`.
 * - White-on-black peaks a tier lower, at **Level 10-15**:
 *   [0.50, 0.75, 1.00, 0.85, 0.70]. It is lifted `WHITE_BLACK_LIFT` and carries
 *   a struck-metal ring, so much more of its energy sits where the ear is most
 *   sensitive; held at the ordinary boom's gain through the top tiers it stops
 *   reading as bigger and starts reading as harsh.
 */
export const BOOM_VOL_RAMP = boomVolumeRamp(3, 0.40, 0.25);
export const WHITE_BLACK_VOL_RAMP = boomVolumeRamp(2, 0.50, 0.25);

/**
 * Tone (end frequency in Hz), duration (seconds) and volume for the ordinary
 * boom voice. Tone and duration rise across every tier; volume follows
 * `BOOM_VOL_RAMP` and peaks at Level 15-20.
 */
export function getBoomProps(boomSize: number) {
  const i = boomTier(boomSize);
  return { tone: BOOM_TONE[i], dur: BOOM_DUR[i], vol: BOOM_VOL_RAMP[i] };
}

/**
 * Volume for the white-on-black boom, which has a ramp of its own rather than a
 * flat multiple of the ordinary one's. Peaks at Level 10-15.
 */
export function getWhiteBlackBoomVol(boomSize: number): number {
  return WHITE_BLACK_VOL_RAMP[boomTier(boomSize)];
}

/**
 * Cross-fed echo taps for the boom, scaled by how big the boom was.
 *
 * The two delays are deliberately not a simple multiple of each other, so the
 * repeats interleave into a scatter rather than lining up into one flam, and
 * each feeds the *other* side — a ping-pong that throws the boom across the
 * stereo field as it dies away. `feedback` and `tail` both grow with the chain,
 * so a 2-ball pop still ends promptly while a 20-ball boom rolls out across a
 * canyon. Feedback is ramped to zero over `tail` rather than left to decay on
 * its own: it guarantees the loop terminates, and it is what lets the node
 * cleanup below be scheduled at a known time.
 */
export function boomEchoSpec(boomSize: number, whiteBlack: boolean) {
  const size = Math.max(0, Math.min(1, boomSize / 20));
  return {
    left: 0.19 + size * 0.07,
    // Drifts from ~1.58x the left delay to ~1.65x as the chain grows: near the
    // golden ratio and, more to the point, never near 3/2 or 2, where every
    // second right-hand repeat would land on a left one and flam instead of
    // scatter. `tests/audio/Voices.test.ts` holds it off those multiples.
    right: 0.30 + size * 0.13,
    feedback: 0.30 + size * 0.30,
    // Flat across tiers. The delay times, the feedback and the tail all grow
    // with the chain — that is the drama — but the send is a *level*, and the
    // echoes tap off `trim`, downstream of the tier ramp. Growing it with chain
    // size handed the biggest booms back the loudness the ramp had just taken
    // off them, which is part of why 20+ read as loudest whatever the ramp said.
    send: 0.30 * (whiteBlack ? 1.15 : 1),
    // Metal repeats stay bright longer than a bass boom's do.
    damp: whiteBlack ? 2600 : 1400,
    tail: 1.1 + size * 2.4,
  };
}

/**
 * A white ball reaching a black one is the only way a black ever leaves the
 * table, and it takes the whole group with it. That boom gets its own voice
 * rather than the ordinary one: the pitch dive is lifted most of an octave, and
 * a struck-metal ring is layered over it. The ring's partials are deliberately
 * inharmonic (× 6 and × 9.2 of the tone) so it reads as metal shattering rather
 * than as another note in the scale, and it is routed past the boom's lowpass —
 * which sweeps down to a few hundred Hz — or nothing of it would survive.
 */
const WHITE_BLACK_LIFT = 1.8;
const WHITE_BLACK_RING = [
  { ratio: 6, amp: 0.18, decay: 0.85, pan: -0.45 },
  { ratio: 9.2, amp: 0.10, decay: 0.55, pan: 0.45 },
];

/**
 * Synthesizes a clear, punchy binaural bass boom for booms.
 * Features a rapid pitch-drop dive (startPitch -> endPitch), lowpass filter sweep,
 * soft dynamics compressor to prevent crackle, and scaling by chain size.
 * `whiteBlack` selects the lifted, ringing variant described above.
 */
export function playBoom(boomSize: number = 3, xNorm: number = 0, ignoreOptionsGuard: boolean = false, whiteBlack: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.master || AudioStore.boomVol <= 0) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const actx = AudioStore.actx;
  const now = actx.currentTime;
  const t = now + 0.015;
  const dest = AudioStore.master;

  const props = getBoomProps(boomSize);
  // The lifted boom carries more of its energy where the ear is most sensitive,
  // so it is shortened, and takes its level from its own ramp rather than a flat
  // multiple of this one's — the two peak at different tiers on purpose.
  const tone = props.tone * (whiteBlack ? WHITE_BLACK_LIFT : 1);
  const dur = props.dur * (whiteBlack ? 0.85 : 1);
  const vol = whiteBlack ? getWhiteBlackBoomVol(boomSize) : props.vol;
  // Every tier drives the compressor at the SAME level. The tier ramp and the
  // user's boom knob are applied downstream of it instead, on `trim`.
  //
  // They used to be applied here, and the ramp then did essentially nothing:
  // with the threshold at -14 dB and a 4.5:1 ratio, every tier sat 10-13 dB into
  // compression, so the ramp's full 8 dB spread arrived at the output as 1.8 dB
  // and the step from Level 15-20 to 20+ arrived as 0.31 dB. What was left to
  // separate the tiers was everything the compressor does not touch — duration,
  // the 808 sub layer, the echo send — and all of those grow with chain size, so
  // 20+ came out loudest however the ramp was written. Post-compressor, the ramp
  // lands 1:1.
  const peak = BOOM_DRIVE;
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

  // Trim after the compressor, and the only place the tier ramp is applied. The
  // compressor's automatic makeup gain hands back most of any cut made upstream
  // of it, so a level that must actually be heard has to be set here.
  const trim = actx.createGain();
  parts.push(trim);
  trim.gain.value = BOOM_OUTPUT * vol * AudioStore.boomVol;
  comp.connect(trim);
  trim.connect(dest);

  // Echo network. It taps the boom post-trim, so the repeats carry the shape the
  // listener actually heard, and it returns to `dest` on its own path rather than
  // back through `comp` — routed through the compressor the repeats would pump
  // the dry boom down every time one landed.
  const echo = boomEchoSpec(boomSize, whiteBlack);
  const echoEnd = t + dur + echo.tail;
  const delayL = actx.createDelay(1.0);
  const delayR = actx.createDelay(1.0);
  const fbL = actx.createGain();
  const fbR = actx.createGain();
  const dampL = actx.createBiquadFilter();
  const dampR = actx.createBiquadFilter();
  const send = actx.createGain();
  parts.push(delayL, delayR, fbL, fbR, dampL, dampR, send);

  delayL.delayTime.setValueAtTime(echo.left, t);
  delayR.delayTime.setValueAtTime(echo.right, t);
  for (const d of [dampL, dampR]) {
    d.type = 'lowpass';
    d.frequency.setValueAtTime(echo.damp, t);
    d.Q.value = 0.7;
  }
  // Each repeat loses its top end, the way a real one loses it to the air.
  for (const f of [fbL, fbR]) {
    f.gain.setValueAtTime(echo.feedback, t);
    f.gain.setValueAtTime(echo.feedback, t + dur);
    f.gain.linearRampToValueAtTime(0, echoEnd);
  }
  send.gain.value = 0.0001;
  send.gain.setValueAtTime(0.0001, now);
  send.gain.linearRampToValueAtTime(echo.send, t + 0.02);

  trim.connect(send);
  send.connect(delayL);
  send.connect(delayR);
  // Cross-fed: each side's repeat re-enters on the opposite side.
  delayL.connect(dampL); dampL.connect(fbL); fbL.connect(delayR);
  delayR.connect(dampR); dampR.connect(fbR); fbR.connect(delayL);

  if (actx.createStereoPanner) {
    const panEchoL = actx.createStereoPanner();
    const panEchoR = actx.createStereoPanner();
    parts.push(panEchoL, panEchoR);
    panEchoL.pan.setValueAtTime(-0.75, t);
    panEchoR.pan.setValueAtTime(0.75, t);
    dampL.connect(panEchoL); panEchoL.connect(dest);
    dampR.connect(panEchoR); panEchoR.connect(dest);
  } else {
    dampL.connect(dest);
    dampR.connect(dest);
  }

  // The boom had no reverb at all before: it was the one voice wired straight
  // past the wet bus. A send from the echo taps, rather than from the dry boom,
  // puts the room behind the repeats where it reads as distance.
  if (AudioStore.wetBus) {
    dampL.connect(AudioStore.wetBus);
    dampR.connect(AudioStore.wetBus);
  }

  // Struck-metal ring for the white-on-black boom. It joins at the compressor
  // rather than at `lp`, so the boom's downward filter sweep does not swallow it,
  // while the compressor still holds the pair together on the way out.
  if (whiteBlack) {
    for (const mode of WHITE_BLACK_RING) {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      parts.push(osc, g);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone * mode.ratio, t);
      // A slight downward drift over the tail: struck metal sags as it rings out.
      rampFreq(osc.frequency, tone * mode.ratio * 0.97, t + mode.decay);
      g.gain.value = 0.0001;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0001, peak * mode.amp), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + mode.decay);
      g.gain.linearRampToValueAtTime(0, t + mode.decay + 0.02);
      osc.connect(g);
      if (actx.createStereoPanner) {
        const pan = actx.createStereoPanner();
        parts.push(pan);
        pan.pan.setValueAtTime(Math.max(-1, Math.min(1, xNorm * 0.5 + mode.pan)), t);
        g.connect(pan);
        pan.connect(comp);
      } else {
        g.connect(comp);
      }
      osc.start(t);
      osc.stop(t + mode.decay + 0.05);
    }
  }

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
  if (boomSize >= 15) {
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
  // This oscillator drives the cleanup below, so it outlives the boom by the
  // echo tail. Its envelope reached zero back at `t + dur`, so the extra time is
  // silent — it costs one idle oscillator to keep the teardown on `onended`
  // rather than on a timer the audio clock does not govern. Tearing the graph
  // down at the boom's own end would cut every repeat off with it.
  rightOsc.stop(echoEnd + 0.1);

  rightOsc.onended = () => {
    for (const n of parts) { try { n.disconnect(); } catch (_) {} }
    parts.length = 0;
  };
}

/**
 * Chain sizes a boom can actually have, one entry per tier of
 * `getBoomProps`, and how often each is drawn.
 *
 * The weights are shaped from what the harness measures the game doing:
 * `npm run sim -- run --runs 12 --mode solo` gives a mean boom of about 3.8
 * balls, a biggest-boom-per-minute averaging 10.7, and a largest group ever
 * built of 19 — so small booms dominate, ten-ball booms are a highlight of a
 * round, and twenty is the edge of what the shipped AI reaches.
 *
 * `menu` keeps that shape but lifts the tail: a true match distribution would
 * be about 80% smallest-tier, and an attract screen that plays the same small
 * boom eight times running is not previewing the game's range. `celebration`
 * leans the other way on purpose — the results screen is a victory lap, so it
 * should mostly be playing the big ones.
 *
 * Measured with `--policy engine-ai`, which aims at the biggest group and
 * never checks whether the line is clear. It cannot represent shot selection, so
 * a player who picks shots well may well build past 20 more often than this.
 */
const BOOM_TIERS: { lo: number; hi: number }[] = [
  { lo: 2, hi: 4 },
  { lo: 5, hi: 9 },
  { lo: 10, hi: 14 },
  { lo: 15, hi: 19 },
  { lo: 20, hi: 26 },
];

const BOOM_PROFILES = {
  menu: { weights: [0.50, 0.26, 0.14, 0.07, 0.03], whiteBlack: 0.12 },
  celebration: { weights: [0.16, 0.24, 0.26, 0.22, 0.12], whiteBlack: 0.28 },
};

export type BoomProfile = keyof typeof BOOM_PROFILES;

/** Pick a chain size and variant a real match could have produced. */
export function pickGameBoom(profile: BoomProfile, rand: () => number = Math.random) {
  const { weights, whiteBlack } = BOOM_PROFILES[profile];
  let r = rand();
  let tier = weights.length - 1;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) { tier = i; break; }
    r -= weights[i];
  }
  const { lo, hi } = BOOM_TIERS[tier];
  return {
    boomSize: lo + Math.floor(rand() * (hi - lo + 1)),
    // Only a white ball reaching a black produces this one, so it stays a
    // garnish rather than the house style, even on the results screen.
    whiteBlack: rand() < whiteBlack,
  };
}

/**
 * How many attract-screen booms may be ringing at once.
 *
 * In a match, booms are limited by how often a group can actually be broken.
 * The attract screens fire on a timer instead, and `playBoom` has no
 * voice cap of its own — so at the results screen's cadence, with a top-tier
 * boom running 1.4s and trailing an echo tail of up to 3.5s behind it, five or
 * six can overlap. That is both a mud problem and a real CPU cost on a phone,
 * since every one of them carries its own feedback delay network.
 */
const MAX_ATTRACT_BOOMS = 3;
let attractBoomEnds: number[] = [];

/** Drop the attract-boom bookkeeping. Tests use this between cases. */
export function resetAttractBooms() {
  attractBoomEnds = [];
}

/**
 * Play one boom the game could really have made, for the attract screens.
 *
 * The title and results screens both used to call `playNote(..., 'boom')` with
 * no chain size, which defaults to 3 — so every boom either screen ever played
 * was the smallest tier, and the whole upper range of the sound was invisible
 * outside a match.
 */
export function playRandomGameBoom(xNorm: number, profile: BoomProfile, ignoreOptionsGuard: boolean = false) {
  const boom = pickGameBoom(profile);
  const actx = AudioStore.actx;
  if (actx) {
    const now = actx.currentTime;
    attractBoomEnds = attractBoomEnds.filter((end) => end > now);
    if (attractBoomEnds.length >= MAX_ATTRACT_BOOMS) return;
    const props = getBoomProps(boom.boomSize);
    const echo = boomEchoSpec(boom.boomSize, boom.whiteBlack);
    attractBoomEnds.push(now + props.dur + echo.tail);
  }
  playBoom(boom.boomSize, xNorm, ignoreOptionsGuard, boom.whiteBlack);
}

export function playNote(rel: number, xNorm: number, kind: 'bond' | 'break' | 'boom', boost?: number, boomSize?: number, ignoreOptionsGuard: boolean = false, whiteBlack: boolean = false) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.master) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  if (kind === 'boom') {
    playBoom(boomSize ?? 3, xNorm, ignoreOptionsGuard, whiteBlack);
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

/**
 * How big the magnet lock sounds, by the size of the group the lock produced.
 *
 * The same five tiers the boom voice uses (`getBoomProps`), so a lock
 * and the boom that later takes the same group apart are heard on one scale:
 * a ball joining a pair is a tick, a ball closing a twenty-ball group is a
 * long magnetic groan.
 *
 * Duration carries most of that. It spans a factor of five across the tiers,
 * 0.24s to 1.20s, because length is what makes one of these read as a big event
 * — an earlier version spread it only 0.18s to 0.38s and was far too timid for
 * the top tiers. The arc, its filters and the suction sub all sweep across the
 * whole duration, so a long one is a slow descending groan rather than the same
 * zap held out.
 *
 * Level moves weight and length only. It deliberately does not move pitch,
 * which is what separates a single black from a pair (`PAIR_LIFT`); if level
 * moved pitch too, a big single-black lock and a small black-pair lock would
 * collide.
 */
export function getMagnetLockProps(groupSize: number) {
  if (groupSize >= 20) return { dur: 1.20, vol: 1.95, sub: 2.30, drive: 2.20 };
  if (groupSize >= 15) return { dur: 0.88, vol: 1.68, sub: 2.00, drive: 1.90 };
  if (groupSize >= 10) return { dur: 0.62, vol: 1.45, sub: 1.70, drive: 1.60 };
  if (groupSize >= 5) return { dur: 0.40, vol: 1.18, sub: 1.38, drive: 1.32 };
  return { dur: 0.24, vol: 0.88, sub: 1.0, drive: 1.0 };
}

/**
 * Two blacks locking to each other is the rarest bond on the table and pays
 * double a single black (`PAY_BLACK_PAIR`), so it reads as *more* than the
 * ordinary magnet lock in every dimension: a full octave higher, longer, and
 * louder. `PAIR_LIFT` moves the arc and its filters; the suction sub follows at
 * `PAIR_SUB_LIFT`, less far, so the lock keeps weight underneath instead of
 * thinning out into a whistle.
 *
 * An earlier version had the pair at 0.8x the duration and 0.8x the level of a
 * single black, on the reasoning that it was the snappier sound by character and
 * that its lifted arc sits nearer the ear's most sensitive band, where it would
 * otherwise read louder than the lock beside it. That is defensible mixing and
 * was still wrong here: it made the rarest event on the table the meekest one.
 * The pair now runs longer and louder than a single black at the same tier, and
 * grows with the chain the same way.
 */
export const PAIR_LIFT = 2.0;
export const PAIR_SUB_LIFT = 1.5;
export const PAIR_DUR = 1.25;
export const PAIR_VOL = 1.2;

export function playMagneticElectricSound(xNorm: number = 0, ignoreOptionsGuard: boolean = false, isPair: boolean = false, groupSize: number = 2) {
  if (!AudioStore.soundOn || !AudioStore.actx || !AudioStore.master) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const actx = AudioStore.actx;
  if (AudioStore.activeVoices >= MAX_VOICES) return;

  const lift = isPair ? PAIR_LIFT : 1;
  const subLift = isPair ? PAIR_SUB_LIFT : 1;
  const level = getMagnetLockProps(groupSize);

  const now = actx.currentTime;
  const t = now + 0.012;
  const dur = level.dur * (isPair ? PAIR_DUR : 1);
  // Kept under the bond lock: the square-wave arc sits at 2-5 kHz, where it
  // reads louder than its measured level against the lower game voices. The
  // pair is deliberately not trimmed for that — see `PAIR_LIFT` above.
  const peak = 0.027 * AudioStore.lockVol * level.vol * (isPair ? PAIR_VOL : 1);
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
  hp.frequency.setValueAtTime(1400 * lift, now);
  hp.frequency.setValueAtTime(1400 * lift, t);
  rampFreq(hp.frequency, 400 * lift, t + dur);

  // Resonant lowpass filter sweep: electric brightness (5200Hz) snapping down into magnetic seal (650Hz)
  const lp = actx.createBiquadFilter();
  parts.push(lp);
  lp.type = 'lowpass';
  lp.Q.value = 8.0;
  lp.frequency.setValueAtTime(5200 * lift, now);
  lp.frequency.setValueAtTime(5200 * lift, t);
  rampFreq(lp.frequency, 1600 * lift, t + 0.04);
  rampFreq(lp.frequency, 650 * lift, t + dur);

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
  carrier.frequency.setValueAtTime(2400 * lift, t);
  rampFreq(carrier.frequency, 450 * lift, t + dur);

  modOsc.type = 'sawtooth';
  modOsc.frequency.setValueAtTime(220 * lift, t);
  rampFreq(modOsc.frequency, 85 * lift, t + dur);

  modGain.gain.setValueAtTime(1200 * lift * level.drive, t);
  rampFreq(modGain.gain, 150 * lift * level.drive, t + dur);

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
    bp.frequency.setValueAtTime(Math.min(16000, 4800 * lift), t);
    rampFreq(bp.frequency, Math.min(16000, 2200 * lift), t + 0.07);
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
  subOsc.frequency.setValueAtTime(130 * subLift, t);
  rampFreq(subOsc.frequency, 320 * subLift, t + 0.03);
  rampFreq(subOsc.frequency, 90 * subLift, t + dur);

  subGain.gain.value = 0.0001;
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.setValueAtTime(0.0001, t);
  subGain.gain.linearRampToValueAtTime(peak * 0.35 * level.sub, t + 0.015);
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

/**
 * Mode ratios of a free metal bar — 1 : 2.76 : 5.40 : 8.93.
 *
 * These are what make something read as *metal* rather than as a pitch: they
 * are inharmonic, so the ear hears a struck object instead of a note, and no
 * amount of filtering a noise sweep reproduces that. Driving a bank of narrow
 * bandpasses at these ratios with noise excites the same modes a real plate has.
 * Higher modes get a tighter Q and less level, the way a real bar's do.
 */
export const SWOOSH_METAL_MODES = [
  { ratio: 1, q: 11, amp: 1.0 },
  { ratio: 2.76, q: 14, amp: 0.62 },
  { ratio: 5.4, q: 17, amp: 0.34 },
  { ratio: 8.93, q: 20, amp: 0.16 },
];

/**
 * The white cue ball's launch: a metal sheet being swung.
 *
 * Built apart from the coloured swoosh because it is a different instrument, not
 * a brighter setting of the same one. Two independent mode banks are driven from
 * one noise source and hard-panned, their resonances offset by `BEAT` Hz — the
 * same binaural construction as the drone and the boom voice. The previous white
 * swoosh summed to a single mono chain and placed it with one panner, so despite
 * sitting in a game built on binaural voices it had no width of its own at all.
 *
 * `xNorm` still biases the two sides rather than collapsing them, so the launch
 * keeps its position on the table without giving up the spread.
 */
function playWhiteSwoosh(xNorm: number, normForce: number) {
  const actx = AudioStore.actx!;
  const now = actx.currentTime;
  const t = now + 0.010;
  const dur = 0.34;
  // Metal does not stop when the swing does. The banks ring on past the sweep
  // instead of being cut off at `dur`, which is most of what made the first
  // version of this read as timid: it ended exactly when it stopped moving.
  const ring = 0.18;

  // Narrow bandpasses pass far less of the noise than a wide lowpass does, so
  // this runs well above the level the old mono swoosh used for the same swing.
  const peak = 0.34 * Math.max(0.15, normForce) * AudioStore.clickVol;
  if (peak < 0.001) return;

  triggerHaptic('heavy');

  // The swing: modes rise as the ball is thrown, then fall away behind it. A
  // wider arc travelled faster is the difference between a swing and a wave.
  const baseStart = 460, baseMid = 1700, baseEnd = 560;
  const bias = Math.max(-1, Math.min(1, xNorm || 0));

  const parts: any[] = [];

  const src = actx.createBufferSource();
  parts.push(src);
  src.buffer = AudioStore.noiseBuf;
  src.loop = true;
  src.playbackRate.value = 1.9;

  const g = actx.createGain();
  parts.push(g);
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + 0.018);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak * 0.80), t + dur * 0.55);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak * 0.30), t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + ring);
  g.gain.linearRampToValueAtTime(0, t + dur + ring + 0.03);
  src.connect(g);

  // Onset scrape: a few milliseconds of very bright noise, above every mode, for
  // the initial bite of metal being struck. Without it the banks fade up into
  // the swing rather than being hit into it.
  const scrapeSrc = actx.createBufferSource();
  const scrapeBp = actx.createBiquadFilter();
  const scrapeG = actx.createGain();
  parts.push(scrapeSrc, scrapeBp, scrapeG);
  scrapeSrc.buffer = AudioStore.noiseBuf;
  scrapeSrc.loop = true;
  scrapeSrc.playbackRate.value = 2.6;
  scrapeBp.type = 'bandpass';
  scrapeBp.Q.value = 1.1;
  scrapeBp.frequency.setValueAtTime(6200, t);
  rampFreq(scrapeBp.frequency, 3100, t + 0.09);
  scrapeG.gain.value = 0.0001;
  scrapeG.gain.setValueAtTime(0.0001, now);
  scrapeG.gain.setValueAtTime(Math.max(0.0001, peak * 0.5), t);
  scrapeG.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
  scrapeG.gain.linearRampToValueAtTime(0, t + 0.1);
  scrapeSrc.connect(scrapeBp);
  scrapeBp.connect(scrapeG);
  scrapeSrc.start(t, Math.random() * 0.1);
  scrapeSrc.stop(t + 0.12);

  // One bank per ear. Detuning them by BEAT Hz at every mode is what produces
  // the beating; panning alone would only place a mono sound.
  for (const side of [-1, 1]) {
    let dest: AudioNode = AudioStore.master!;
    if (actx.createStereoPanner) {
      const pan = actx.createStereoPanner();
      parts.push(pan);
      // Hard-ish sides, nudged by where on the table the throw happened.
      pan.pan.value = Math.max(-1, Math.min(1, side * 0.85 + bias * 0.15));
      pan.connect(dest);
      dest = pan;
    }
    // A side kept slightly quieter reads as further away, which is the pan.
    const sideGain = actx.createGain();
    parts.push(sideGain);
    sideGain.gain.value = Math.max(0.35, 1 - 0.3 * side * bias) * 0.72;
    sideGain.connect(dest);
    scrapeG.connect(sideGain);

    const offset = (side * BEAT) / 2;
    for (const mode of SWOOSH_METAL_MODES) {
      const bp = actx.createBiquadFilter();
      const mg = actx.createGain();
      parts.push(bp, mg);
      bp.type = 'bandpass';
      bp.Q.value = mode.q;
      const f0 = baseStart * mode.ratio + offset;
      const f1 = baseMid * mode.ratio + offset;
      const f2 = baseEnd * mode.ratio + offset;
      bp.frequency.value = f0;
      bp.frequency.setValueAtTime(f0, now);
      bp.frequency.setValueAtTime(f0, t);
      rampFreq(bp.frequency, f1, t + dur * 0.4);
      rampFreq(bp.frequency, f2, t + dur);
      mg.gain.value = mode.amp;
      g.connect(bp);
      bp.connect(mg);
      mg.connect(sideGain);
    }

    // Binaural sub under the metal, so the throw still has weight.
    const sub = actx.createOscillator();
    const subGain = actx.createGain();
    parts.push(sub, subGain);
    sub.type = 'sine';
    const s0 = 190 + offset, s1 = 430 + offset, s2 = 150 + offset;
    sub.frequency.value = s0;
    sub.frequency.setValueAtTime(s0, now);
    sub.frequency.setValueAtTime(s0, t);
    rampFreq(sub.frequency, s1, t + dur * 0.4);
    rampFreq(sub.frequency, s2, t + dur);
    subGain.gain.value = 0.0001;
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.linearRampToValueAtTime(peak * 0.42, t + 0.03);
    subGain.gain.linearRampToValueAtTime(0.0001, t + dur);
    subGain.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    sub.connect(subGain);
    subGain.connect(dest);
    sub.start(t);
    sub.stop(t + dur + 0.06);
  }

  // Metal rings into the room; the dry-only mono version never did.
  if (AudioStore.wetBus) g.connect(AudioStore.wetBus);

  const bufDur = AudioStore.noiseBuf!.duration || 2.0;
  src.start(t, Math.random() * Math.max(0, bufDur - 0.5));
  src.stop(t + dur + ring + 0.06);

  AudioStore.thuds++;
  src.onended = () => {
    AudioStore.thuds = Math.max(0, AudioStore.thuds - 1);
    for (const n of parts) { try { n.disconnect(); } catch (e) {} }
    parts.length = 0;
  };
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

  // The white ball is a different instrument, not a brighter setting of this one.
  if (isWhite) { playWhiteSwoosh(xNorm, normForce); return; }

  // Tight 10ms lookahead for immediate audio response without JS frame-lag crackle
  const t = now + 0.010;
  const dur = 0.22;
  const peak = 0.22 * Math.max(0.15, normForce) * AudioStore.clickVol;
  if (peak < 0.001) return;

  const src = actx.createBufferSource();
  src.buffer = AudioStore.noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.85;

  // 1. Envelope Gain Node FIRST (initialized to 0.0001 to prevent step discontinuities into filter)
  const g = actx.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + 0.04);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.03);

  // 2. Lowpass Filter SECOND (receives zero-initialized gain output)
  const bp = actx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.Q.value = 0.7;
  const startFreq = 350;
  bp.frequency.value = startFreq;
  bp.frequency.setValueAtTime(startFreq, now);
  bp.frequency.setValueAtTime(startFreq, t);
  rampFreq(bp.frequency, 1000, t + dur * 0.4);
  rampFreq(bp.frequency, 250, t + dur);

  // Connect: src -> g -> bp
  const parts: any[] = [src, g, bp];
  src.connect(g);
  g.connect(bp);

  // Smooth pitch-swept sine sub-oscillator
  const osc = actx.createOscillator();
  const oscGain = actx.createGain();
  parts.push(osc, oscGain);
  osc.type = 'sine';

  const startP = 130;
  const midP = 260;
  const endP = 100;

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

