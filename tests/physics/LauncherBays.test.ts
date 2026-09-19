import { describe, it, expect, beforeEach } from 'vitest';
import {
  mouthRadius,
  bayInset,
  launchPointOf,
  aimDirOf,
  aimMaxReach,
  aimReachOf,
  aimAt,
  throwSpeedOf,
  boomHeatOf,
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

  describe('aimMaxReach & aimReachOf', () => {
    it('calculates aimMaxReach to stay within the player playing area boundary', () => {
      // Wide enough that the height is the tighter of the two bounds.
      expect(aimMaxReach(2000, 600, true)).toBe(600 / 2 - bayInset()); // 300 - 38 = 262
      expect(aimMaxReach(2000, 600, false)).toBe(600 - bayInset()); // 600 - 38 = 562
    });

    it('caps aimMaxReach at half the width so the arrow stays on a portrait screen', () => {
      // A phone in portrait: the bay sits on the centre line and sweeps 180°, so
      // half the width, not the height, is what the arrow has to fit inside.
      expect(aimMaxReach(400, 900, false)).toBe(200); // 200 < 900 - 38
      expect(aimMaxReach(400, 900, true)).toBe(200); // 200 < 450 - 38
    });

    it('grows reach with strength, scaled to the round limit', () => {
      const p = makeLauncher(1);
      p.strength = 0.5;
      const maxReach = aimMaxReach(2000, 600, false); // 562
      expect(aimReachOf(p, 2000, 600, false)).toBeCloseTo(0.5 * maxReach * 1.5);
    });

    it('saturates two thirds up the strength range whatever the screen shape', () => {
      const p = makeLauncher(1);
      // Portrait, where the width bounds the limit, and landscape, where the
      // height does. The arrow has to reach full length at the same strength.
      for (const [W, H] of [[400, 900], [1200, 600]]) {
        const maxReach = aimMaxReach(W, H, false);
        p.strength = 0.66;
        expect(aimReachOf(p, W, H, false)).toBeLessThan(maxReach);
        p.strength = 0.67;
        expect(aimReachOf(p, W, H, false)).toBe(maxReach);
      }
    });

    it('caps reach in 2-player mode so arrow head does not cross the playing area boundary', () => {
      const p = makeLauncher(1);
      p.strength = 1.0;
      const reach = aimReachOf(p, 2000, 600, true);
      const expectedMaxReach = aimMaxReach(2000, 600, true); // 300 - 38 = 262
      expect(reach).toBe(expectedMaxReach);
      // Uncapped reach would be 1.0 * (600 * 0.40) * 1.75 = 420, which exceeds expectedMaxReach (262)
      expect(1.0 * (600 * 0.40) * 1.75).toBeGreaterThan(expectedMaxReach);
    });

    it('caps reach in 1-player mode so arrow head does not cross the top table boundary', () => {
      const p = makeLauncher(1);
      p.strength = 1.0;
      const reach = aimReachOf(p, 2000, 600, false);
      const expectedMaxReach = aimMaxReach(2000, 600, false); // 600 - 38 = 562
      expect(reach).toBe(expectedMaxReach);
    });

    it('keeps the arrow tip on screen at every aim angle a player can reach', () => {
      const W = 400, H = 900; // portrait, where the old height-only bound overshot
      for (const twoPlayer of [false, true]) {
        for (const side of [1, -1]) {
          const p = makeLauncher(side);
          p.strength = 1.0;
          const m = launchPointOf(p, W, H);
          const reach = aimReachOf(p, W, H, twoPlayer);
          for (let deg = -90; deg <= 90; deg += 5) {
            p.aimDeg = deg;
            const dir = aimDirOf(p);
            const tx = m.x + Math.cos(dir) * reach;
            const ty = m.y + Math.sin(dir) * reach;
            expect(tx).toBeGreaterThanOrEqual(0);
            expect(tx).toBeLessThanOrEqual(W);
            expect(ty).toBeGreaterThanOrEqual(0);
            expect(ty).toBeLessThanOrEqual(H);
          }
        }
      }
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

    it('reaches full strength at the edge of the round envelope, in every direction', () => {
      // A drag is scaled by the same bound the arrow is drawn to, so full power
      // sits at the edge of the player's area whichever way they drag.
      for (const [W, H] of [[412, 915], [1024, 768]]) {
        for (const twoPlayer of [false, true]) {
          const reach = aimMaxReach(W, H, twoPlayer);
          const p = makeLauncher(1);
          const m = launchPointOf(p, W, H);
          for (let deg = -90; deg <= 90; deg += 15) {
            const a = (deg * Math.PI) / 180;
            aimAt(p, m.x + Math.sin(a) * reach, m.y - Math.cos(a) * reach, W, H, twoPlayer);
            expect(p.strength).toBeCloseTo(1, 10);
            aimAt(p, m.x + Math.sin(a) * reach / 2, m.y - Math.cos(a) * reach / 2, W, H, twoPlayer);
            expect(p.strength).toBeCloseTo(0.5, 10);
          }
        }
      }
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

    it('consistently applies power multiplier across 1P and 2P modes to enable booming', () => {
      const p = makeLauncher(1);
      p.strength = 1.0;
      const speed1P = throwSpeedOf(p, false);
      const speed2P = throwSpeedOf(p, true);
      expect(speed1P).toBe(speed2P);
      expect(speed1P).toBe(PhysicsConfig.THROW_MAX * PhysicsConfig.DUEL_POWER);
    });

    it('ensures single player shots at the boom threshold exceed boom speed', () => {
      const p = makeLauncher(1);
      p.strength = PhysicsConfig.BOOM_AT;
      const speedAtThreshold = throwSpeedOf(p, false);
      expect(speedAtThreshold).toBeGreaterThanOrEqual(PhysicsConfig.BOOM_SPEED);
    });
  });

  describe('boomHeatOf', () => {
    it('reads 0 at the weakest throw and 1 once the throw would boom', () => {
      const p = makeLauncher(1);

      p.strength = 0;
      expect(boomHeatOf(p, false)).toBe(0);

      // The heat reaches 1 exactly where throwSpeedOf reaches BOOM_SPEED, which
      // is the threshold the arrow used to report by switching colour outright.
      p.strength = 1;
      expect(boomHeatOf(p, false)).toBe(1);
    });

    it('rises with strength and saturates at the threshold rather than at full power', () => {
      const p = makeLauncher(1);
      const heats = [0, 0.1, 0.2, 0.3].map((s) => {
        p.strength = s;
        return boomHeatOf(p, false);
      });
      for (let i = 1; i < heats.length; i++) {
        expect(heats[i]).toBeGreaterThan(heats[i - 1]);
      }

      // Find where it saturates and check that it is the boom threshold, not 1.0
      // strength: a throw that booms is not the hardest throw the bay can make.
      let saturatedAt = 1;
      for (let s = 0; s <= 1; s += 0.01) {
        p.strength = s;
        if (boomHeatOf(p, false) >= 1) { saturatedAt = s; break; }
      }
      expect(saturatedAt).toBeLessThan(1);
      p.strength = saturatedAt;
      // What booms is the speed the ball actually leaves at, which `spawn`
      // multiplies by KICK — the arrow has to answer that question, not the
      // unmultiplied one.
      expect(throwSpeedOf(p, false) * PhysicsConfig.KICK).toBeGreaterThanOrEqual(PhysicsConfig.BOOM_SPEED);
    });

    it('reaches red where the ball really booms, KICK included', () => {
      // At the shipped kick of 1.2x the old pink cue was late: pink at strength
      // 0.35, booming from 0.29. Walk the range and check the heat saturates on
      // the launched speed, not on throwSpeedOf alone.
      const p = makeLauncher(1);
      for (let s = 0; s <= 1; s += 0.01) {
        p.strength = s;
        const booms = throwSpeedOf(p, false) * PhysicsConfig.KICK >= PhysicsConfig.BOOM_SPEED;
        expect(boomHeatOf(p, false) >= 1).toBe(booms);
      }
    });

    it('is the same in solo and in a duel, as the speed behind it is', () => {
      const p = makeLauncher(1);
      p.strength = 0.25;
      expect(boomHeatOf(p, false)).toBe(boomHeatOf(p, true));
    });

    it('is 1 throughout when the knobs put the threshold under the weakest throw', () => {
      // `boom` 0.2 with `maxpower` 600 is a reachable pair, and it means every
      // throw booms. A fully red arrow is then the truth, not a clamp artefact.
      const before = { at: PhysicsConfig.BOOM_AT, max: PhysicsConfig.THROW_MAX };
      try {
        PhysicsConfig.BOOM_AT = 0.2;
        PhysicsConfig.THROW_MAX = 600;
        recalcThresholds(620);
        const p = makeLauncher(1);
        p.strength = 0;
        expect(throwSpeedOf(p, false) * PhysicsConfig.KICK).toBeGreaterThan(PhysicsConfig.BOOM_SPEED);
        expect(boomHeatOf(p, false)).toBe(1);
      } finally {
        PhysicsConfig.BOOM_AT = before.at;
        PhysicsConfig.THROW_MAX = before.max;
        recalcThresholds(620);
      }
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
