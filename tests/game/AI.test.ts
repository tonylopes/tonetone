import { describe, it, expect, beforeEach } from 'vitest';
import { aiAim } from '../../src/game/AI';
import { makeLauncher } from '../../src/game/GameState';
import { makeGroup } from '../../src/physics/RigidBody';
import { Ball } from '../../src/physics/Types';
import { recalcThresholds } from '../../src/physics/Config';

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

describe('AI module', () => {
  beforeEach(() => {
    recalcThresholds(620);
  });

  it('aims toward the largest group of balls when a group of 2+ exists', () => {
    const aiPlayer = makeLauncher(-1); // Top launcher at (400, 38)
    const b1 = createMockBall(1, 200, 300);
    const b2 = createMockBall(2, 215, 300);
    const g = makeGroup([b1, b2], 0, 0);

    aiAim(aiPlayer, [g], [b1, b2], 800, 600);

    // AI should rotate launcher angle toward (207.5, 300)
    expect(aiPlayer.aimDeg).not.toBe(0);
    expect(aiPlayer.strength).toBeGreaterThan(0);
  });

  it('falls back to nearest single ball when no multi-ball group exists', () => {
    const aiPlayer = makeLauncher(-1); // Top launcher at (400, 38)
    const b1 = createMockBall(1, 500, 200);
    const g = makeGroup([b1], 0, 0);

    aiAim(aiPlayer, [g], [b1], 800, 600);

    expect(aiPlayer.aimDeg).not.toBe(0);
    expect(aiPlayer.strength).toBeGreaterThan(0);
  });

  it('uses idle wander angle when court is empty', () => {
    const aiPlayer = makeLauncher(-1);
    aiAim(aiPlayer, [], [], 800, 600);

    expect(aiPlayer._idleDeg).toBeDefined();
    expect(aiPlayer.strength).toBeGreaterThan(0);
  });

  it('assigns target strength when aiming at a group', () => {
    const aiPlayer = makeLauncher(-1);
    const b1 = createMockBall(1, 200, 300);
    const b2 = createMockBall(2, 215, 300);
    const g = makeGroup([b1, b2], 0, 0);

    aiAim(aiPlayer, [g], [b1, b2], 800, 600);

    expect((aiPlayer as any)._targetStrength).toBeGreaterThanOrEqual(0.35);
    expect((aiPlayer as any)._targetStrength).toBeLessThanOrEqual(1.0);
  });
});
