/**
 * The headless simulation harness.
 *
 * Runs real matches with no browser, no canvas and no audio, under a seeded
 * `Math.random`, and reports what happened. It drives `advanceFrame` — the same
 * function the browser build's game loop calls — so it always measures the
 * shipping simulation rather than a copy of it.
 */
import { Game, createGame, resetField, startTurns } from '../game/GameState';
import { LauncherPlayer } from '../physics/Types';
import { recalcThresholds } from '../physics/Config';
import { aiAim } from '../game/AI';
import { AudioStore } from '../audio/SynthEngine';
import { FALLBACK_DT, advanceFrame } from './Frame';
import { installSeededRandom, restoreRandom } from './Rng';
import {
  ConfigSnapshot, KnobContext, KnobValue,
  applyKnobDefaults, applyKnobs, readKnobs, restoreConfig, snapshotConfig,
} from './Knobs';
import {
  Invariants, NO_VIOLATION, PlayerTotals, Sample,
  checkInvariants, playerTotals, sampleField, worstOf,
} from './Metrics';

/** Default field size: a 380x620 phone portrait, where the scale factor is 1. */
export const DEFAULT_WIDTH = 380;
export const DEFAULT_HEIGHT = 620;

/**
 * How a launcher is driven.
 *
 * These are proxies for a player, and a weak one is worth naming rather than
 * hiding: `engine-ai` aims at the biggest cluster at a random power and never
 * checks whether the line is clear, so in a crowded field it bleeds most of a
 * shot's speed into whatever it clips. Where the skill under test is shot
 * selection, no policy here represents it — say so instead of reporting the
 * number as a finding.
 */
export type PolicyName = 'engine-ai' | 'fixed' | 'random' | 'sweep';

export type Mode = 'solo' | 'duel' | 'ai' | 'idle';

export interface SimOptions {
  /** Seed for the run. The same seed reproduces the run exactly. */
  seed?: number;
  /** Simulated seconds to run. */
  seconds?: number;
  width?: number;
  height?: number;
  /**
   * `solo` one launcher; `duel` two, both harness-driven; `ai` two, with the
   * shipped AI on player 2; `idle` nobody throws — the do-nothing baseline.
   */
  mode?: Mode;
  /** Knob overrides by id, applied on top of the registry defaults. */
  knobs?: Record<string, KnobValue>;
  /** Per-player aim policy. Player 2 is ignored in `ai` mode. */
  policies?: [PolicyName, PolicyName];
  /** Fixed frame delta. Defaults to 1/60s. */
  dt?: number;
  /** Frames between field samples. Invariants are always checked every frame. */
  sampleEvery?: number;
  /** Set false to skip invariant checking on long balance runs. */
  invariants?: boolean;
  /** Called after every frame, for custom measurements. */
  onFrame?: (game: Game, frame: number, t: number) => void;
}

export interface RunResult {
  seed: number;
  seconds: number;
  frames: number;
  width: number;
  height: number;
  mode: Mode;
  policies: [PolicyName, PolicyName];
  /** Every knob's value as the run actually saw it. */
  knobs: Record<string, KnobValue>;
  players: [PlayerTotals, PlayerTotals];
  /** Largest cluster ever burst. */
  killBig: number;
  /** Clusters burst over the run. */
  killGroups: number;
  /** Balls destroyed over the run. */
  killBalls: number;
  /**
   * Mean cluster size at the moment of bursting. Watch this next to
   * `burstsPerMinute`: frequent bursts of 2 balls are not the same game as
   * occasional bursts of 9, and the per-minute figure alone cannot tell them apart.
   */
  burstSize: number;
  burstsPerMinute: number;
  /** Throws that left the launcher, and throws a blocked bay refused. */
  throws: number;
  blockedThrows: number;
  ballsAvg: number;
  ballsMax: number;
  ballsFinal: number;
  clusterAvg: number;
  clusterMax: number;
  /** Worst invariant reading seen on any frame, and when. */
  worst: Invariants;
  worstAt: number;
  /** Scores at the halfway point and at the end, for paired comparisons. */
  halfTimeScores: [number, number];
  finalScores: [number, number];
  samples: Sample[];
  /** True if the match clock ran out before `seconds` elapsed. */
  endedEarly: boolean;
}

