import { describe, it, expect } from 'vitest';
import { runPhysicsChecks } from '../../src/sim/PhysicsChecks';
import {
  loose, makeBall, maxDrift, pairwiseDistances, totalEnergy, totalMomentum, weld, withSandbox,
} from '../../src/sim/Scenarios';
import { PhysicsConfig } from '../../src/physics/Config';

/**
 * The textbook checks, asserted individually so a failure names the law that
 * broke rather than just reporting that something did.
 */
describe('physics checks', () => {
  const checks = runPhysicsChecks();

  it('runs every check', () => {
    expect(checks.length).toBeGreaterThanOrEqual(13);
  });

  for (const c of checks) {
    it(c.name, () => {
      expect(
        Math.abs(c.measured - c.expected),
        `${c.expectation} — measured ${c.measured} ${c.unit}, expected ${c.expected} ± ${c.tolerance}`
      ).toBeLessThanOrEqual(c.tolerance);
    });
  }
});

describe('sandbox isolation', () => {
  it('keeps the launcher bays out of an isolated measurement', () => {
    // An empty players array is what makes the isolation real: with a launcher
    // present, the bay would clamp and bounce anything crossing its mouth.
    withSandbox([], [], {}, sb => {
      expect(sb.state.players).toEqual([]);
    });
  });

  it('forms no bonds between balls of different kinds', () => {
    const a = makeBall(1, 500, 500, 0);
    const b = makeBall(2, 500 + 6 * PhysicsConfig.R, 500, 1);
    withSandbox([a, b], [], {}, sb => {
      sb.state.groups.push(loose(a, 400, 0), loose(b, 0, 0));
      sb.run(0.5, 1 / 480);
      expect(a.bonds.size).toBe(0);
      expect(b.bonds.size).toBe(0);
      expect(sb.state.killGroups).toBe(0);
    });
  });

  it('restores the shared physics config afterwards', () => {
    const before = { ...PhysicsConfig };
    withSandbox([], [], { config: { REST: 0.3, DRAG: 0.9 } }, () => {
      expect(PhysicsConfig.REST).toBe(0.3);
    });
    expect({ ...PhysicsConfig }).toEqual(before);
  });

  it('welds a group at an exact geometry with no overlap', () => {
    const balls = [0, 1, 2].map(i => makeBall(i + 1, 500 + i * 2 * PhysicsConfig.R, 500, 10 + i));
    withSandbox(balls, [], {}, sb => {
      const g = weld(balls, 0, 0);
      sb.state.groups.push(g);
      expect(g.members.length).toBe(3);
      expect(g.mass).toBe(3);
      for (const d of pairwiseDistances(g)) expect(d).toBeGreaterThanOrEqual(2 * PhysicsConfig.R - 1e-9);
    });
  });
});

describe('wall behaviour', () => {
  it('reflects a ball off a rail without losing speed at restitution 1', () => {
    const b = makeBall(1, 200, 60, 0);
    withSandbox([b], [], { width: 400, height: 400 }, sb => {
      sb.state.groups.push(loose(b, 0, -300));
      const speedBefore = 300;
      sb.run(1.0, 1 / 480);
      expect(Math.hypot(b.group.vx, b.group.vy)).toBeCloseTo(speedBefore, 6);
      // And it must end up back inside the field.
      expect(b.y).toBeGreaterThanOrEqual(PhysicsConfig.R - 1e-6);
    });
  });

  it('keeps a spinning group inside the field over a long run', () => {
    const ring = [0, 1, 2, 3].map(i => {
      const ang = (i / 4) * Math.PI * 2;
      return makeBall(i + 1, 200 + Math.cos(ang) * 2 * PhysicsConfig.R, 200 + Math.sin(ang) * 2 * PhysicsConfig.R, 10 + i);
    });
    withSandbox(ring, [], { width: 400, height: 400 }, sb => {
      const g = weld(ring, 260, 190, 4);
      sb.state.groups.push(g);
      const before = pairwiseDistances(g);
      sb.run(20, 1 / 240);

      const R = PhysicsConfig.R;
      for (const b of g.members) {
        expect(b.x).toBeGreaterThanOrEqual(R - 0.05);
        expect(b.x).toBeLessThanOrEqual(400 - R + 0.05);
        expect(b.y).toBeGreaterThanOrEqual(R - 0.05);
        expect(b.y).toBeLessThanOrEqual(400 - R + 0.05);
      }
      // Bouncing off rails must not deform the group.
      expect(maxDrift(before, pairwiseDistances(g))).toBeLessThan(1e-9);
    });
  });
});

describe('conservation helpers', () => {
  it('sums momentum and energy over groups', () => {
    const a = makeBall(1, 100, 100, 0);
    const b = makeBall(2, 300, 300, 1);
    withSandbox([a, b], [], {}, sb => {
      const ga = loose(a, 100, 0), gb = loose(b, -100, 0);
      sb.state.groups.push(ga, gb);
      const p = totalMomentum(sb.state.groups);
      expect(p.x).toBeCloseTo(0, 10);
      expect(totalEnergy(sb.state.groups)).toBeCloseTo(0.5 * 100 * 100 * 2, 6);
    });
  });
});
