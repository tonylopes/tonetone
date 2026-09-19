import { PhysicsConfig } from '../physics/Config';
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

export function settingsLine(): string {
  const parts = KNOB_IDS.map(id => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return null;
    const v = el.type === 'range' ? parseFloat(el.value) : el.value;
    return id + '=' + (typeof v === 'number' ? +v.toFixed(3) : v);
  }).filter(Boolean);

  parts.push('boomspeed=' + Math.round(PhysicsConfig.BOOM_SPEED));
  parts.push('breakoutmax=' + Math.round(PhysicsConfig.KICKOUT_MAX));
  return parts.join(' ');
}
