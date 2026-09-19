/**
 * Turning the frame's `SoundEvent` records into sound.
 *
 * The collision solver used to call the voices directly. That meant physics could
 * not be read or tested without the audio module loaded, `boomGroup`/`detach`
 * carried a `width` parameter they wanted only for stereo pan, and the pan and
 * pitch formulas were written out at every call site. The solver now records what
 * happened, in world coordinates, and this module is the one place that knows how
 * a world position becomes a pan and a ball kind becomes a pitch.
 *
 * The frame loop drains the events once, after the last physics substep, so a
 * sound is heard a few milliseconds later than it used to be — inside the
 * scheduling look-ahead the voices already use.
 */
import { SoundEvent } from '../physics/Types';
import { BALL_COLORS } from '../game/Rules';
import { playNote, playKnock, playMagneticElectricSound } from './Voices';

/** The knock force that maps to full loudness. Harder hits are clamped to it. */
export const KNOCK_FULL_SCALE_FORCE = 380;

/**
 * World x to a stereo pan of -1 (hard left) to 1 (hard right).
 *
 * A width of 0 or less pans to centre rather than dividing by it. The old call
 * sites fell back to a literal 600 when width was missing, which was neither the
 * browser's width nor the harness's 380; nothing reaches this without a real
 * width now that the frame loop supplies it.
 */
export function panOf(x: number, width: number): number {
  if (!(width > 0)) return 0;
  return (x / width) * 2 - 1;
}

/**
 * A ball kind to the 0..1 position in the scale its note is drawn from.
 *
 * Special balls (a negative kind) sit in the middle. The divisor is the number of
 * ball colours, so adding a colour does not silently retune the scale.
 */
export function pitchOf(kind: number): number {
  return kind < 0 ? 0.5 : kind / BALL_COLORS.length;
}

/**
 * The loudness boost a boom of `size` balls asks for.
 *
 * Note that `playNote` forwards a 'boom' straight to `playBoom` and reads neither
 * this nor the pitch, so both are currently discarded. They are still passed, so
 * that this stays true by inspection of one call rather than by assumption.
 */
export function boomBoost(size: number): number {
  return Math.min(1.6, 0.7 + size * 0.09);
}

/** Play every sound the frame recorded, then empty the list. */
export function playSoundEvents(sounds: SoundEvent[], width: number): void {
  for (const s of sounds) {
    const pan = panOf(s.x, width);
    switch (s.type) {
      case 'boom':
        playNote(pitchOf(s.kind), pan, 'boom', boomBoost(s.size), s.size, false, s.whiteBlack);
        break;
      case 'peel':
        playNote(pitchOf(s.kind), pan, 'break');
        break;
      case 'lock':
        playNote(pitchOf(s.kind), pan, 'bond');
        break;
      case 'knock':
        playKnock(
          pan,
          Math.min(1, s.force / KNOCK_FULL_SCALE_FORCE),
          pitchOf(s.hitterKind),
          pitchOf(s.struckKind)
        );
        break;
      case 'magnetLock':
        playMagneticElectricSound(pan, false, s.bothBlack, s.size);
        break;
    }
  }
  sounds.length = 0;
}
