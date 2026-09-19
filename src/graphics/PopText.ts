import { BoomShape, PopLabel } from '../physics/Types';
import { boomTierWord } from '../game/Rules';

/**
 * The words on a score pop.
 *
 * This is presentation, so it lives with the drawing rather than in the solver
 * that records the event. `tests/graphics/PopText.test.ts` holds the wording.
 */

/**
 * The word beside a boom's points: a size tier, and BOOM! for a white-on-black hit.
 *
 * BOOM! is reserved for the white-on-black hit — the only way a black ball ever
 * leaves the table, and the boom that already gets its own lifted voice. Every
 * other boom shows its tier alone (`+7 DOUBLE`, `+13 SUPER`), so the loudest
 * word in the game stays attached to its rarest event. The two compose: a
 * white-on-black hit that takes 12 balls with it reads `+96 SUPER BOOM!`.
 */
export function boomLabel(count: number, whiteBlack: boolean): string {
  const words = [];
  const tierWord = boomTierWord(count);
  if (tierWord) words.push(tierWord);
  if (whiteBlack) words.push('BOOM!');
  return words.join(' ');
}

/** The points a scoring pop paid, and what its boom earned. */
export function scoreText(points: number, source?: 'lock' | 'boom' | 'peel', boom?: BoomShape): string {
  const label = source === 'boom' && boom ? boomLabel(boom.count, boom.whiteBlack) : '';
  return label ? '+' + points + ' ' + label : '+' + points;
}

/** What to draw for a pop, whichever kind of label it carries. */
export function popText(label: PopLabel): string {
  return 'text' in label ? label.text : scoreText(label.points, label.source, label.boom);
}
