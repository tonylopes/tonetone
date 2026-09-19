import { describe, it, expect, beforeEach, vi } from 'vitest';

// The solver picks which voice an event gets, and that choice is the thing under
// test here — not the synthesis, which `tests/audio/Voices.test.ts` covers. The
// whole audio module is mocked so the choice is readable as a call argument.
vi.mock('../../src/audio/Voices', () => ({
  playNote: vi.fn(),
  playKnock: vi.fn(),
  playMagneticElectricSound: vi.fn(),
}));

import { collide, CollisionState } from '../../src/physics/CollisionSolver';
import { playNote, playMagneticElectricSound } from '../../src/audio/Voices';
import { recalcThresholds } from '../../src/physics/Config';
import { Ball } from '../../src/physics/Types';
import { createGame, resetField, toCollisionState } from '../../src/game/GameState';
import { makeGroup } from '../../src/physics/RigidBody';

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

/** The `whiteBlack` flag `boomGroup` passes to the boom voice. */
function boomVariants(): boolean[] {
  return (playNote as any).mock.calls
    .filter((c: any[]) => c[2] === 'boom')
    .map((c: any[]) => c[6] === true);
}

/** The `isPair` flag each magnet lock was played with. */
function magnetVariants(): boolean[] {
  return (playMagneticElectricSound as any).mock.calls.map((c: any[]) => c[2] === true);
}

/** The group size each magnet lock was scaled by. */
function magnetSizes(): number[] {
  return (playMagneticElectricSound as any).mock.calls.map((c: any[]) => c[3]);
}

describe('CollisionSolver voice selection', () => {
  let state: CollisionState;

  beforeEach(() => {
    vi.clearAllMocks();
    recalcThresholds(620);
    const game = createGame();
    resetField(game);
    state = toCollisionState(game);
  });

  describe('white-on-black boom', () => {
    it('gives the boom its own boom when a white destroys a black', () => {
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

      expect(bBlack.ghost).toBe(true);
      expect(boomVariants()).toEqual([true]);
    });

    it('gives a standalone black the same boom, with no group around it', () => {
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

      expect(boomVariants()).toEqual([true]);
    });

    it('leaves a white boom on colours alone with the ordinary boom', () => {
      const bBlue1 = createMockBall(1, 200, 200, 1);
      const bBlue2 = createMockBall(2, 215, 200, 1);
      bBlue1.bonds.add(2);
      bBlue2.bonds.add(1);
      const gBlue = makeGroup([bBlue1, bBlue2], 0, 0);
      bBlue1.group = gBlue;
      bBlue2.group = gBlue;

      const bWhite = createMockBall(3, 185, 200, -1);
      bWhite.special = 'white';
      const gWhite = makeGroup([bWhite], 1000, 0);
      bWhite.group = gWhite;

      state.balls = [bBlue1, bBlue2, bWhite];
      state.byId.set(1, bBlue1);
      state.byId.set(2, bBlue2);
      state.byId.set(3, bWhite);
      state.groups = [gBlue, gWhite];

      collide(state, 1.0, 800);

      expect(bBlue1.ghost).toBe(true);
      expect(boomVariants()).toEqual([false]);
    });

    it('keeps the ordinary boom when a colour booms a group the black survives', () => {
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

      const bRed = createMockBall(4, 185, 200, 2);
      const gRed = makeGroup([bRed], 1000, 0);
      bRed.group = gRed;

      state.balls = [bBlue1, bBlue2, bBlack, bRed];
      state.byId.set(1, bBlue1);
      state.byId.set(2, bBlue2);
      state.byId.set(3, bBlack);
      state.byId.set(4, bRed);
      state.groups = [gGroup, gRed];

      collide(state, 1.0, 800);

      // The black is still on the table, so nothing about this boom is special.
      expect(bBlack.ghost).toBeFalsy();
      for (const v of boomVariants()) expect(v).toBe(false);
    });
  });

  describe('magnet lock', () => {
    it('rings a black locking to a black higher than a black locking to a colour', () => {
      const bBlack = createMockBall(1, 200, 200, -1);
      bBlack.special = 'black';
      const gBlack = makeGroup([bBlack], 0, 0);
      bBlack.group = gBlack;

      const bRed = createMockBall(2, 185, 200, 2);
      const gRed = makeGroup([bRed], 1500, 0);
      bRed.group = gRed;

      state.balls = [bBlack, bRed];
      state.byId.set(1, bBlack);
      state.byId.set(2, bRed);
      state.groups = [gBlack, gRed];

      collide(state, 1.0, 800);

      expect(bRed.bonds.has(1)).toBe(true);
      expect(magnetVariants()).toEqual([false]);
    });

    it('scales the lock by the group the merge produced, not by either side', () => {
      // A black already carrying three colours, joined by one more ball: the
      // lock should be heard at the size of the five-ball result.
      const bBlack = createMockBall(1, 200, 200, -1);
      bBlack.special = 'black';
      const members = [bBlack];
      for (let i = 0; i < 3; i++) {
        const b = createMockBall(10 + i, 200 + (i + 1) * 15, 200, 1);
        bBlack.bonds.add(b.id);
        b.bonds.add(1);
        members.push(b);
      }
      const gBlack = makeGroup(members, 0, 0);
      for (const m of members) m.group = gBlack;

      const bRed = createMockBall(2, 185, 200, 2);
      const gRed = makeGroup([bRed], 1500, 0);
      bRed.group = gRed;

      state.balls = [...members, bRed];
      for (const m of members) state.byId.set(m.id, m);
      state.byId.set(2, bRed);
      state.groups = [gBlack, gRed];

      collide(state, 1.0, 800);

      expect(bRed.bonds.has(1)).toBe(true);
      expect(magnetSizes()).toEqual([members.length + 1]);
    });

    it('marks a black-on-black lock as the pair variant', () => {
      const bBlack1 = createMockBall(1, 200, 200, -1);
      bBlack1.special = 'black';
      const g1 = makeGroup([bBlack1], 0, 0);
      bBlack1.group = g1;

      const bBlack2 = createMockBall(2, 185, 200, -1);
      bBlack2.special = 'black';
      const g2 = makeGroup([bBlack2], 1500, 0);
      bBlack2.group = g2;

      state.balls = [bBlack1, bBlack2];
      state.byId.set(1, bBlack1);
      state.byId.set(2, bBlack2);
      state.groups = [g1, g2];

      collide(state, 1.0, 800);

      expect(bBlack1.bonds.has(2)).toBe(true);
      expect(magnetVariants()).toEqual([true]);
    });
  });
});
