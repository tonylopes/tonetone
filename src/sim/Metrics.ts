/**
 * What the harness measures, and the invariants it refuses to let slide.
 *
 * Every cumulative count here is read from the game's own bookkeeping — player
 * scores, `killGroups`, `killBalls` — rather than from a parallel tally kept by
 * the harness. A harness that counts events itself can disagree with the
 * scoreboard the player sees; this one cannot.
 */
import { Game } from '../game/GameState';
import { PhysicsConfig } from '../physics/Config';
import { forEachPair } from '../physics/CollisionSolver';

export interface Invariants {
  /**
   * Deepest overlap between balls of *different* groups, in px.
   *
   * Balls still fading in are excluded, because the collider excludes them too:
   * a rain ball is intangible for its first second and is *expected* to appear
   * inside a resting group. Measuring those pairs reports a design feature as
   * a violation — they routinely reach 22px, and drown out the 0.02px signal
   * that actually matters.
   */
  overlap: number;
  /**
   * Deepest overlap between two balls in the *same* group, in px. Group members
   * hold fixed offsets, so any overlap baked in at bond time is permanent and
   * visible forever — this must be zero, not merely small.
   */
  frozen: number;
  /** Deepest penetration past a wall, in px. */
  outside: number;
  /** Balls excluded from the overlap check this frame because they were fading in. */
  fading: number;
}

export const NO_VIOLATION: Invariants = { overlap: 0, frozen: 0, outside: 0, fading: 0 };

/**
 * Tolerances for a passing run.
 *
 * The relaxation pass leaves at most its own SLOP of 0.02px, and a healthy build
 * measures 0.0199px across every mode and seed, so 0.05px is tight enough to
 * catch a real solver regression while leaving headroom for rounding. `frozen`
 * is the strict one: group members hold fixed offsets, so overlap baked in at
 * bond time never resolves and must be exactly zero.
 */
export const TOLERANCE: Invariants = {
  overlap: 0.05,
  frozen: 1e-9,
  outside: 0.05,
  fading: Infinity,
};

/** Measure the three geometric invariants over the current field. */
export function checkInvariants(game: Game, width: number, height: number): Invariants {
  const R = PhysicsConfig.R;
  const min = 2 * R;
  let overlap = 0, frozen = 0, outside = 0, fading = 0;

  for (const b of game.balls) {
    outside = Math.max(outside, R - b.x, R - b.y, b.x - (width - R), b.y - (height - R));
    if (b.rainTime && b.rainTime > 0) fading++;
  }

  // The solver's own broadphase: any pair closer than 2R lands in adjacent cells,
  // so this visits every overlapping pair without the O(n^2) sweep.
  forEachPair(game.balls, (a, b) => {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const ov = min - d;
    if (ov <= 0) return;
    // Mirror the collider's exclusion exactly, or the check cries wolf.
    if ((a.rainTime && a.rainTime > 0) || (b.rainTime && b.rainTime > 0)) return;
    if (a.group === b.group) {
      if (ov > frozen) frozen = ov;
    } else if (ov > overlap) {
      overlap = ov;
    }
  });

  return { overlap, frozen, outside: Math.max(0, outside), fading };
}

export function worstOf(a: Invariants, b: Invariants): Invariants {
  return {
    overlap: Math.max(a.overlap, b.overlap),
    frozen: Math.max(a.frozen, b.frozen),
    outside: Math.max(a.outside, b.outside),
    fading: Math.max(a.fading, b.fading),
  };
}

export function violations(inv: Invariants, tol: Invariants = TOLERANCE): string[] {
  const out: string[] = [];
  if (inv.overlap > tol.overlap) out.push(`cross-group overlap ${inv.overlap.toFixed(3)}px > ${tol.overlap}px`);
  if (inv.frozen > tol.frozen) out.push(`frozen in-group overlap ${inv.frozen.toFixed(6)}px must be zero`);
  if (inv.outside > tol.outside) out.push(`ball outside the field by ${inv.outside.toFixed(3)}px > ${tol.outside}px`);
  return out;
}

/** A point-in-time reading of the field. */
export interface Sample {
  t: number;
  balls: number;
  ghosts: number;
  groups: number;
  /** Size of the largest bonded group currently on the field. */
  maxGroup: number;
  /** Mean size of groups of 2 or more. */
  avgGroup: number;
  /** Balls that are part of some group of 2 or more. */
  bonded: number;
  scores: [number, number];
  invariants: Invariants;
}

export function sampleField(game: Game, t: number, inv: Invariants): Sample {
  let ghosts = 0;
  for (const b of game.balls) if (b.ghost) ghosts++;

  let maxGroup = 0, groupCount = 0, groupBalls = 0;
  for (const g of game.groups) {
    const n = g.members.length;
    if (n > maxGroup) maxGroup = n;
    if (n >= 2) { groupCount++; groupBalls += n; }
  }

  return {
    t,
    balls: game.balls.length,
    ghosts,
    groups: game.groups.length,
    maxGroup,
    avgGroup: groupCount ? groupBalls / groupCount : 0,
    bonded: groupBalls,
    scores: [game.players[0].score, game.players[1].score],
    invariants: inv,
  };
}

/** Per-player cumulative totals, taken straight off the launcher record. */
export interface PlayerTotals {
  score: number;
  locks: number;
  booms: number;
  peels: number;
  destroyed: number;
  best: number;
  lockPts: number;
  boomPts: number;
  peelPts: number;
}

export function playerTotals(game: Game, index: number): PlayerTotals {
  const p = game.players[index];
  return {
    score: p.score,
    locks: p.locks,
    booms: p.booms,
    peels: p.peels,
    destroyed: p.destroyed,
    best: p.best,
    lockPts: p.lockPts,
    boomPts: p.boomPts,
    peelPts: p.peelPts,
  };
}