function applyPolicy(
  policy: PolicyName,
  p: LauncherPlayer,
  game: Game,
  width: number,
  height: number,
  t: number
): void {
  switch (policy) {
    case 'engine-ai':
      aiAim(p, game.groups, game.balls, width, height, game.twoPlayer);
      return;
    case 'random':
      p.aimDeg = Math.random() * 180 - 90;
      p.strength = Math.random();
      return;
    case 'sweep':
      // A slow oscillation across the full aim span, at steady three-quarter power.
      p.aimDeg = Math.sin(t * 0.7 + (p.side > 0 ? 0 : Math.PI / 2)) * 80;
      p.strength = 0.75;
      return;
    case 'fixed':
    default:
      return;
  }
}

/**
 * Run one simulated match and report on it.
 *
 * Module-level config (`PhysicsConfig`, the Rules palette, `AudioStore`) is
 * shared mutable state, so the run snapshots it, and restores it along with
 * `Math.random` even if the simulation throws.
 */
export function runSim(opts: SimOptions = {}): RunResult {
  const seed = opts.seed ?? 1;
  const seconds = opts.seconds ?? 60;
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const mode = opts.mode ?? 'solo';
  const dt = opts.dt ?? FALLBACK_DT;
  const sampleEvery = opts.sampleEvery ?? 30;
  const wantInvariants = opts.invariants !== false;
  const policies: [PolicyName, PolicyName] = opts.policies ?? ['engine-ai', 'engine-ai'];

  const snapshot: ConfigSnapshot = snapshotConfig();
  const soundWas = AudioStore.soundOn;

  try {
    // No AudioContext exists under node, so the voices would no-op anyway; turning
    // sound off makes that explicit and keeps the run free of audio side effects.
    AudioStore.soundOn = false;
    installSeededRandom(seed);
    recalcThresholds(height);

    const game = createGame();
    game.twoPlayer = mode === 'duel' || mode === 'ai';
    game.aiOn = mode === 'ai';

    const ctx: KnobContext = { game, height };
    applyKnobDefaults(ctx);
    // Balance runs are windowed by `seconds`, so the match clock is off unless the
    // caller explicitly asked for a match length.
    if (!opts.knobs || !('match' in opts.knobs)) game.matchLen = 0;
    if (opts.knobs) applyKnobs(opts.knobs, ctx);
    recalcThresholds(height);

    resetField(game, width, height);
    startTurns(game);
    game.matchRunning = true;
    // `idle` never fires a throw: lock all reload timers at Infinity so the
    // launcher bays never become ready. (game.turnT was removed in the
    // simultaneous-play refactor; this is the current equivalent guard.)
    if (mode === 'idle') {
      for (const p of game.players) p.reload = Infinity;
    }

    const totalFrames = Math.max(1, Math.round(seconds / dt));
    const halfFrame = Math.floor(totalFrames / 2);

    let clock = 0;
    let worst: Invariants = NO_VIOLATION;
    let worstAt = 0;
    const samples: Sample[] = [];
    let ballsSum = 0, ballsMax = 0;
    let clusterSum = 0, clusterMax = 0, clusterFrames = 0;
    let throws = 0, blockedThrows = 0;
    let halfTimeScores: [number, number] = [0, 0];
    let endedEarly = false;
    let frame = 0;

    for (; frame < totalFrames; frame++) {
      const t = frame * dt;

      if (mode !== 'idle') {
        applyPolicy(policies[0], game.players[0], game, width, height, t);
        // In `ai` mode advanceFrame drives player 2 itself; doing it here too
        // would apply the AI's smoothing twice per frame.
        if (game.twoPlayer && !game.aiOn) {
          applyPolicy(policies[1], game.players[1], game, width, height, t);
        }
      }

      const res = advanceFrame(game, dt, width, height, clock);
      clock = res.clock;

      if (res.threw) throws++;
      else if (res.launched) blockedThrows++;

      let inv: Invariants = NO_VIOLATION;
      if (wantInvariants) {
        inv = checkInvariants(game, width, height);
        // `worst` is the component-wise high-water mark over the whole run, so
        // `worstAt` has to be the moment that mark was last raised. It used to
        // be the moment a separate composite score peaked, which could name a
        // different frame than the one `worst` actually describes.
        const merged = worstOf(worst, inv);
        if (
          merged.overlap !== worst.overlap ||
          merged.frozen !== worst.frozen ||
          merged.outside !== worst.outside
        ) {
          worstAt = t;
        }
        worst = merged;
      }

      ballsSum += game.balls.length;
      if (game.balls.length > ballsMax) ballsMax = game.balls.length;
      let frameMax = 0;
      for (const g of game.groups) if (g.members.length > frameMax) frameMax = g.members.length;
      clusterSum += frameMax;
      clusterFrames++;
      if (frameMax > clusterMax) clusterMax = frameMax;

      if (frame % sampleEvery === 0) {
        // `inv` is this frame's reading, taken above; nothing has moved since.
        samples.push(sampleField(game, t, inv));
      }
      if (frame === halfFrame) {
        halfTimeScores = [game.players[0].score, game.players[1].score];
      }

      opts.onFrame?.(game, frame, t);

      if (game.matchOver) { endedEarly = true; frame++; break; }
    }

    const elapsed = frame * dt;
    const minutes = elapsed / 60 || 1 / 60;

    return {
      seed,
      seconds: elapsed,
      frames: frame,
      width,
      height,
      mode,
      policies,
      knobs: readKnobs(ctx),
      players: [playerTotals(game, 0), playerTotals(game, 1)],
      killBig: game.killBig,
      killGroups: game.killGroups,
      killBalls: game.killBalls,
      burstSize: game.killGroups ? game.killBalls / game.killGroups : 0,
      burstsPerMinute: game.killGroups / minutes,
      throws,
      blockedThrows,
      ballsAvg: ballsSum / Math.max(1, frame),
      ballsMax,
      ballsFinal: game.balls.length,
      clusterAvg: clusterSum / Math.max(1, clusterFrames),
      clusterMax,
      worst,
      worstAt,
      halfTimeScores,
      finalScores: [game.players[0].score, game.players[1].score],
      samples,
      endedEarly,
    };
  } finally {
    restoreRandom();
    restoreConfig(snapshot);
    AudioStore.soundOn = soundWas;
  }
}

