export const PhysicsConfig = {
  R: 12,                  // ball radius
  DRAG: 0.45,             // velocity kept per second
  REST: 0.94,             // ball-on-ball bounce
  REST_WALL: 0.75,        // rail bounce
  KICK: 1,                // launch speed multiplier
  SPIN: 1,                // cluster rotation speed multiplier
  STOP: 2.5,              // speed below which a group parks
  MAX_BALLS: 900,         // safety cap
  RULE_SPEED: 12,         // resting threshold speed
  THROW_MIN: 150,
  THROW_MAX: 1600,
  BURST_AT: 0.4,
  KICKOUT_FRAC: 0.5,
  DUEL_POWER: 2,
  POWER_CURVE: 1.8,
  MIN_BURST: 2,
  SPEED_CAP: 3200,
  GHOST_LIFE: 9,
  KICKOUT_MIN: 240,
  GHOST_SPREAD_LO: 0.30,
  GHOST_SPREAD_HI: 2.0,
  SC: 1,                  // screen scale factor
  SHATTER_SPEED: 820,     // dynamic threshold
  KICKOUT_MAX: 800,       // dynamic ceiling
};

export function recalcThresholds(height: number) {
  PhysicsConfig.SC = Math.max(0.5, Math.min(1.8, height / 620));
  PhysicsConfig.SHATTER_SPEED = (PhysicsConfig.THROW_MIN + (PhysicsConfig.THROW_MAX - PhysicsConfig.THROW_MIN) * PhysicsConfig.BURST_AT) * PhysicsConfig.SC;
  PhysicsConfig.KICKOUT_MAX = PhysicsConfig.THROW_MAX * PhysicsConfig.KICKOUT_FRAC * PhysicsConfig.SC;
}

export function chainPercent(): number {
  const span = PhysicsConfig.KICKOUT_MAX - PhysicsConfig.KICKOUT_MIN;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((PhysicsConfig.KICKOUT_MAX - PhysicsConfig.SHATTER_SPEED) / span * 100)));
}
