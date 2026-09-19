/**
 * Textbook physics checks for the collision solver.
 *
 * These are the "run once, keep forever" assertions: with restitution 1 and no
 * drag, an impulse solver has known correct answers, and any change that breaks
 * one of them has broken the solver rather than merely retuned the game. The
 * suite is shared — `scripts/sim.ts physics` prints it, and
 * `tests/sim/PhysicsChecks.test.ts` fails the build on it.
 */
import { PhysicsConfig } from '../physics/Config';
import {
  loose, makeBall, maxDrift, pairwiseDistances, totalAngularMomentum,
  totalEnergy, totalMomentum, weld, withSandbox,
} from './Scenarios';
import { TAU } from '../math';

export interface CheckResult {
  name: string;
  /** What the check is asserting, in words. */
  expectation: string;
  /** The measured quantity. */
  measured: number;
  /** The value it should equal. */
  expected: number;
  /** Absolute tolerance on |measured - expected|. */
  tolerance: number;
  unit: string;
  pass: boolean;
}

function result(
  name: string, expectation: string, measured: number, expected: number, tolerance: number, unit: string
): CheckResult {
  return {
    name, expectation, measured, expected, tolerance, unit,
    pass: Math.abs(measured - expected) <= tolerance,
  };
}

/** Two equal balls head-on exchange velocities exactly. */
export function checkHeadOn(): CheckResult[] {
  const R = PhysicsConfig.R;
  return withSandbox([], [], {}, sb => {
    const a = makeBall(1, 500, 500, 0);
    const b = makeBall(2, 500 + 6 * R, 500, 1);
    sb.state.balls.push(a, b);
    sb.state.byId.set(1, a); sb.state.byId.set(2, b);
    const ga = loose(a, 300, 0), gb = loose(b, 0, 0);
    sb.state.groups.push(ga, gb);

    sb.run(0.4, 1 / 480);

    return [
      result('head-on: striker stops', 'the moving ball transfers all its speed', ga.vx, 0, 1e-6, 'px/s'),
      result('head-on: target takes over', 'the struck ball leaves at the striker\'s speed', gb.vx, 300, 1e-6, 'px/s'),
      result('head-on: no sideways drift', 'a centred hit produces no lateral velocity', gb.vy, 0, 1e-9, 'px/s'),
    ];
  });
}

/** A glancing hit between equal masses separates the two at exactly 90 degrees. */
export function checkGlancing(): CheckResult[] {
  const R = PhysicsConfig.R;
  return withSandbox([], [], {}, sb => {
    const a = makeBall(1, 500, 500, 0);
    const b = makeBall(2, 500 + 6 * R, 500 + R, 1);
    sb.state.balls.push(a, b);
    sb.state.byId.set(1, a); sb.state.byId.set(2, b);
    const ga = loose(a, 400, 0), gb = loose(b, 0, 0);
    sb.state.groups.push(ga, gb);

    sb.run(0.3, 1 / 480);

    const angA = Math.atan2(ga.vy, ga.vx);
    const angB = Math.atan2(gb.vy, gb.vx);
    let between = Math.abs(angA - angB) * 180 / Math.PI;
    if (between > 180) between = 360 - between;

    return [
      result('glancing: 90 degree separation', 'equal masses leave a glancing hit at right angles', between, 90, 0.1, 'deg'),
    ];
  });
}

/**
 * A ball into a rigid group of N produces velocity changes in N:1 ratio — the
 * group really does behave as one body of mass N.
 */
export function checkGroupMass(n = 4): CheckResult[] {
  const R = PhysicsConfig.R;
  return withSandbox([], [], {}, sb => {
    // A horizontal bar of n welded balls, struck head-on along its axis so the
    // impact line passes through the group's centre of mass and induces no spin.
    const bar = [];
    for (let i = 0; i < n; i++) bar.push(makeBall(10 + i, 700 + i * 2 * R, 500, 100 + i));
    const striker = makeBall(1, 700 - 6 * R, 500, 0);

    for (const b of [striker, ...bar]) { sb.state.balls.push(b); sb.state.byId.set(b.id, b); }
    const gs = loose(striker, 400, 0);
    const gb = weld(bar, 0, 0);
    sb.state.groups.push(gs, gb);

    sb.run(0.5, 1 / 960);

    // Elastic collision, mass 1 into mass n: striker ends at (1-n)/(1+n) * v,
    // group at 2/(1+n) * v.
    const expectedStriker = ((1 - n) / (1 + n)) * 400;
    const expectedGroup = (2 / (1 + n)) * 400;

    return [
      result(`group mass: striker rebound off ${n}`, `mass 1 into mass ${n} rebounds at (1-n)/(1+n) of its speed`, gs.vx, expectedStriker, 1.0, 'px/s'),
      result(`group mass: ${n}-ball group takes 2/(1+n)`, `the group moves off as a single body of mass ${n}`, gb.vx, expectedGroup, 1.0, 'px/s'),
    ];
  });
}

