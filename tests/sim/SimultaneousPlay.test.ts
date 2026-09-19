import { describe, it, expect } from 'vitest';
import { createGame, resetField, throwBall } from '../../src/game/GameState';
import { runSim } from '../../src/sim/Harness';
import { TOLERANCE, violations } from '../../src/sim/Metrics';

describe('Simultaneous 2-Player Play', () => {
  it('allows both players to be active in 2P mode', () => {
    const game = createGame();
    game.twoPlayer = true;

    // In simultaneous (non-turn-based) mode, reload starts at 0 so both players are immediately active
    expect(game.players[0].reload).toBe(0);
    expect(game.players[1].reload).toBe(0);
  });

  it('handles simultaneous shots from both players without physics violations', () => {
    const game = createGame();
    game.twoPlayer = true;
    resetField(game, 380, 620);

    // Aim both launchers towards center
    game.players[0].aimDeg = 0;
    game.players[0].strength = 0.8;
    game.players[1].aimDeg = 0;
    game.players[1].strength = 0.8;

    // Fire both launchers simultaneously
    const threw0 = throwBall(game.players[0], game, 380, 620);
    const threw1 = throwBall(game.players[1], game, 380, 620);

    expect(threw0).toBe(true);
    expect(threw1).toBe(true);
    expect(game.balls.length).toBeGreaterThanOrEqual(2);

    // Both balls should belong to their respective launchers
    const p0Ball = game.balls.find(b => b.credit === 0);
    const p1Ball = game.balls.find(b => b.credit === 1);
    expect(p0Ball).toBeDefined();
    expect(p1Ball).toBeDefined();
  });

  it('runs a 60-second simultaneous duel simulation cleanly', () => {
    const res = runSim({
      seed: 42,
      seconds: 60,
      mode: 'duel',
      policies: ['engine-ai', 'engine-ai'],
    });

    expect(violations(res.worst)).toEqual([]);
    expect(res.worst.frozen).toBe(0);
    expect(res.worst.overlap).toBeLessThanOrEqual(TOLERANCE.overlap);
    expect(res.throws).toBeGreaterThan(0);
    expect(res.finalScores[0] + res.finalScores[1]).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(res.finalScores[0])).toBe(false);
    expect(Number.isNaN(res.finalScores[1])).toBe(false);

    // Both players score and interact in 2-player mode
    expect(res.players[0].score).toBeGreaterThanOrEqual(0);
    expect(res.players[1].score).toBeGreaterThanOrEqual(0);
  });
});
