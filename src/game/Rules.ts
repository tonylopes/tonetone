import { BallOnDeck, LauncherPlayer, SpecialBallType } from '../physics/Types';

export const BALL_COLORS = [
  '#FDBE4E', // Gold / Warm Yellow
  '#9744EE', // Purple / Violet
  '#5DD478', // Soft Green
  '#4363D8', // Blue
  '#911EB4', // Deep Purple
  '#42D4F4', // Cyan
];

export const PALETTES: Record<number, number[]> = {
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};

export let COLORS = 3;
export const BLACK = '#000000';
export const WHITE = '#FFFFFF';
export let SPECIALS = true;

// Scoring pays for what a shot changed, not for the size of whatever it touched.
// See the Scoring page in Notion for the measurements behind these rules.

/** Per ball a lock adds, before the growth for the size of the group it joins. */
export const PAY_LOCK = 3;
/** Per ball destroyed, before the size bonus. */
export const PAY_BOOM = 5;
/** Per peel, before the growth for the size of the group the ball was knocked off. */
export const PAY_PEEL = 5;
/** Lock multiplier when one of the two balls that touched is black. */
export const PAY_BLACK = 2;
/** Lock multiplier when a black ball locks onto another black ball. */
export const PAY_BLACK_PAIR = 4;
/** A boom of N balls pays each ball max(1, N / BOOM_BONUS_FROM) times the base. */
export const BOOM_BONUS_FROM = 3;

/**
 * Each further scoring event from the same throw pays this fraction of the one
 * before. One deliberate shot earns full value; a ball wandering the table for
 * seconds does not keep earning it. 1 turns the decay off.
 */
export let SHOT_DECAY = 0.5;

export function setShotDecay(v: number) {
  SHOT_DECAY = Math.max(0, Math.min(1, v));
}

/**
 * A lock pays for the balls it adds (`joined`, the smaller side of the merge),
 * and each one pays more the bigger the group it joins (`target`, the larger
 * side): `PAY_LOCK × joined × (1 + target) / 2`. Two single balls pay 3; one
 * ball onto an 8-ball group pays 14.
 *
 * `blacks` is how many of the two balls that touched are black: 0, 1 or 2.
 */
export function lockPay(joined: number, blacks: number, target: number): number {
  const mult = blacks >= 2 ? PAY_BLACK_PAIR : blacks === 1 ? PAY_BLACK : 1;
  return Math.round(PAY_LOCK * joined * ((1 + target) / 2) * mult);
}

/**
 * A peel knocks one ball off a group of `size` balls (counting the ball that
 * leaves) and pays `PAY_PEEL × (1 + size) / 2`: 10 off a 3-ball group, 23 off
 * an 8-ball group. Paying more than this let random bumping outscore aimed
 * play in solo; see the Scoring page in Notion, §11 Peel Growth.
 */
export function peelPay(size: number): number {
  return Math.round(PAY_PEEL * (1 + size) / 2);
}

export function boomPay(count: number, payScale = 1): number {
  return Math.round(PAY_BOOM * count * Math.max(1, count / BOOM_BONUS_FROM) * payScale);
}

export function setColorsCount(count: number) {
  COLORS = Math.max(3, Math.min(6, count));
}

export function setSpecialsToggle(enabled: boolean) {
  SPECIALS = enabled;
}

export function colorOfKind(k: number): string {
  const set = PALETTES[COLORS] || PALETTES[6];
  return BALL_COLORS[set[((k % set.length) + set.length) % set.length]];
}

export function randomKind(): number {
  return Math.floor(Math.random() * COLORS);
}

export function toneOfKind(k: number): number {
  return COLORS > 1 ? (k % COLORS) / (COLORS - 1) : 0.5;
}

export function kindLabel(k: number): string {
  return k < 0 ? '\u2605' : String((k % COLORS) + 1);
}

/**
 * Draws a ball for a player.
 * Note: Special balls (black/white) will NOT appear when players are at a draw in 2P mode (equal score, gap === 0) or when score is 0.
 * In solo mode, the player acts as winner and loser simultaneously once score > 0.
 * Black balls go to the player ahead, at twice the weight of any single colour.
 * White balls go to the player behind, at half the weight of any single colour.
 * The reverse assignment snowballed matches: see the Scoring page in
 * Notion, §9 Special Balls and Catch-Up.
 */
export function drawFor(p?: LauncherPlayer, playersList?: LauncherPlayer[], twoPlayerMode?: boolean): BallOnDeck {
  if (SPECIALS && p) {
    const isTwoPlayer = twoPlayerMode && playersList && playersList.length >= 2;
    let gap = 0;
    let canSpawn = false;

    if (isTwoPlayer) {
      const me = playersList.indexOf(p);
      if (me !== -1 && playersList[me] && playersList[1 - me]) {
        const s1 = playersList[me].score;
        const s2 = playersList[1 - me].score;
        gap = s1 - s2;
        canSpawn = s1 > 0 && s2 > 0 && gap !== 0;
      }
    } else {
      canSpawn = p.score > 0;
      gap = Math.random() < 0.5 ? 1 : -1;
    }

    if (canSpawn) {
      // Black (player ahead, gap > 0) carries twice the weight of any single colour: 2 / (COLORS + 2).
      // White (player behind, gap < 0) carries half the weight of a colour: 1 / (2 * (COLORS + 1)).
      const special: SpecialBallType = gap > 0
        ? (Math.floor(Math.random() * (COLORS + 2)) >= COLORS ? 'black' : null)
        : (Math.floor(Math.random() * (COLORS + 1)) === COLORS && Math.random() < 0.5 ? 'white' : null);
      if (special) return { kind: -1, special, color: special === 'black' ? BLACK : WHITE };
    }
  }
  const kind = randomKind();
  return { kind, color: colorOfKind(kind), special: null };
}