/** Linear momentum, angular momentum and energy are conserved across a busy field. */
export function checkConservation(): CheckResult[] {
  const R = PhysicsConfig.R;
  return withSandbox([], [], { width: 4000, height: 4000 }, sb => {
    // A loose scatter well away from the walls, so only ball-on-ball impulses act.
    let id = 1;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const b = makeBall(id, 1500 + i * 3.2 * R, 1500 + j * 3.2 * R, id);
        id++;
        sb.state.balls.push(b);
        sb.state.byId.set(b.id, b);
        const ang = Math.random() * TAU;
        sb.state.groups.push(loose(b, Math.cos(ang) * 260, Math.sin(ang) * 260));
      }
    }

    const p0 = totalMomentum(sb.state.groups);
    const e0 = totalEnergy(sb.state.groups);
    const l0 = totalAngularMomentum(sb.state.groups);

    sb.run(3, 1 / 480);

    const p1 = totalMomentum(sb.state.groups);
    const e1 = totalEnergy(sb.state.groups);
    const l1 = totalAngularMomentum(sb.state.groups);

    const pErr = Math.hypot(p1.x - p0.x, p1.y - p0.y) / Math.max(1, Math.hypot(p0.x, p0.y));
    const eErr = Math.abs(e1 - e0) / Math.max(1, e0);
    const lErr = Math.abs(l1 - l0) / Math.max(1, Math.abs(l0));

    return [
      result('conservation: linear momentum', 'total momentum is unchanged by elastic collisions', pErr * 100, 0, 0.01, '%'),
      result('conservation: kinetic energy', 'restitution 1 loses no energy', eErr * 100, 0, 0.05, '%'),
      result('conservation: angular momentum', 'total angular momentum is unchanged', lErr * 100, 0, 0.1, '%'),
    ];
  });
}

/** A spinning group stays rigid: its pairwise distances must not drift. */
export function checkRigidity(): CheckResult[] {
  const R = PhysicsConfig.R;
  return withSandbox([], [], { width: 4000, height: 4000 }, sb => {
    const ring = [];
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * TAU;
      ring.push(makeBall(1 + i, 2000 + Math.cos(ang) * 2 * R, 2000 + Math.sin(ang) * 2 * R, 10 + i));
    }
    for (const b of ring) { sb.state.balls.push(b); sb.state.byId.set(b.id, b); }
    const g = weld(ring, 40, 25, 3);
    sb.state.groups.push(g);

    const before = pairwiseDistances(g);
    sb.run(20, 1 / 120);
    const after = pairwiseDistances(g);

    return [
      result('rigidity: spinning group holds shape', 'welded offsets keep every pairwise distance fixed over 20s', maxDrift(before, after), 0, 1e-9, 'px'),
    ];
  });
}

/** A resting group must never have overlap baked into its offsets. */
export function checkNoFrozenOverlap(): CheckResult[] {
  const R = PhysicsConfig.R;
  return withSandbox([], [], {}, sb => {
    const pair = [makeBall(1, 500, 500, 0), makeBall(2, 500 + 2 * R, 500, 1)];
    for (const b of pair) { sb.state.balls.push(b); sb.state.byId.set(b.id, b); }
    const g = weld(pair, 120, 0, 2);
    sb.state.groups.push(g);

    sb.run(5, 1 / 240);

    let worst = 0;
    for (const d of pairwiseDistances(g)) worst = Math.max(worst, 2 * PhysicsConfig.R - d);

    return [
      result('rigidity: no frozen overlap', 'group members never overlap each other', worst, 0, 1e-9, 'px'),
    ];
  });
}

/** Every check, in one list. */
export function runPhysicsChecks(): CheckResult[] {
  return [
    ...checkHeadOn(),
    ...checkGlancing(),
    ...checkGroupMass(2),
    ...checkGroupMass(4),
    ...checkConservation(),
    ...checkRigidity(),
    ...checkNoFrozenOverlap(),
  ];
}
