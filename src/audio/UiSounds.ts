import { initAudio } from './SynthEngine';
import { playBinauralClick } from '../ui/MenuScreen';

/**
 * The click a UI control makes.
 *
 * Every button in the match wrote `initAudio()` followed by
 * `playBinauralClick(330 | 261.63, 0.16, 0, 'toggle')`, and the two bare
 * frequencies carried the whole meaning: 330 is the affirmative click, 261.63
 * the dismissive one. Naming them means a reader no longer has to know which
 * note means which.
 *
 * The synth itself still lives in `ui/MenuScreen.ts`, which is why this module
 * imports upwards. "Audio: remove the repeated plumbing in Voices.ts" moves
 * `playBinauralClick` down here onto the shared envelope helpers, and the
 * import disappears with it.
 */

/** A rounded E4 — confirm, unpause, start. */
export const CLICK_CONFIRM_HZ = 330;
/** C4 — cancel, close, pause. */
export const CLICK_CANCEL_HZ = 261.63;

const CLICK_SECONDS = 0.16;

export function uiClick(kind: 'confirm' | 'cancel') {
  initAudio();
  playBinauralClick(kind === 'confirm' ? CLICK_CONFIRM_HZ : CLICK_CANCEL_HZ, CLICK_SECONDS, 0, 'toggle');
}
