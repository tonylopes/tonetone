import { describe, it, expect, beforeEach } from 'vitest';
import {
  mouthRadius,
  bayInset,
  launchPointOf,
  aimDirOf,
  aimSpan,
  aimMaxReach,
  aimReachOf,
  aimAt,
  throwSpeedOf,
  mouthNormalAt,
  clearExempt,
} from '../../src/physics/LauncherBays';
import { PhysicsConfig, recalcThresholds } from '../../src/physics/Config';
import { Ball, LauncherPlayer } from '../../src/physics/Types';
import { makeLauncher } from '../../src/game/GameState';

describe('LauncherBays module', () => {
  beforeEach(() => {
    recalcThresholds(620);
  });

  it('computes mouth radius and bay inset', () => {
    expect(mouthRadius()).toBe(PhysicsConfig.R * 2);
    expect(bayInset()).toBe(PhysicsConfig.R * 3 + 2);
  });

  describe('launchPointOf', () => {
    it('calculates launch point for bottom launcher (side > 0)', () => {
      const p = makeLauncher(1);
      const point = launchPointOf(p, 800, 600);
      expect(point.x).toBe(400);
      expect(point.y).toBe(600 - bayInset());
    });

    it('calculates launch point for top launcher (side < 0)', () => {
      const p = makeLauncher(-1);
      const point = launchPointOf(p, 800, 600);
      expect(point.x).toBe(400);
      expect(point.y).toBe(bayInset());
    });
  });

  describe('aimDirOf', () => {
    it('converts aim angle in degrees to radians for side > 0', () => {
      const p = makeLauncher(1);
      p.aimDeg = 0;
      expect(aimDirOf(p)).toBeCloseTo(-Math.PI / 2);

      p.aimDeg = 45;
      expect(aimDirOf(p)).toBeCloseTo(-Math.PI / 2 + (45 * Math.PI) / 180);
    });

    it('converts aim angle in degrees to radians for side < 0', () => {
      const p = makeLauncher(-1);
      p.aimDeg = 0;
      expect(aimDirOf(p)).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('aimSpan, aimMaxReach & aimReachOf', () => {
    it('calculates aim span based on twoPlayer flag', () => {
      expect(aimSpan(600, false)).toBe(600 * 0.80);
      expect(aimSpan(600, true)).toBe(600 * 0.40);
    });

    it('calculates aimMaxReach to stay within the player playing area boundary', () => {
      expect(aimMaxReach(600, true)).toBe(600 / 2 - bayInset()); // 300 - 38 = 262
      expect(aimMaxReach(600, false)).toBe(600 - bayInset()); // 600 - 38 = 562
    });

    it('calculates reach based on strength with extension past finger point', () => {
      const p = makeLauncher(1);
      p.strength = 0.5;
      expect(aimReachOf(p, 600, false)).toBeCloseTo(0.5 * 600 * 0.80 * 1.75);
    });

    it('caps reach in 2-player mode so arrow head does not cross the playing area boundary', () => {
      const p = makeLauncher(1);
      p.strength = 1.0;
      const reach = aimReachOf(p, 600, true);
      const expectedMaxReach = aimMaxReach(600, true); // 300 - 38 = 262
      expect(reach).toBe(expectedMaxReach);
      // Uncapped reach would be 1.0 * (600 * 0.40) * 1.75 = 420, which exceeds expectedMaxReach (262)
      expect(1.0 * (600 * 0.40) * 1.75).toBeGreaterThan(expectedMaxReach);
    });

    it('caps reach in 1-player mode so arrow head does not cross the top table boundary', () => {
      const p = makeLauncher(1);
      p.strength = 1.0;
      const reach = aimReachOf(p, 600, false);
      const expectedMaxReach = aimMaxReach(600, false); // 600 - 38 = 562
      expect(reach).toBe(expectedMaxReach);
    });
  });

  describe('aimAt', () => {
    it('sets aimDeg and strength toward target coordinate', () => {
      const p = makeLauncher(1); // side > 0, bottom launcher at (400, 500)
      const width = 800, height = 538; // bay inset is 38, so launchPoint = (400, 500)
      aimAt(p, 400, 300, width, height, false);

      // Aiming straight up -> dx = 0, dy = -200 -> raw = atan2(0, 200) = 0
      expect(p.aimDeg).toBe(0);
      expect(p.strength).toBeGreaterThan(0);
    });

    it('clamps aimDeg between -90 and +90', () => {
      const p = makeLauncher(1);
      aimAt(p, 10000, 500, 800, 600, false);
      expect(p.aimDeg).toBeLessThanOrEqual(90);

      aimAt(p, -10000, 500, 800, 600, false);
      expect(p.aimDeg).toBeGreaterThanOrEqual(-90);
    });
  });

  describe('throwSpeedOf', () => {
    it('calculates throw speed scaling with power curve and power multiplier', () => {
      const p = makeLauncher(1);
      p.strength = 1.0;
      const maxSpeed = throwSpeedOf(p, false);
      expect(maxSpeed).toBeCloseTo(PhysicsConfig.THROW_MAX * PhysicsConfig.DUEL_POWER);

      p.strength = 0.0;
      const minSpeed = throwSpeedOf(p, false);
      expect(minSpeed).toBeCloseTo(PhysicsConfig.THROW_MIN * PhysicsConfig.DUEL_POWER);
    });

    it('consistently applies power multiplier across 1P and 2P modes to enable bursting', () => {
      const p = makeLauncher(1);
      p.strength = 1.0;
      const speed1P = throwSpeedOf(p, false);
      const speed2P = throwSpeedOf(p, true);
      expect(speed1P).toBe(speed2P);
      expect(speed1P).toBe(PhysicsConfig.THROW_MAX * PhysicsConfig.DUEL_POWER);
    });

    it('ensures single player shots at burst threshold exceed shatter speed', () => {
      const p = makeLauncher(1);
      p.strength = PhysicsConfig.BURST_AT;
      const speedAtThreshold = throwSpeedOf(p, false);
      expect(speedAtThreshold).toBeGreaterThanOrEqual(PhysicsConfig.SHATTER_SPEED);
    });
  });

  describe('mouthNormalAt', () => {
    it('detects penetration depth when ball is inside launcher mouth', () => {
      const m = { x: 400, y: 500 };
      const ball: Ball = { x: 400, y: 510 } as any; // distance = 10, mouth radius + R = 24 + 12 = 36
      const col = mouthNormalAt(ball, m, 600);
      expect(col).not.toBeNull();
      expect(col!.pen).toBe(36 - 10);
      expect(col!.nx).toBe(0);
      expect(col!.ny).toBe(1);
    });

    it('returns null when ball is outside mouth radius', () => {
      const m = { x: 400, y: 500 };
      const ball: Ball = { x: 400, y: 300 } as any; // distance = 200 > 36
      const col = mouthNormalAt(ball, m, 600);
      expect(col).toBeNull();
    });
  });

  describe('clearExempt', () => {
    it('decrements exempt timer and clears immunity when ball leaves launcher bay', () => {
      const p = makeLauncher(1);
      const players = [p];
      const ball: Ball = { x: 400, y: 100, exempt: 1.6 } as any; // far from bay
      const balls = [ball];

      clearExempt(balls, players, 0.1, 800, 600);
      expect(ball.exempt).toBe(0);
    });

    it('retains exempt status while inside bay if exempt timer > 0', () => {
      const p = makeLauncher(1); // bottom launcher at y = 562
      const lp = launchPointOf(p, 800, 600);
      const players = [p];
      const ball: Ball = { x: lp.x, y: lp.y, exempt: 1.6 } as any;
      const balls = [ball];

      clearExempt(balls, players, 0.1, 800, 600);
      expect(ball.exempt).toBeCloseTo(1.5);
    });
  });
});
