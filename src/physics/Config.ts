export const PhysicsConfig = {
  R: 12,                  // ball radius
  DRAG: 0.59,             // velocity kept per second (knob `roll`)
  REST: 1,                // ball-on-ball bounce (knob `bounce`)
  REST_WALL: 0.8,         // rail bounce (knob `bounce` x 0.8)
  KICK: 1.2,              // launch speed multiplier (knob `kick`)
  SPIN: 1,                // group rotation speed multiplier
  STOP: 2.5,              // speed below which a group parks
  MAX_BALLS: 900,         // safety cap
  RULE_SPEED: 12,         // resting threshold speed
  THROW_MIN: 150,
  THROW_MAX: 1600,
  BOOM_AT: 0.4,
  KICKOUT_FRAC: 0.5,
  DUEL_POWER: 2,
  POWER_CURVE: 1.8,
  MIN_BOOM: 2,
  SPEED_CAP: 3200,
  GHOST_LIFE: 9,
  KICKOUT_MIN: 240,
  GHOST_SPREAD_LO: 0.30,
  GHOST_SPREAD_HI: 2.0,
  SC: 1,                  // screen scale factor
  BOOM_SPEED: 820,     // dynamic threshold
  KICKOUT_MAX: 800,       // dynamic ceiling
};

export function recalcThresholds(height: number) {
  PhysicsConfig.SC = Math.max(0.5, Math.min(1.8, height / 620));
  PhysicsConfig.BOOM_SPEED = (PhysicsConfig.THROW_MIN + (PhysicsConfig.THROW_MAX - PhysicsConfig.THROW_MIN) * PhysicsConfig.BOOM_AT) * PhysicsConfig.SC;
  PhysicsConfig.KICKOUT_MAX = PhysicsConfig.THROW_MAX * PhysicsConfig.KICKOUT_FRAC * PhysicsConfig.SC;
}

export function chainPercent(): number {
  const span = PhysicsConfig.KICKOUT_MAX - PhysicsConfig.KICKOUT_MIN;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((PhysicsConfig.KICKOUT_MAX - PhysicsConfig.BOOM_SPEED) / span * 100)));
}