/**
 * Run the same configuration across consecutive seeds. One run of a chaotic
 * simulation is an anecdote; the repeat count is what makes it a measurement.
 */
export function runMany(opts: SimOptions, runs: number, firstSeed = 1): RunResult[] {
  const out: RunResult[] = [];
  for (let i = 0; i < runs; i++) out.push(runSim({ ...opts, seed: firstSeed + i }));
  return out;
}

/** Pull one number out of each run, for the statistics helpers. */
export type Extractor = (r: RunResult) => number;

export const EXTRACTORS: Record<string, Extractor> = {
  score: r => r.players[0].score + r.players[1].score,
  p1score: r => r.players[0].score,
  p2score: r => r.players[1].score,
  bursts: r => r.killGroups,
  burstSize: r => r.burstSize,
  burstsPerMinute: r => r.burstsPerMinute,
  ballsDestroyed: r => r.killBalls,
  biggestBurst: r => r.killBig,
  locks: r => r.players[0].locks + r.players[1].locks,
  peels: r => r.players[0].peels + r.players[1].peels,
  ballsAvg: r => r.ballsAvg,
  ballsFinal: r => r.ballsFinal,
  clusterAvg: r => r.clusterAvg,
  clusterMax: r => r.clusterMax,
  bestCluster: r => Math.max(r.players[0].best, r.players[1].best),
  throws: r => r.throws,
};

export function extractorNames(): string[] {
  return Object.keys(EXTRACTORS);
}

export function extract(name: string): Extractor {
  const f = EXTRACTORS[name];
  if (!f) throw new Error(`Unknown metric "${name}". Known metrics: ${extractorNames().join(', ')}`);
  return f;
}
