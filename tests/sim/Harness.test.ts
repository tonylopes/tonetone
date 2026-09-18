import { describe, it, expect } from 'vitest';
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, extract, runMany, runSim } from '../../src/sim/Harness';
import { PhysicsConfig } from '../../src/physics/Config';
import { COLORS } from '../../src/game/Rules';
import { TOLERANCE, violations } from '../../src/sim/Metrics';
import { mulberry32, currentSeed, withSeed } from '../../src/sim/Rng';
import { advanceFrame, normalizeDt, substepCount, FALLBACK_DT, MAX_FRAME_DT } from '../../src/sim/Frame';
import { createGame, resetField, startTurns } from '../../src/game/GameState';

const SHORT = { seconds: 6, sampleEvery: 10 } as const;

describe('seeded randomness', () => {
  it('reproduces a stream from a seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    const xs = Array.from({ length: 20 }, () => a());
    const ys = Array.from({ length: 20 }, () => b());
    expect(xs).toEqual(ys);
    expect(xs.every(v => v >= 0 && v < 1)).toBe(true);
  });

  it('produces different streams for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('restores the native Math.random after use', () => {
    const native = Math.random;
    const inside = withSeed(7, () => {
      expect(currentSeed()).toBe(7);
      return Math.random;
    });
    expect(inside).not.toBe(native);
    expect(Math.random).toBe(native);
    expect(currentSeed()).toBeNull();
  });
});

