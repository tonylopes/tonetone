import { AudioStore, BEAT, SILENCE, initAudio, isOptionsOpen } from './SynthEngine';

/**
 * The interface's own voice: the binaural click every button makes.
 *
 * This is the game's third binaural synth, alongside the drone and the boom, and
 * it lived in `ui/MenuScreen.ts` until 2026-09-19 — which meant `main.ts` and the
 * sound tester both reached up into the menu to make a button noise. It is a
 * voice, so it lives with the voices.
 *
 * The notes carry the meaning and are named here rather than repeated as bare
 * frequencies at fifteen call sites.
 */

/** A rounded E4 — confirm, unpause, start. */
export const CLICK_CONFIRM_HZ = 330;
/** C4 — cancel, close, pause. */
export const CLICK_CANCEL_HZ = 261.63;
/** D4 — choosing an item on the menu. */
export const CLICK_SELECT_HZ = 293.66;

const CLICK_SECONDS = 0.16;

/**
 * How far ahead the click schedules itself, in seconds.
 *
 * The longest look-ahead of any voice. A click fires straight off a pointer
 * event, which is the moment the main thread is busiest — laying out whatever
 * the press just changed — so it needs the most headroom before the audio
 * thread's next render quantum.
 */
const CLICK_LOOKAHEAD = 0.025;

/**
 * How long the click refuses to fire again.
 *
 * Clicks are short and loud, and a run of them inside one lock window reads as
 * a rattle rather than as several presses.
 */
export const MENU_CLICK_LOCK_MS = 180;

/**
 * At most this many click voices may overlap.
 *
 * The click has no ducking of its own, and the Web Audio render thread is the
 * thing that starves first on a phone.
 */
export const MAX_MENU_VOICES = 6;

let activeMenuVoices = 0;
let lastClickTimestamp = 0;
let lastSelectTimestamp = 0;
let clickLockMs = MENU_CLICK_LOCK_MS;

/** When a `'select'` click last played. The menu reads it to keep its hover
 *  blips from crowding a selection that has just been made. */
export function lastSelectAt(): number {
  return lastSelectTimestamp;
}

/**
 * Override the click lock, in milliseconds.
 *
 * This exists for tests, which need to fire clicks back to back to reach the
 * voice cap. It replaces a `process.env.NODE_ENV === 'test'` branch that used to
 * sit inside the voice itself — production code should not behave differently
 * because of an environment variable, and a test should say what it is changing.
 */
export function setClickLockMs(ms: number) {
  clickLockMs = ms;
}

/** Drop the voice count and the locks, so one test cannot leak into the next. */
export function resetUiSoundsForTesting() {
  activeMenuVoices = 0;
  lastClickTimestamp = 0;
  lastSelectTimestamp = 0;
  clickLockMs = MENU_CLICK_LOCK_MS;
}

/** Start the audio graph, resuming a context the browser stopped. */
export function initMenuAudio() {
  initAudio();
}

function getAudioCtx(): AudioContext | null {
  initMenuAudio();
  return AudioStore.actx;
}

/** The click a UI control makes: `confirm` affirms, `cancel` dismisses. */
export function uiClick(kind: 'confirm' | 'cancel') {
  initMenuAudio();
  playBinauralClick(kind === 'confirm' ? CLICK_CONFIRM_HZ : CLICK_CANCEL_HZ, CLICK_SECONDS, 0, 'toggle');
}

/**
 * Plays a single spatial 3D binaural menu click audio effect with left/right channel frequency separation,
 * sub-harmonic resonance, lowpass smoothing, and interaural Haas spatial delay.
 */
