/**
 * A number of seconds as `m:ss`.
 *
 * The match clock is formatted in the HUD (twice: time remaining and time
 * elapsed) and again by the `match` knob's readout in the tuning panel. All
 * three wrote the same `Math.floor`/`padStart` pair out by hand.
 */
export function formatClock(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return mm + ':' + String(ss).padStart(2, '0');
}
