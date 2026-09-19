/**
 * The headless simulation harness.
 *
 * Runs real matches with no browser, no canvas and no audio, under a seeded
 * `Math.random`, and reports what happened. It drives `advanceFrame` — the same
 * function the browser build's game loop calls — so it always measures the
 * shipping simulation rather than a copy of it.
 */
import {
  Game, PlayMode, createGame, liveBallCount, lowDensityThreshold, resetField, startMatch,
} from '../game/GameState';
import { LauncherPlayer, Shot } from '../physics/Types';
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
import { catchUp } from './Stats';

/** Default field size: a 380x620 phone portrait, where the scale factor is 1. */
export const DEFAULT_WIDTH = 380;
export const DEFAULT_HEIGHT = 620;

/**
 * Scoring events from one throw that make it a "long chain".
 *
 * A throw that locks and then booms has 2 events and is an ordinary good shot:
 * across the three shipped presets the median throw scores exactly 2, and the
 * 90th percentile is 7. Eight is therefore the top decile — the cascade a player
 * actually notices, where a boom's debris reaches a second group whose debris
 * reaches a third. Measured at 9.2% of throws under Normal, 11.1% under Relax
 * and 4.3% under Chaos, which is enough spread for the figure to discriminate
 * between presets rather than saturate.
 */
export const LONG_CHAIN = 8;

/**
 * How a launcher is driven.
 *
 * These are proxies for a player, and a weak one is worth naming rather than
 * hiding: `engine-ai` aims at the biggest group at a random power and never
 * checks whether the line is clear, so in a crowded field it bleeds most of a
 * shot's speed into whatever it clips. Where the skill under test is shot
 * selection, no policy here represents it — say so instead of reporting the
 * number as a finding.
 */
export type PolicyName = 'engine-ai' | 'fixed' | 'random' | 'sweep';

