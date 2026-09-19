import { describe, it, expect } from 'vitest';
import { PhysicsConfig, recalcThresholds, chainPercent } from '../../src/physics/Config';

describe('Physics Config module', () => {
  it('has default configuration constants', () => {
    expect(PhysicsConfig.R).toBe(12);
    expect(PhysicsConfig.MAX_BALLS).toBe(900);
    expect(PhysicsConfig.STOP).toBe(2.5);
  });

  it('recalculates thresholds accurately based on canvas height', () => {
    recalcThresholds(620);
    expect(PhysicsConfig.SC).toBe(1.0);
    // BOOM_SPEED = (THROW_MIN + (THROW_MAX - THROW_MIN) * BOOM_AT) * SC
    // (150 + 1450 * 0.4) * 1.0 = 730
    expect(PhysicsConfig.BOOM_SPEED).toBe(730);

    // KICKOUT_MAX = THROW_MAX * KICKOUT_FRAC * SC
    // 1600 * 0.5 * 1 = 800
    expect(PhysicsConfig.KICKOUT_MAX).toBe(800);
  });

  it('clamps screen scale factor SC between 0.5 and 1.8', () => {
    recalcThresholds(100);
    expect(PhysicsConfig.SC).toBe(0.5);

    recalcThresholds(3000);
    expect(PhysicsConfig.SC).toBe(1.8);
  });

  it('calculates chainPercent within 0 to 100 range', () => {
    recalcThresholds(620);
    const pct = chainPercent();
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});
