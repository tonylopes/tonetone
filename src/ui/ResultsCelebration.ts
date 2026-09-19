import { Game } from '../game/GameState';
import { ageEffects } from '../physics/CollisionSolver';
import { PhysicsConfig } from '../physics/Config';
import { panOf } from '../audio/SoundEvents';
import { AudioStore, isOptionsOpen } from '../audio/SynthEngine';
import { playNote, playThud, playRandomGameBoom } from '../audio/Voices';

/**
 * The fireworks over the results card: flashes, floating words and booms, on
 * three independent cadences, confined to the winner's half of the screen.
 *
 * Each cadence keeps the wall-clock time it last fired. That state used to sit
 * in `main.ts` alongside nine other jobs; it belongs to the celebration and
 * nothing else reads it.
 */

let lastFlashTime = 0;
let lastPopTime = 0;
let lastBoomTime = 0;

/**
 * Which player the results celebration belongs to, or -1 for nobody.
 *
 * A draw is credited to player 1, the same way the results card calls it. The
 * AI is player 2 and never gets a celebration: losing to it is not an occasion
 * for fireworks, so when it wins nothing new is spawned.
 */
function celebrationWinner(game: Game): number {
  if (!game.twoPlayer) return 0;
  const p0 = game.players[0]?.score || 0;
  const p1 = game.players[1]?.score || 0;
  const winnerIdx = p0 >= p1 ? 0 : 1;
  if (game.aiOn && winnerIdx === 1) return -1;
  return winnerIdx;
}

/**
 * Vertical band the celebration is allowed to occupy, in screen pixels.
 *
 * Split-screen gives player 1 the bottom half and player 2 the top half (their
 * card is the flipped one), so the celebration stays on the winner's side of
 * the midline instead of spilling onto the loser's board. Solo play owns the
 * whole screen.
 */
function celebrationBand(game: Game, winnerIdx: number, H: number): { top: number; bottom: number } {
  if (!game.twoPlayer) return { top: H * 0.15, bottom: H * 0.85 };
  return winnerIdx === 0 ? { top: H * 0.5, bottom: H } : { top: 0, bottom: H * 0.5 };
}

/** Pick a coordinate inside [lo, hi], falling back to its centre when inverted. */
function randBetween(lo: number, hi: number): number {
  return hi > lo ? lo + Math.random() * (hi - lo) : (lo + hi) / 2;
}

export function updateResultsEffects(game: Game, dt: number, W: number, H: number) {
  const now = performance.now();

  // 1. Age what is on screen. Celebration pops drift upwards as they fade; the
  //    rest of the lifecycle is the solver's, so it is not written out again.
  for (const pop of game.pops) pop.y -= dt * 30;
  ageEffects(game, dt);

  const winnerIdx = celebrationWinner(game);
  if (winnerIdx < 0) return; // AI won — let whatever is still on screen fade and spawn nothing

  const band = celebrationBand(game, winnerIdx, H);

  // 2. Spawn randomized celebratory flashes
  if (game.flashes.length < 5 && now - lastFlashTime > 850 + Math.random() * 1300) {
    lastFlashTime = now;
    const kinds: ('bond' | 'break' | 'spawn' | 'blocked')[] = ['bond', 'break', 'spawn', 'blocked'];
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    // A ring grows to about R*5 before it fades, so inset the spawn by that much
    // to keep the whole ring inside the winner's band.
    const ringReach = PhysicsConfig.R * 5.5;
    const rx = randBetween(Math.max(W * 0.12, ringReach), Math.min(W * 0.88, W - ringReach));
    const ry = randBetween(band.top + ringReach, band.bottom - ringReach);
    game.flashes.push({ x: rx, y: ry, t: 0, kind: k });

    if (AudioStore.soundOn && !isOptionsOpen()) {
      const normX = panOf(rx, W);
      if (k === 'spawn' || k === 'blocked') playRandomGameBoom(normX, 'celebration');
      else playNote(Math.random(), normX, k === 'break' ? 'break' : 'bond', 0.6);
    }
  }

  // Booms on their own cadence, faster than the flashes and independent of them.
  // Tying every boom to a flash capped them at the flash rate and at the half of
  // the flash kinds that map to a boom, which is too sparse for a victory lap.
  if (AudioStore.soundOn && !isOptionsOpen() && now - lastBoomTime > 500 + Math.random() * 900) {
    lastBoomTime = now;
    playRandomGameBoom(Math.random() * 1.6 - 0.8, 'celebration');
  }

  // 3. Spawn randomized celebratory pops
  if (game.pops.length < 4 && now - lastPopTime > 1200 + Math.random() * 1600) {
    lastPopTime = now;
    // Congratulations only. This list used to mix in the in-match event labels
    // (BOND, BOOM, LOCK, PEEL) and invented score pops (+1000, +5000), which
    // read as though something were still being scored on a board that has
    // stopped. Keep the words short — a pop is drawn centred and can spawn as
    // far left as 15% of the width, so a long one clips on a phone.
    const celebrationTexts = ['WINNER!', 'VICTORY!', 'PERFECT!', 'AMAZING!', 'SUPERB!', 'BRAVO!', 'CHAMP!'];
    const txt = celebrationTexts[Math.floor(Math.random() * celebrationTexts.length)];
    // Player 1's pop rises about 70px over its life; player 2's is drawn rotated,
    // so its own drift and its float offset cancel and it stays roughly put.
    const pad = 28;
    const ry = winnerIdx === 1
      ? randBetween(band.top + pad, band.bottom - pad)
      : randBetween(band.top + 70, band.bottom - pad);
    const rx = randBetween(W * 0.15, W * 0.85);
    game.pops.push({ x: rx, y: ry, t: 0, text: txt, who: winnerIdx });

    if (AudioStore.soundOn && !isOptionsOpen() && Math.random() < 0.4) {
      const normX = panOf(rx, W);
      playThud(normX, 0.4);
    }
  }
}