describe('frame guards', () => {
  it('replaces a non-positive or oversized delta with the fallback', () => {
    expect(normalizeDt(0)).toBe(FALLBACK_DT);
    // A negative dt used to drive the simulation clock backwards, which made
    // every collision fail its cooldown check and silently disabled bonding.
    expect(normalizeDt(-0.5)).toBe(FALLBACK_DT);
    expect(normalizeDt(NaN)).toBe(FALLBACK_DT);
    expect(normalizeDt(MAX_FRAME_DT + 0.01)).toBe(FALLBACK_DT);
    expect(normalizeDt(1 / 120)).toBe(1 / 120);
  });

  it('substeps between 2 and 8 according to the fastest group', () => {
    const game = createGame();
    expect(substepCount(game, 1 / 60)).toBe(2);
    resetField(game, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    for (const g of game.groups) { g.vx = 100000; g.vy = 0; }
    expect(substepCount(game, 1 / 60)).toBe(8);
  });

  it('never advances the clock backwards, even on a bad delta', () => {
    const game = createGame();
    resetField(game, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    startTurns(game);
    let clock = 0;
    for (const bad of [-1, 0, NaN, 10, 1 / 60]) {
      const next = advanceFrame(game, bad, DEFAULT_WIDTH, DEFAULT_HEIGHT, clock).clock;
      expect(next).toBeGreaterThan(clock);
      clock = next;
    }
  });

  it('does not advance simulation when game is paused', () => {
    const game = createGame();
    resetField(game, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    game.paused = true;
    const initialClock = 5.0;
    const res = advanceFrame(game, 1 / 60, DEFAULT_WIDTH, DEFAULT_HEIGHT, initialClock);
    expect(res.clock).toBe(initialClock);
    expect(res.dt).toBe(0);
    expect(res.substeps).toBe(0);
  });
});

describe('runSim determinism', () => {
  it('reproduces a run exactly from the same seed', () => {
    const a = runSim({ ...SHORT, seed: 99, mode: 'duel' });
    const b = runSim({ ...SHORT, seed: 99, mode: 'duel' });
    expect(b.finalScores).toEqual(a.finalScores);
    expect(b.killGroups).toBe(a.killGroups);
    expect(b.killBalls).toBe(a.killBalls);
    expect(b.ballsFinal).toBe(a.ballsFinal);
    expect(b.ballsAvg).toBe(a.ballsAvg);
  });

  it('produces different outcomes for different seeds', () => {
    const seeds = runMany({ ...SHORT, seconds: 30, mode: 'ai' }, 4).map(r => r.finalScores.join('/'));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('leaves shared config untouched after a run', () => {
    const before = { ...PhysicsConfig };
    const colorsBefore = COLORS;
    runSim({ ...SHORT, knobs: { bounce: 0.55, colours: 6, size: 20, burst: 0.9 } });
    expect({ ...PhysicsConfig }).toEqual(before);
    expect(COLORS).toBe(colorsBefore);
  });

  it('restores config even when the simulation throws', () => {
    const before = { ...PhysicsConfig };
    expect(() =>
      runSim({
        ...SHORT,
        knobs: { bounce: 0.6 },
        onFrame: () => { throw new Error('boom'); },
      })
    ).toThrow('boom');
    expect({ ...PhysicsConfig }).toEqual(before);
  });
});

describe('runSim behaviour', () => {
  it('applies knob overrides on top of the registry defaults', () => {
    const r = runSim({ ...SHORT, knobs: { minburst: 5, spread: 1.25 } });
    expect(r.knobs.minburst).toBe(5);
    expect(r.knobs.spread).toBe(1.25);
    // Untouched knobs keep their documented defaults.
    expect(r.knobs.bounce).toBe(0.94);
  });

  it('throws balls in play modes and none when idle', () => {
    expect(runSim({ ...SHORT, seconds: 30, mode: 'solo' }).throws).toBeGreaterThan(0);
    expect(runSim({ ...SHORT, seconds: 30, mode: 'idle' }).throws).toBe(0);
  });

  it('scores only the active player in solo mode', () => {
    const r = runSim({ seconds: 30, mode: 'solo', seed: 3 });
    expect(r.players[1].score).toBe(0);
  });

  it('lets both launchers score in duel mode', () => {
    const r = runSim({ seconds: 60, mode: 'duel', seed: 1 });
    expect(r.players[0].score).toBeGreaterThan(0);
    expect(r.players[1].score).toBeGreaterThan(0);
  });

  it('stops early when a match length is set', () => {
    const r = runSim({ seconds: 120, mode: 'solo', knobs: { match: 30 } });
    expect(r.endedEarly).toBe(true);
    expect(r.seconds).toBeLessThan(40);
  });

  it('runs endlessly by default so the window is set by seconds', () => {
    const r = runSim({ seconds: 20, mode: 'solo' });
    expect(r.endedEarly).toBe(false);
    expect(r.seconds).toBeCloseTo(20, 1);
  });

  it('reports metrics every extractor can read', () => {
    const r = runSim({ seconds: 30, mode: 'duel', seed: 2 });
    for (const name of ['score', 'bursts', 'burstSize', 'clusterMax', 'throws']) {
      expect(Number.isFinite(extract(name)(r)), name).toBe(true);
    }
  });

  it('rejects an unknown metric name', () => {
    expect(() => extract('vibes')).toThrow(/Unknown metric/);
  });
});

describe('invariants in real matches', () => {
  for (const mode of ['solo', 'duel', 'ai'] as const) {
    it(`holds every frame in ${mode} play`, () => {
      const r = runSim({ seconds: 45, mode, seed: 4 });
      expect(violations(r.worst), `worst at t=${r.worstAt}s`).toEqual([]);
      // Group members hold fixed offsets, so any overlap baked in at bond time
      // is permanent and visible forever.
      expect(r.worst.frozen).toBe(0);
      expect(r.worst.overlap).toBeLessThanOrEqual(TOLERANCE.overlap);
    });
  }

  it('holds on a short field, where px/s speeds cross faster', () => {
    const r = runSim({ seconds: 45, mode: 'duel', seed: 5, height: 460 });
    expect(violations(r.worst)).toEqual([]);
  });

  it('holds on a tablet-sized field', () => {
    const r = runSim({ seconds: 45, mode: 'duel', seed: 5, width: 768, height: 1024 });
    expect(violations(r.worst)).toEqual([]);
  });

  it('holds with balls at their largest and bounciest', () => {
    const r = runSim({ seconds: 45, mode: 'duel', seed: 6, knobs: { size: 26, bounce: 1, speedcap: 3600, kick: 2.5 } });
    expect(violations(r.worst)).toEqual([]);
  });
});
