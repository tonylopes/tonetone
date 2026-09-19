import { KNOBS } from '../sim/Knobs';

/**
 * Every knob the registry declares, in declaration order.
 *
 * Derived rather than hand-listed: the hand-listed copy had fallen two knobs
 * behind the registry (`haptics` and `latency`), so exported settings silently
 * omitted them. The registry is the single declaration point for a knob, and
 * this list now follows it by construction.
 */
export const KNOB_IDS = Object.values(KNOBS).map(def => def.id);

/**
 * Every knob's current value, as a line that can be pasted straight into the
 * harness: `npm run sim -- run --set "<this line>"`.
 *
 * It used to be joined with spaces while `--set` splits on commas, and it appended
 * `boomspeed` and `breakoutmax`, which are not knobs. Pasting it therefore either
 * failed or — before `parseKnobValue` was tightened — silently applied only the
 * first knob and ran anyway. Reproducing a browser session in the harness had to
 * be done by hand.
 *
 * The two appended values are left out because they are derived: `recalcThresholds`
 * recomputes both from the knobs and the field height, so reproducing the knobs
 * reproduces them. The one thing the line still cannot carry is that height, which
 * scales both; pass the same `--height` to reproduce a session exactly.
 */
export function settingsLine(): string {
  const parts = KNOB_IDS.map(id => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return null;
    const v = el.type === 'range' ? parseFloat(el.value) : el.value;
    return id + '=' + (typeof v === 'number' ? +v.toFixed(3) : v);
  }).filter(Boolean);

  return parts.join(',');
}
