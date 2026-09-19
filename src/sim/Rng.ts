/**
 * Deterministic randomness for headless simulation.
 *
 * The game draws on `Math.random()` from roughly a dozen sites spread across
 * GameState, Rules, CollisionSolver and AI — spawn positions, ghost scatter
 * directions, special-ball draws, AI target strength. Threading a generator
 * through all of them would be invasive, and any call site added later would
 * silently reintroduce nondeterminism.
 *
 * So the harness swaps `Math.random` itself. That is total: code the harness has
 * never heard of still becomes reproducible, which is the property the whole
 * simulation tool rests on.
 */

/** Mulberry32 — small, fast, well-distributed enough for simulation work. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generators displaced by an install, innermost last.
 *
 * A stack rather than a single slot because installs genuinely nest: a `runSim`
 * called inside a `withSeed` block used to restore the *native* generator when
 * it finished, silently dropping the enclosing block back onto unseeded
 * randomness for the rest of its run.
 */
const displaced: { random: () => number; seed: number | null }[] = [];
let activeSeed: number | null = null;

/**
 * Replace `Math.random` with a seeded generator. Nests: each install remembers
 * what it displaced, and `restoreRandom` puts back the generator from one level
 * out, which is the native one at the outermost level.
 */
export function installSeededRandom(seed: number): void {
  displaced.push({ random: Math.random, seed: activeSeed });
  activeSeed = seed >>> 0;
  Math.random = mulberry32(activeSeed);
}

/** Undo one install. Safe to call when nothing is installed. */
export function restoreRandom(): void {
  const prev = displaced.pop();
  if (!prev) return;
  Math.random = prev.random;
  activeSeed = prev.seed;
}

/** The seed currently installed, or null when running on native randomness. */
export function currentSeed(): number | null {
  return activeSeed;
}

/** Run `fn` under a seeded `Math.random`, restoring the previous state after. */
export function withSeed<T>(seed: number, fn: () => T): T {
  installSeededRandom(seed);
  try {
    return fn();
  } finally {
    restoreRandom();
  }
}
