import { describe, it, expect, beforeEach } from 'vitest';
import {
  forEachPair,
  award,
  explode,
  detach,
  ageGhosts,
  resolveWalls,
  collide,
  relax,
  stepPhysics,
  CollisionState,
} from '../../src/physics/CollisionSolver';
import { PhysicsConfig, recalcThresholds } from '../../src/physics/Config';
import { Ball } from '../../src/physics/Types';
import { createGame, resetField, toCollisionState } from '../../src/game/GameState';
import { makeGroup } from '../../src/physics/RigidBody';
import { PAY_BLACK, PAY_BLACK_PAIR, PAY_LOCK, SHOT_DECAY, burstPay, lockPay, peelPay, setShotDecay } from '../../src/game/Rules';

function createMockBall(id: number, x: number, y: number, kind: number = 0): Ball {
  return {
    id,
    x,
    y,
    kind,
    special: null,
    color: '#E6194B',
    credit: 0,
    bonds: new Set(),
    group: null as any,
  };
}

describe('CollisionSolver physics module', () => {
  let state: CollisionState;

  beforeEach(() => {
    recalcThresholds(620);
    const game = createGame();
    resetField(game);
    state = toCollisionState(game);
  });

  describe('forEachPair', () => {
    it('iterates through close ball pairs using spatial partitioning grid', () => {
      const b1 = createMockBall(1, 100, 100);
      const b2 = createMockBall(2, 110, 100);
      const b3 = createMockBall(3, 500, 500); // Far away

      const pairs: [number, number][] = [];
      forEachPair([b1, b2, b3], (a, b) => {
        pairs.push([a.id, b.id]);
      });

      // b1 & b2 should be paired, but b3 shouldn't pair with b1 or b2
      expect(pairs.length).toBe(1);
      expect(pairs[0]).toEqual([1, 2]);
    });
  });

  describe('award', () => {
    it('increments player score and records category points', () => {
      award(state, 0, 10, 400, 300, 'lock');

      expect(state.players[0].score).toBe(10);
      expect(state.players[0].lockPts).toBe(10);
      expect(state.pops.length).toBe(1);
      expect(state.pops[0].text).toBe('+10');
    });

    it('ignores invalid player index or non-positive points', () => {
      award(state, -1, 10, 400, 300);
      award(state, 0, 0, 400, 300);
      expect(state.players[0].score).toBe(0);
    });
  });

  describe('explode & detach', () => {
    it('explodes group into ghost balls and awards burst points', () => {
      const b1 = createMockBall(1, 100, 100, 0);
      const b2 = createMockBall(2, 120, 100, 0);
      b1.bonds.add(2);
      b2.bonds.add(1);

      state.balls = [b1, b2];
      state.byId.set(1, b1);
      state.byId.set(2, b2);
      const g = makeGroup([b1, b2], 0, 0);
      b1.group = g;
      b2.group = g;
      state.groups = [g];

      explode(state, g, 1000, 0, 1, 800);

      expect(state.killGroups).toBe(1);
      expect(state.killBalls).toBe(2);
      expect(b1.ghost).toBe(true);
      expect(b2.ghost).toBe(true);
      expect(state.players[0].bursts).toBe(1);
      expect(state.players[0].score).toBeGreaterThan(0);
    });

    it('handles exploding an empty group safely without TypeError or NaN values', () => {
      const emptyGroup = makeGroup([], 0, 0);
      expect(() => explode(state, emptyGroup, 500, 0, 1, 800)).not.toThrow();
      expect(state.pops.some(p => Number.isNaN(p.x) || Number.isNaN(p.y))).toBe(false);
    });

    it('detaches single ball from group', () => {
      const b1 = createMockBall(1, 100, 100, 0);
      const b2 = createMockBall(2, 120, 100, 0);
      b1.bonds.add(2);
      b2.bonds.add(1);

      state.balls = [b1, b2];
      state.byId.set(1, b1);
      state.byId.set(2, b2);
      const g = makeGroup([b1, b2], 0, 0);
      b1.group = g;
      b2.group = g;
      state.groups = [g];

      detach(state, b1, 500, 0, 800);

      expect(b1.bonds.size).toBe(0);
      expect(b2.bonds.size).toBe(0);
      expect(state.players[0].peels).toBe(1);
    });

    it('caps escaping velocity of ghost balls below SHATTER_SPEED majority of the time', () => {
      let highSpeedCount = 0;
      const totalRuns = 500;
      for (let i = 0; i < totalRuns; i++) {
        const b = createMockBall(i + 1, 100, 100, 0);
        state.balls = [b];
        state.byId.set(i + 1, b);
        const g = makeGroup([b], 0, 0);
        b.group = g;
        state.groups = [g];

        explode(state, g, 5000, 0, 1, 800);

        const sp = Math.hypot(b.group.vx, b.group.vy);
        if (sp >= PhysicsConfig.SHATTER_SPEED) {
          highSpeedCount++;
        }
      }

      const pctHigh = highSpeedCount / totalRuns;
      expect(pctHigh).toBeGreaterThan(0.02);
      expect(pctHigh).toBeLessThan(0.25);
    });
  });

  describe('ageGhosts', () => {
    it('ages ghost balls and removes expired ones', () => {
      const b1 = createMockBall(1, 100, 100);
      b1.ghost = true;
      b1.age = PhysicsConfig.GHOST_LIFE - 0.05;

      state.balls = [b1];
      state.byId.set(1, b1);

      ageGhosts(state, 0.1);

      expect(b1.age).toBeGreaterThan(PhysicsConfig.GHOST_LIFE);
      expect(state.balls.length).toBe(0);
      expect(state.byId.has(1)).toBe(false);
    });
  });

  describe('collide', () => {
    it('bonds two unbonded balls of the same kind on collision', () => {
      const b1 = createMockBall(1, 100, 100, 0);
      const b2 = createMockBall(2, 115, 100, 0); // Distance = 15 < 2*R = 24
      state.balls = [b1, b2];
      state.byId.set(1, b1);
      state.byId.set(2, b2);

      const g1 = makeGroup([b1], 200, 0); // moving right
      const g2 = makeGroup([b2], -200, 0); // moving left
      b1.group = g1;
      b2.group = g2;
      state.groups = [g1, g2];

      collide(state, 1.0, 800);

      expect(b1.bonds.has(2)).toBe(true);
      expect(b2.bonds.has(1)).toBe(true);
    });

    it('ensures balls stick directly to the black ball on collision regardless of strength', () => {
      const bBlack = createMockBall(1, 200, 200, -1);
      bBlack.special = 'black';
      const gBlack = makeGroup([bBlack], 0, 0);
      bBlack.group = gBlack;

      const bRed = createMockBall(2, 185, 200, 2); // Red ball hitting black ball at high speed
      const gRed = makeGroup([bRed], 1500, 0);
      bRed.group = gRed;

      state.balls = [bBlack, bRed];
      state.byId.set(1, bBlack);
      state.byId.set(2, bRed);
      state.groups = [gBlack, gRed];

      collide(state, 1.0, 800);

      // Red ball should bond/stick directly to the Black ball
      expect(bRed.bonds.has(1)).toBe(true);
      expect(bBlack.bonds.has(2)).toBe(true);
      expect(bBlack.ghost).toBeFalsy();
    });

    it('allows non-matching balls hitting other members of a group containing a black ball to break/detach normally', () => {
      const bBlack = createMockBall(1, 200, 200, -1);
      bBlack.special = 'black';
      const bBlue = createMockBall(2, 215, 200, 1);
      bBlack.bonds.add(2);
      bBlue.bonds.add(1);

      const gBlack = makeGroup([bBlack, bBlue], 0, 0);
      bBlack.group = gBlack;
      bBlue.group = gBlack;

      const bRed = createMockBall(3, 230, 200, 2); // Red ball hitting bBlue (not bBlack directly)
      const gRed = makeGroup([bRed], -500, 0);
      bRed.group = gRed;

      state.balls = [bBlack, bBlue, bRed];
      state.byId.set(1, bBlack);
      state.byId.set(2, bBlue);
      state.byId.set(3, bRed);
      state.groups = [gBlack, gRed];

      collide(state, 1.0, 800);

      // bRed hitting bBlue does NOT force bRed to stick to group because it didn't hit bBlack directly
      expect(bRed.bonds.has(2)).toBe(false);
    });

    it('allows white ball to explode black ball groups', () => {
      const bBlack = createMockBall(1, 200, 200, -1);
      bBlack.special = 'black';
      const bBlue = createMockBall(2, 215, 200, 1);
      bBlack.bonds.add(2);
      bBlue.bonds.add(1);

      const gBlack = makeGroup([bBlack, bBlue], 0, 0);
      bBlack.group = gBlack;
      bBlue.group = gBlack;

      const bWhite = createMockBall(3, 185, 200, -1);
      bWhite.special = 'white';
      const gWhite = makeGroup([bWhite], 1000, 0);
      bWhite.group = gWhite;

      state.balls = [bBlack, bBlue, bWhite];
      state.byId.set(1, bBlack);
      state.byId.set(2, bBlue);
      state.byId.set(3, bWhite);
      state.groups = [gBlack, gWhite];

      collide(state, 1.0, 800);

      // White ball should explode the black ball group into ghost balls
      expect(bBlack.ghost).toBe(true);
      expect(bBlue.ghost).toBe(true);
    });

    it('allows white ball to destroy a standalone black ball', () => {
      const bBlack = createMockBall(1, 200, 200, -1);
      bBlack.special = 'black';
      const gBlack = makeGroup([bBlack], 0, 0);
      bBlack.group = gBlack;

      const bWhite = createMockBall(2, 185, 200, -1);
      bWhite.special = 'white';
      const gWhite = makeGroup([bWhite], 1000, 0);
      bWhite.group = gWhite;

      state.balls = [bBlack, bWhite];
      state.byId.set(1, bBlack);
      state.byId.set(2, bWhite);
      state.groups = [gBlack, gWhite];

      collide(state, 1.0, 800);

      expect(bBlack.ghost).toBe(true);
    });

    it('preserves black ball when a group bursts from a non-white ball hit', () => {
      const bBlue1 = createMockBall(1, 200, 200, 1);
      const bBlue2 = createMockBall(2, 215, 200, 1);
      const bBlack = createMockBall(3, 230, 200, -1);
      bBlack.special = 'black';

      bBlue1.bonds.add(2);
      bBlue2.bonds.add(1); bBlue2.bonds.add(3);
      bBlack.bonds.add(2);

      const gGroup = makeGroup([bBlue1, bBlue2, bBlack], 0, 0);
      bBlue1.group = gGroup;
      bBlue2.group = gGroup;
      bBlack.group = gGroup;

      const bRedHitter = createMockBall(4, 185, 200, 2); // Red ball (kind 2) hitting bBlue1 (kind 1) moving right at high speed
      const gHitter = makeGroup([bRedHitter], 1000, 0);
      bRedHitter.group = gHitter;

      state.balls = [bBlue1, bBlue2, bBlack, bRedHitter];
      state.byId.set(1, bBlue1);
      state.byId.set(2, bBlue2);
      state.byId.set(3, bBlack);
      state.byId.set(4, bRedHitter);
      state.groups = [gGroup, gHitter];

      collide(state, 1.0, 800);

      // Blue balls burst into ghosts, but black ball remains alive
      expect(bBlue1.ghost).toBe(true);
      expect(bBlue2.ghost).toBe(true);
      expect(bBlack.ghost).toBeFalsy();
      expect(bBlack.bonds.size).toBe(0);
    });
  });

  describe('scoring', () => {
    function place(balls: Ball[], groups: ReturnType<typeof makeGroup>[]) {
      state.balls = balls;
      for (const b of balls) state.byId.set(b.id, b);
      state.groups = groups;
    }

    it('pays each further event from the same throw SHOT_DECAY times less', () => {
      const was = SHOT_DECAY;
      setShotDecay(0.5);
      try {
        const shot = { events: 0 };
        award(state, 0, 20, 0, 0, 'lock', shot);
        award(state, 0, 20, 0, 0, 'lock', shot);
        award(state, 0, 20, 0, 0, 'lock', shot);
        expect(state.players[0].lockPts).toBe(20 + 10 + 5);
        expect(shot.events).toBe(3);

        // An event with no throw behind it pays in full.
        award(state, 0, 20, 0, 0, 'lock');
        expect(state.players[0].lockPts).toBe(55);
      } finally {
        setShotDecay(was);
      }
    });

    it('pays a lock for the balls it adds, growing with the cluster they join', () => {
      const c1 = createMockBall(1, 200, 200, 0);
      const c2 = createMockBall(2, 224, 200, 0);
      const c3 = createMockBall(3, 248, 200, 0);
      c1.bonds.add(2); c2.bonds.add(1); c2.bonds.add(3); c3.bonds.add(2);
      for (const b of [c1, c2, c3]) b.credit = -1;
      const cluster = makeGroup([c1, c2, c3], 0, 0);
      for (const b of [c1, c2, c3]) b.group = cluster;

      const mover = createMockBall(4, 180, 200, 0);
      mover.shot = { events: 0 };
      const gm = makeGroup([mover], 500, 0);
      mover.group = gm;
      place([c1, c2, c3, mover], [cluster, gm]);

      collide(state, 1.0, 800);

      expect(mover.bonds.has(1)).toBe(true);
      // One ball joined a 3-ball cluster: not the old 3 × merged size of 4.
      expect(state.players[0].lockPts).toBe(lockPay(1, 0, 3));
      expect(state.players[0].lockPts).toBe(2 * PAY_LOCK);
    });

    function blackLock(moverSpecial: 'black' | null) {
      const still = createMockBall(1, 200, 200, -1);
      still.special = 'black';
      still.credit = -1;
      const gs = makeGroup([still], 0, 0); still.group = gs;
      const mover = createMockBall(2, 180, 200, moverSpecial ? -1 : 1);
      mover.special = moverSpecial;
      mover.shot = { events: 0 };
      const gm = makeGroup([mover], 500, 0); mover.group = gm;
      place([still, mover], [gs, gm]);
      collide(state, 1.0, 800);
      expect(mover.bonds.has(1)).toBe(true);
    }

    it('pays a black-on-colour lock double', () => {
      blackLock(null);
      expect(state.players[0].lockPts).toBe(PAY_LOCK * PAY_BLACK);
    });

    it('pays a black-on-black lock four times', () => {
      blackLock('black');
      expect(state.players[0].lockPts).toBe(PAY_LOCK * PAY_BLACK_PAIR);
    });

    it('pays a white-ball burst full points', () => {
      const c1 = createMockBall(1, 200, 200, 1);
      const c2 = createMockBall(2, 224, 200, 1);
      c1.bonds.add(2); c2.bonds.add(1);
      c1.credit = c2.credit = -1;
      const cluster = makeGroup([c1, c2], 0, 0);
      c1.group = c2.group = cluster;
      const white = createMockBall(3, 182, 200, -1);
      white.special = 'white';
      white.shot = { events: 0 };
      const gw = makeGroup([white], 1000, 0); white.group = gw;
      place([c1, c2, white], [cluster, gw]);

      collide(state, 1.0, 800);

      expect(c1.ghost).toBe(true);
      expect(state.players[0].burstPts).toBe(burstPay(2));
    });

    it('pays a peel more the bigger the cluster the ball was knocked off', () => {
      const chain = [0, 1, 2, 3, 4].map(i => createMockBall(i + 1, 100 + i * 24, 100, 0));
      for (let i = 0; i < 4; i++) { chain[i].bonds.add(i + 2); chain[i + 1].bonds.add(i + 1); }
      const g = makeGroup(chain, 0, 0);
      for (const b of chain) b.group = g;
      place(chain, [g]);

      detach(state, chain[0], 300, 0, 800);

      expect(state.players[0].peelPts).toBe(peelPay(5));
    });

    it("hands the struck ball the hitter's shot, so one throw keeps one tally", () => {
      const hitter = createMockBall(1, 100, 100, 0);
      hitter.shot = { events: 0 };
      const struck = createMockBall(2, 118, 100, 1);
      struck.credit = -1;
      const gh = makeGroup([hitter], 400, 0); hitter.group = gh;
      const gs = makeGroup([struck], 0, 0); struck.group = gs;
      place([hitter, struck], [gh, gs]);

      collide(state, 1.0, 800);

      expect(struck.credit).toBe(0);
      expect(struck.shot).toBe(hitter.shot);
    });

    it('lets burst debris claim a live ball it pushes', () => {
      const debris = createMockBall(1, 100, 100, 0);
      debris.ghost = true; debris.age = 0; debris.credit = 1; debris.shot = { events: 0 };
      const live = createMockBall(2, 118, 100, 0);
      const gd = makeGroup([debris], 400, 0); debris.group = gd;
      const gl = makeGroup([live], 0, 0); live.group = gl;
      place([debris, live], [gd, gl]);

      collide(state, 1.0, 800);

      expect(live.credit).toBe(1);
      expect(live.shot).toBe(debris.shot);
    });

    it('clears credit from a ball that has come to rest', () => {
      const still = createMockBall(1, 400, 300, 0);
      still.shot = { events: 0 };
      const moving = createMockBall(2, 100, 300, 1);
      moving.shot = { events: 0 };
      const gs = makeGroup([still], 0, 0); still.group = gs;
      const gm = makeGroup([moving], 300, 0); moving.group = gm;
      place([still, moving], [gs, gm]);

      stepPhysics(state, 0.016, 0.016, 800, 600);

      expect(still.credit).toBe(-1);
      expect(still.shot).toBeUndefined();
      expect(moving.credit).toBe(0);
      expect(moving.shot).toBeDefined();
    });
  });

  describe('stepPhysics', () => {
    it('advances physics loop, applying drag, movement, and wall bounds', () => {
      const b1 = createMockBall(1, 400, 300, 0);
      const g1 = makeGroup([b1], 100, 0);
      b1.group = g1;
      state.balls = [b1];
      state.byId.set(1, b1);
      state.groups = [g1];

      stepPhysics(state, 0.016, 0.016, 800, 600);

      expect(b1.x).toBeGreaterThan(400); // Position advanced
      expect(g1.vx).toBeLessThan(100); // Velocity decayed by drag
    });
  });
});
