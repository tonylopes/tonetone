/**
 * Simulation baselines.
 *
 * Because every run is seeded, a fixed set of scenarios produces byte-identical
 * numbers on an unchanged build. That turns a vague question — "did my edit
 * change how the game plays?" — into an exact one. A pure refactor reproduces
 * the baseline exactly; a retune shows precisely which metrics moved and by how
 * much; an accident shows movement where the author expected none.
 *
 * The scenario list deliberately spans field sizes. Speeds are written in px/s,
 * so they behave differently on a shorter field, and a whole class of feel bugs
 * only appears when the same shot is measured at two heights.
 */
import { RunResult, SimOptions, runSim } from './Harness';

export interface BaselineScenario {
  label: string;
  opts: SimOptions;
}

export const BASELINE_SCENARIOS: BaselineScenario[] = [
  { label: 'solo/380x620/s1', opts: { mode: 'solo', seed: 1, seconds: 60 } },
  { label: 'solo/380x620/s2', opts: { mode: 'solo', seed: 2, seconds: 60 } },
  { label: 'solo/380x620/s3', opts: { mode: 'solo', seed: 3, seconds: 60 } },
  { label: 'duel/380x620/s1', opts: { mode: 'duel', seed: 1, seconds: 60 } },
  { label: 'duel/380x620/s2', opts: { mode: 'duel', seed: 2, seconds: 60 } },
  { label: 'ai/380x620/s1', opts: { mode: 'ai', seed: 1, seconds: 60 } },
  { label: 'ai/380x620/s2', opts: { mode: 'ai', seed: 2, seconds: 60 } },
  { label: 'idle/380x620/s1', opts: { mode: 'idle', seed: 1, seconds: 60 } },
  // A short field: px/s speeds cross it faster, which is where feel bugs hide.
  { label: 'solo/380x460/s1', opts: { mode: 'solo', seed: 1, seconds: 60, height: 460 } },
  // A tablet-sized field.
  { label: 'duel/768x1024/s1', opts: { mode: 'duel', seed: 1, seconds: 60, width: 768, height: 1024 } },
];

/** The numbers a baseline records for each scenario. */
export function digest(r: RunResult): Record<string, number> {
  return {
    bursts: r.killGroups,
    ballsDestroyed: r.killBalls,
    biggestBurst: r.killBig,
    burstSize: round(r.burstSize, 4),
    p1score: r.players[0].score,
    p2score: r.players[1].score,
    p1locks: r.players[0].locks,
    p2locks: r.players[1].locks,
    p1peels: r.players[0].peels,
    p2peels: r.players[1].peels,
    throws: r.throws,
    blockedThrows: r.blockedThrows,
    ballsAvg: round(r.ballsAvg, 4),
    ballsFinal: r.ballsFinal,
    clusterAvg: round(r.clusterAvg, 4),
    clusterMax: r.clusterMax,
    worstOverlap: round(r.worst.overlap, 6),
    worstFrozen: round(r.worst.frozen, 9),
    worstOutside: round(r.worst.outside, 6),
  };
}

function round(v: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
}

export interface BaselineEntry {
  label: string;
  metrics: Record<string, number>;
}

export interface BaselineFile {
  /** Bumped when the scenario list or digest shape changes, invalidating old files. */
  version: number;
  created: string;
  scenarios: BaselineEntry[];
}

export const BASELINE_VERSION = 1;

export function measureBaseline(scenarios = BASELINE_SCENARIOS): BaselineFile {
  return {
    version: BASELINE_VERSION,
    created: new Date().toISOString(),
    scenarios: scenarios.map(s => ({ label: s.label, metrics: digest(runSim(s.opts)) })),
  };
}

export interface DiffRow {
  label: string;
  metric: string;
  before: number;
  after: number;
  delta: number;
  /** Change as a percentage of `before`, or null when `before` is zero. */
  percent: number | null;
  within: boolean;
}

/**
 * Compare a saved baseline against fresh measurements.
 *
 * `tolerancePercent` of 0 demands exact reproduction, which is the right default:
 * the runs are deterministic, so any movement at all is a real behaviour change
 * worth a human's attention.
 */
export function diffBaseline(saved: BaselineFile, fresh: BaselineFile, tolerancePercent = 0): DiffRow[] {
  const rows: DiffRow[] = [];
  const freshByLabel = new Map(fresh.scenarios.map(s => [s.label, s.metrics]));

  for (const entry of saved.scenarios) {
    const after = freshByLabel.get(entry.label);
    if (!after) {
      rows.push({ label: entry.label, metric: '(scenario missing)', before: 0, after: 0, delta: 0, percent: null, within: false });
      continue;
    }
    for (const [metric, before] of Object.entries(entry.metrics)) {
      const now = after[metric];
      if (now === undefined) {
        rows.push({ label: entry.label, metric: metric + ' (missing)', before, after: 0, delta: -before, percent: null, within: false });
        continue;
      }
      const delta = now - before;
      if (delta === 0) continue;
      const percent = before !== 0 ? (delta / Math.abs(before)) * 100 : null;
      const within = percent !== null ? Math.abs(percent) <= tolerancePercent : false;
      rows.push({ label: entry.label, metric, before, after: now, delta, percent, within });
    }
  }

  for (const s of fresh.scenarios) {
    if (!saved.scenarios.some(e => e.label === s.label)) {
      rows.push({ label: s.label, metric: '(new scenario)', before: 0, after: 0, delta: 0, percent: null, within: true });
    }
  }

  return rows;
}