export function playBinauralClick(
  freq: number = CLICK_CANCEL_HZ,
  duration: number = CLICK_SECONDS,
  xNorm: number = 0,
  clickType: 'select' | 'hover' | 'toggle' = 'select',
  volBoost: number = 1.0,
  ignoreOptionsGuard: boolean = false
) {
  if (!AudioStore.soundOn) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const nowMs = performance.now();
  if (nowMs - lastClickTimestamp < clickLockMs) return;
  if (activeMenuVoices >= MAX_MENU_VOICES) return;
  lastClickTimestamp = nowMs;
  if (clickType === 'select') {
    lastSelectTimestamp = nowMs;
  }

  try {
    const actx = getAudioCtx();
    if (!actx) return;

    const now = actx.currentTime;
    const dest = AudioStore.master || actx.destination;

    let targetFreq = freq;
    if (clickType === 'select') {
      targetFreq = Math.min(freq, CLICK_SELECT_HZ);
    } else if (clickType === 'hover') {
      targetFreq = Math.min(freq, CLICK_CANCEL_HZ);
    }

    const baseVol = (clickType === 'hover' ? 0.06 : clickType === 'toggle' ? 0.22 : 0.30) * volBoost;

    const leftPanVal = Math.max(-1, Math.min(1, -0.85 + xNorm * 0.25));
    const rightPanVal = Math.max(-1, Math.min(1, 0.85 + xNorm * 0.25));

    const nodesToClean: (AudioNode | OscillatorNode)[] = [];

    // Create lowpass filter node to eliminate any high-frequency harshness
    const lpFilter = actx.createBiquadFilter();
    nodesToClean.push(lpFilter);
    lpFilter.type = 'lowpass';
    const lpFreq = clickType === 'hover' ? 650 : 800;
    lpFilter.frequency.value = lpFreq;
    lpFilter.frequency.setValueAtTime(lpFreq, now);
    lpFilter.Q.setValueAtTime(0.5, now);
    lpFilter.connect(dest);

    const pTime = now + CLICK_LOOKAHEAD;
    const dur = Math.max(0.08, duration);
    const stopTime = pTime + dur + 0.04;

    // Sub-harmonic sine wave node (adds warm bass body)
    const subOsc = actx.createOscillator();
    const subGain = actx.createGain();
    nodesToClean.push(subOsc, subGain);
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(targetFreq * 0.5, pTime);
    subGain.gain.value = SILENCE;
    subGain.gain.setValueAtTime(SILENCE, now);
    subGain.gain.setValueAtTime(SILENCE, pTime);
    subGain.gain.linearRampToValueAtTime(baseVol * 0.35, pTime + 0.015);
    subGain.gain.linearRampToValueAtTime(0, pTime + dur);
    subOsc.connect(subGain);
    subGain.connect(lpFilter);
    subOsc.start(pTime);
    subOsc.stop(stopTime);

    // Left Channel Oscillator (f - 2.5 Hz)
    const leftOsc = actx.createOscillator();
    const leftGain = actx.createGain();
    nodesToClean.push(leftOsc, leftGain);
    const leftFreq = targetFreq - BEAT / 2;

    leftOsc.type = 'sine';
    leftOsc.frequency.setValueAtTime(leftFreq, pTime);

    leftGain.gain.value = SILENCE;
    leftGain.gain.setValueAtTime(SILENCE, now);
    leftGain.gain.setValueAtTime(SILENCE, pTime);
    leftGain.gain.linearRampToValueAtTime(baseVol, pTime + 0.015);
    leftGain.gain.linearRampToValueAtTime(0, pTime + dur);

    if (actx.createStereoPanner) {
      const panL = actx.createStereoPanner();
      nodesToClean.push(panL);
      panL.pan.setValueAtTime(leftPanVal, pTime);
      leftOsc.connect(leftGain);
      leftGain.connect(panL);
      panL.connect(lpFilter);
    } else {
      leftOsc.connect(leftGain);
      leftGain.connect(lpFilter);
    }

    leftOsc.start(pTime);
    leftOsc.stop(stopTime);

    // Right Channel Oscillator (f + 2.5 Hz)
    const rightOsc = actx.createOscillator();
    const rightGain = actx.createGain();
    nodesToClean.push(rightOsc, rightGain);
    const rightFreq = targetFreq + BEAT / 2;

    rightOsc.type = 'sine';
    rightOsc.frequency.setValueAtTime(rightFreq, pTime);

    rightGain.gain.value = SILENCE;
    rightGain.gain.setValueAtTime(SILENCE, now);
    rightGain.gain.setValueAtTime(SILENCE, pTime);
    rightGain.gain.linearRampToValueAtTime(baseVol * 0.95, pTime + 0.015);
    rightGain.gain.linearRampToValueAtTime(0, pTime + dur);

    if (actx.createStereoPanner) {
      const panR = actx.createStereoPanner();
      nodesToClean.push(panR);
      panR.pan.setValueAtTime(rightPanVal, pTime);
      rightOsc.connect(rightGain);
      rightGain.connect(panR);
      panR.connect(lpFilter);
    } else {
      rightOsc.connect(rightGain);
      rightGain.connect(lpFilter);
    }

    activeMenuVoices++;
    rightOsc.onended = () => {
      activeMenuVoices = Math.max(0, activeMenuVoices - 1);
      for (const n of nodesToClean) {
        try { n.disconnect(); } catch (e) {}
      }
      nodesToClean.length = 0;
    };

    rightOsc.start(pTime);
    rightOsc.stop(stopTime);
  } catch (e) {
    activeMenuVoices = Math.max(0, activeMenuVoices - 1);
  }
}
