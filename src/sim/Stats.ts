/**
 * Small statistics helpers.
 *
 * Match-to-match variance in a chaotic simulation is large. Comparing two
 * configurations on a handful of runs reliably produces differences that sit
 * entirely inside the noise and read as findings. Every comparison this harness
 * reports therefore carries a standard error, and refuses a verdict inside 2x it.
 */

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n-1). */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** Standard error of the mean. */
export function stderr(xs: number[]): number {
  if (xs.length < 2) return 0;
  return stdev(xs) / Math.sqrt(xs.length);
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type Verdict = 'higher' | 'lower' | 'inside the noise';

export interface Estimate {
  mean: number;
  stderr: number;
  n: number;
  /** Only 'higher'/'lower' when the mean clears 2x its own standard error. */
  verdict: Verdict;
}

/** Summarise a sample as mean ± standard error, with a noise-aware verdict. */
export function estimate(xs: number[]): Estimate {
  const m = mean(xs);
  const e = stderr(xs);
  return {
    mean: m,
    stderr: e,
    n: xs.length,
    verdict: m > 2 * e ? 'higher' : m < -2 * e ? 'lower' : 'inside the noise',
  };
}

/**
 * Compare two samples by the difference of their means. `verdict` describes b
 * relative to a, and stays 'inside the noise' unless the difference clears 2x
 * the standard error of the difference.
 */
export interface Comparison {
  a: { mean: number; stderr: number; n: number };
  b: { mean: number; stderr: number; n: number };
  delta: number;
  stderr: number;
  verdict: Verdict;
  /** Difference as a fraction of a's mean, or null when a's mean is zero. */
  relative: number | null;
}

export function compare(a: number[], b: number[]): Comparison {
  const ma = mean(a), mb = mean(b);
  const ea = stderr(a), eb = stderr(b);
  const delta = mb - ma;
  const se = Math.sqrt(ea * ea + eb * eb);
  return {
    a: { mean: ma, stderr: ea, n: a.length },
    b: { mean: mb, stderr: eb, n: b.length },
    delta,
    stderr: se,
    verdict: delta > 2 * se ? 'higher' : delta < -2 * se ? 'lower' : 'inside the noise',
    relative: ma !== 0 ? delta / Math.abs(ma) : null,
  };
}

/**
 * Ground gained by whoever was behind at half time, per match. Comparing final
 * scores across configurations drowns in variance; measuring a match against
 * itself does not. Positive means the trailing player closed the gap (rubber
 * banding); negative means the leader pulled away (snowballing).
 */
export function catchUp(halfTime: [number, number], final: [number, number]): number {
  const mid = halfTime[0] - halfTime[1];
  const end = final[0] - final[1];
  const delta = end - mid;
  return mid > 0 ? -delta : delta;
}
