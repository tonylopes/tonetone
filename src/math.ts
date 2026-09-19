/**
 * One turn, in radians.
 *
 * The circle constant was written 43 times in two spellings: `Math.PI * 2` at 29
 * sites and the rounded literal `6.2832` at 14. They are not the same number —
 * `6.2832` is 1.4e-5 larger — so the two spellings were not interchangeable
 * everywhere, only almost everywhere.
 *
 * Everything that draws is display only and cannot move the simulation, so those
 * sites took `TAU` unconditionally. The two `Math.random() * 6.2832` sites in
 * `physics/CollisionSolver.ts` are the only ones where the difference could
 * reach the baseline; they pick a random direction for two ball centres that
 * have landed within 1e-6 px of each other, and the baseline is unchanged by
 * the swap.
 */
export const TAU = Math.PI * 2;