export type Mode = PlayMode | 'idle';

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
  /** Largest group ever boomed. */
  killBig: number;
  /** Groups boomed over the run. */
  killGroups: number;
  /** Balls destroyed over the run. */
  killBalls: number;
  /**
   * Mean group size at the moment of booming. Watch this next to
   * `boomsPerMinute`: frequent booms of 2 balls are not the same game as
   * occasional booms of 9, and the per-minute figure alone cannot tell them apart.
   */
  boomSize: number;
  boomsPerMinute: number;
  /** Throws that left the launcher. */
  throws: number;
  /**
   * Fire attempts a blocked bay refused.
   *
   * A refusal does not consume the reload, so a bay with balls parked in front
   * of it retries on *every* frame until the corridor clears. This is therefore
   * a count of refused frames, not of refused turns: one blocked second is 60.
   * Read `blockedFrac` for the figure with a meaningful denominator.
   */
  blockedThrows: number;
  /**
   * Share of launcher-time spent ready but refused — blocked frames over all
   * frames both bays were live.
   *
   * Normalised by time rather than by fire attempts, because attempts are
   * inflated by the 60Hz retry above: a field that refused 72% of *attempts*
   * turned out to have stopped a launcher for only 1.4% of the match. The
   * time-based figure is the one that describes what a player would feel.
   */
  blockedFrac: number;
  ballsAvg: number;
  ballsMax: number;
  ballsMin: number;
  ballsFinal: number;
  /** Live (non-ghost) balls: the playable material, excluding boom debris. */
  liveAvg: number;
  liveMin: number;
  /**
   * Share of frames spent below the game's own low-density threshold — the
   * point at which auto rain starts refilling the table. High means the field
   * keeps emptying out and the player is waiting for material.
   */
  starvedFrac: number;
  /**
   * Scoring events traceable to one throw, over every throw that reached the
   * field. `chainAvg` counts throws that scored nothing as zero, so it is the
   * mean yield of a throw rather than of a successful one.
   */
  chainAvg: number;
  chainBest: number;
  /** Share of throws whose cascade reached `LONG_CHAIN` scoring events. */
  chainLongFrac: number;
  /**
   * Times the lead changed hands. Only meaningful with two launchers playing;
   * a solo run reports 0.
   */
  leadChanges: number;
  groupAvg: number;
  groupMax: number;
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
    // Countdown 0: the harness fires on the first frame. The browser holds fire for
    // one reload instead, so a measured match is very slightly longer than a played
    // one at the same `seconds`. Unmeasured; see the Simulation Harness page.
    startMatch(game, 0);
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
    let ballsSum = 0, ballsMax = 0, ballsMin = Infinity;
    let liveSum = 0, liveMin = Infinity, starvedFrames = 0;
    let groupSum = 0, groupMax = 0, groupFrames = 0;
    let throws = 0, blockedThrows = 0;
    let leadChanges = 0, leadSign = 0;
    const starveAt = lowDensityThreshold(width, height);
    /**
     * Every throw's tally object, gathered off the balls that carry it.
     *
     * `Shot.events` is incremented in place by the solver and only ever grows,
     * so holding the object is enough to read a chain's final depth after the
     * run: there is no need to poll the number. Collecting them here rather than
     * counting inside the solver keeps the measurement out of the shipping
     * physics — the baseline is unmoved by the act of measuring it.
     */
    const shots = new Set<Shot>();
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

      throws += res.threw;
      blockedThrows += res.fired - res.threw;

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
      if (game.balls.length < ballsMin) ballsMin = game.balls.length;

      const live = liveBallCount(game);
      liveSum += live;
      if (live < liveMin) liveMin = live;
      if (live < starveAt) starvedFrames++;

      for (const b of game.balls) if (b.shot) shots.add(b.shot);

      // A lead change is a sign flip of the score difference. A tie is not a
      // change of hands on its own — the lead has to come out the other side —
      // so a zero gap holds the previous sign rather than clearing it.
      if (game.twoPlayer) {
        const gap = game.players[0].score - game.players[1].score;
        const sign = gap > 0 ? 1 : gap < 0 ? -1 : 0;
        if (sign !== 0) {
          if (leadSign !== 0 && sign !== leadSign) leadChanges++;
          leadSign = sign;
        }
      }

      let frameMax = 0;
      for (const g of game.groups) if (g.members.length > frameMax) frameMax = g.members.length;
      groupSum += frameMax;
      groupFrames++;
      if (frameMax > groupMax) groupMax = frameMax;

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

    const depths = [...shots].map(sh => sh.events);
    const chainAvg = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
    const chainBest = depths.reduce((a, b) => Math.max(a, b), 0);
    const chainLongFrac = depths.length
      ? depths.filter(d => d >= LONG_CHAIN).length / depths.length
      : 0;
    // Launcher-frames available over the run: one per active bay per frame.
    const launcherFrames = Math.max(1, frame) * (game.twoPlayer ? 2 : 1);

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
      boomSize: game.killGroups ? game.killBalls / game.killGroups : 0,
      boomsPerMinute: game.killGroups / minutes,
      throws,
      blockedThrows,
      blockedFrac: blockedThrows / launcherFrames,
      ballsAvg: ballsSum / Math.max(1, frame),
      ballsMax,
      ballsMin: Number.isFinite(ballsMin) ? ballsMin : 0,
      ballsFinal: game.balls.length,
      liveAvg: liveSum / Math.max(1, frame),
      liveMin: Number.isFinite(liveMin) ? liveMin : 0,
      starvedFrac: starvedFrames / Math.max(1, frame),
      chainAvg,
      chainBest,
      chainLongFrac,
      leadChanges,
      groupAvg: groupSum / Math.max(1, groupFrames),
      groupMax,
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
  booms: r => r.killGroups,
  boomSize: r => r.boomSize,
  boomsPerMinute: r => r.boomsPerMinute,
  ballsDestroyed: r => r.killBalls,
  biggestBoom: r => r.killBig,
  locks: r => r.players[0].locks + r.players[1].locks,
  peels: r => r.players[0].peels + r.players[1].peels,
  ballsAvg: r => r.ballsAvg,
  ballsFinal: r => r.ballsFinal,
  groupAvg: r => r.groupAvg,
  groupMax: r => r.groupMax,
  bestGroup: r => Math.max(r.players[0].best, r.players[1].best),
  throws: r => r.throws,

  // The five qualities a preset is judged on, each as one number.
  /** Long chains: mean and best cascade depth, and how often a cascade runs long. */
  chainAvg: r => r.chainAvg,
  chainBest: r => r.chainBest,
  chainLongFrac: r => r.chainLongFrac,
  /** Blocking: the share of fires the table refused. Lower is better. */
  blockedFrac: r => r.blockedFrac,
  blockedThrows: r => r.blockedThrows,
  /** Density: playable material on the table, and how often it ran out. */
  liveAvg: r => r.liveAvg,
  liveMin: r => r.liveMin,
  starvedFrac: r => r.starvedFrac,
  ballsMin: r => r.ballsMin,
  /**
   * Catch-up: ground the half-time trailer recovered, and lead changes. Both
   * need two launchers; in solo they are a constant 0 and mean nothing.
   */
  catchUp: r => catchUp(r.halfTimeScores, r.finalScores),
  leadChanges: r => r.leadChanges,
};

export function extractorNames(): string[] {
  return Object.keys(EXTRACTORS);
}

export function extract(name: string): Extractor {
  const f = EXTRACTORS[name];
  if (!f) throw new Error(`Unknown metric "${name}". Known metrics: ${extractorNames().join(', ')}`);
  return f;
}
