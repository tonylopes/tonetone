import { describe, it, expect } from 'vitest';
import { catchUp, compare, estimate, mean, median, stderr, stdev } from '../../src/sim/Stats';
import { digest, diffBaseline, BASELINE_VERSION, BaselineFile } from '../../src/sim/Baseline';
import { runSim } from '../../src/sim/Harness';

describe('descriptive statistics', () => {
  it('computes mean, deviation and error', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    expect(stdev(xs)).toBeCloseTo(2.13809, 4);
    expect(stderr(xs)).toBeCloseTo(2.13809 / Math.sqrt(8), 4);
    expect(median(xs)).toBe(4.5);
  });

  it('treats degenerate samples safely', () => {
    expect(mean([])).toBe(0);
    expect(stdev([1])).toBe(0);
    expect(stderr([1])).toBe(0);
    expect(median([])).toBe(0);
  });
});

describe('noise-aware verdicts', () => {
  it('refuses a verdict inside 2x the standard error', () => {
    // A sample straddling zero with wide spread: no effect to report.
    const e = estimate([-30, 40, -20, 25, -35, 30, 10, -15]);
    expect(e.verdict).toBe('inside the noise');
  });

  it('reports an effect that clears the error bars', () => {
    const e = estimate([28, 31, 26, 33, 29, 30, 27, 32]);
    expect(e.verdict).toBe('higher');
    expect(e.mean).toBeGreaterThan(2 * e.stderr);
  });

  it('compares two samples without over-claiming', () => {
    const noisy = compare([10, -10, 12, -8, 9, -11], [11, -9, 13, -7, 8, -12]);
    expect(noisy.verdict).toBe('inside the noise');

    const real = compare([10, 11, 9, 10, 11, 9], [40, 41, 39, 40, 41, 39]);
    expect(real.verdict).toBe('higher');
    expect(real.delta).toBeCloseTo(30, 6);
    expect(real.relative).toBeCloseTo(3, 6);
  });
});

describe('paired catch-up statistic', () => {
  it('reads positive when the half-time trailer closes the gap', () => {
    // p2 led at half time by 50 and finished only 10 ahead.
    expect(catchUp([100, 150], [300, 310])).toBe(40);
  });

  it('reads negative when the leader pulls away', () => {
    expect(catchUp([150, 100], [400, 300])).toBe(-50);
  });

  it('is symmetric in which player happened to be ahead', () => {
    expect(catchUp([100, 150], [310, 300])).toBe(catchUp([150, 100], [300, 310]));
  });
});

describe('baseline diffing', () => {
  const file = (metrics: Record<string, number>): BaselineFile => ({
    version: BASELINE_VERSION,
    created: 'test',
    scenarios: [{ label: 'a', metrics }],
  });

  it('reports nothing when the numbers match exactly', () => {
    expect(diffBaseline(file({ booms: 10 }), file({ booms: 10 }))).toEqual([]);
  });

  it('reports any movement at zero tolerance', () => {
    const rows = diffBaseline(file({ booms: 10 }), file({ booms: 11 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ metric: 'booms', before: 10, after: 11, delta: 1, percent: 10, within: false });
  });

  it('accepts movement inside an explicit tolerance', () => {
    const rows = diffBaseline(file({ booms: 100 }), file({ booms: 105 }), 10);
    expect(rows[0].within).toBe(true);
  });

  it('flags a scenario that disappeared', () => {
    const saved = file({ booms: 1 });
    const fresh: BaselineFile = { version: BASELINE_VERSION, created: 'test', scenarios: [] };
    expect(diffBaseline(saved, fresh)[0].within).toBe(false);
  });

  it('digests a real run into comparable numbers', () => {
    const d = digest(runSim({ seconds: 10, seed: 1, mode: 'solo' }));
    expect(Object.keys(d)).toContain('booms');
    expect(Object.keys(d)).toContain('worstOverlap');
    for (const [k, v] of Object.entries(d)) expect(Number.isFinite(v), k).toBe(true);
  });
});
