import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  KNOBS, applyKnobDefaults, applyKnobs, knobIds, parseKnobValue,
  readKnobs, restoreConfig, snapshotConfig,
} from '../../src/sim/Knobs';
import { createGame } from '../../src/game/GameState';
import { PhysicsConfig } from '../../src/physics/Config';

/**
 * Parse the `<input>`/`<select>` attributes out of index.html.
 *
 * A harness whose defaults do not match the markup measures a game nobody
 * plays: every stub knob reading zero means `kick = 0`, balls spawn motionless,
 * and the failure looks like a launcher bug rather than a harness bug.
 */
function panelMarkup(): string {
  const src = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  const start = src.indexOf('<div id="panel"');
  expect(start, 'index.html has no #panel element').toBeGreaterThan(-1);
  // The panel ends at the settings textarea that closes it; the aim/power
  // sliders that follow belong to the control strips, not the tuning panel.
  const end = src.indexOf('<textarea id="settings"', start);
  return src.slice(start, end);
}

function markupKnobs(): Record<string, Record<string, string>> {
  const src = panelMarkup();
  const out: Record<string, Record<string, string>> = {};

  for (const m of src.matchAll(/<input\s+([^>]*)>/g)) {
    const attrs = m[1];
    const id = /id="([\w-]+)"/.exec(attrs);
    if (!id) continue;
    const d: Record<string, string> = { kind: 'range' };
    for (const k of ['min', 'max', 'step', 'value', 'type']) {
      const g = new RegExp(k + '="([^"]*)"').exec(attrs);
      if (g) d[k] = g[1];
    }
    out[id[1]] = d;
  }

  for (const m of src.matchAll(/<select\s+id="([\w-]+)"\s*>([\s\S]*?)<\/select>/g)) {
    const options = [...m[2].matchAll(/<option>([^<]*)<\/option>/g)].map(o => o[1].trim());
    out[m[1]] = { kind: 'select', options: options.join('|'), value: options[0] };
  }
  return out;
}

describe('knob registry', () => {
  const markup = markupKnobs();

  it('covers exactly the controls the tuning panel renders', () => {
    // Exact equality in both directions: a panel control with no registry entry
    // is a knob the harness cannot reach, and a registry entry with no control
    // is a knob no player can set.
    expect(Object.keys(markup).sort()).toEqual(knobIds().sort());
  });

  // The registry is the single source of truth for the harness; if the markup
  // drifts from it, the simulation stops measuring the shipping defaults.
  for (const id of Object.keys(KNOBS)) {
    const def = KNOBS[id];
    it(`"${id}" matches its markup range and default`, () => {
      const m = markup[id];
      expect(m, `no control for ${id} in index.html`).toBeDefined();

      if (def.kind === 'select') {
        expect(m.options?.split('|')).toEqual(def.options);
        expect(m.value).toBe(def.default);
        return;
      }

      expect(parseFloat(m.min!), `${id} min`).toBe(def.min);
      expect(parseFloat(m.max!), `${id} max`).toBe(def.max);
      expect(parseFloat(m.step!), `${id} step`).toBe(def.step);
      expect(parseFloat(m.value!), `${id} default`).toBe(def.default);
    });
  }
});

describe('knob application', () => {
  it('applies defaults so a run starts from the real page-load state', () => {
    const snap = snapshotConfig();
    try {
      PhysicsConfig.REST = 0.1;
      applyKnobDefaults({ game: createGame(), height: 620 });
      expect(PhysicsConfig.REST).toBe(KNOBS.bounce.default);
      // bounce drives the wall restitution too, at 80% of ball-on-ball.
      expect(PhysicsConfig.REST_WALL).toBeCloseTo(0.94 * 0.8, 10);
    } finally {
      restoreConfig(snap);
    }
  });

  it('reads every knob back after applying it', () => {
    const snap = snapshotConfig();
    try {
      const ctx = { game: createGame(), height: 620 };
      applyKnobDefaults(ctx);
      applyKnobs({ burst: 0.8, minburst: 4, rain: 2.5 }, ctx);
      const read = readKnobs(ctx);
      expect(read.burst).toBe(0.8);
      expect(read.minburst).toBe(4);
      expect(read.rain).toBe(2.5);
    } finally {
      restoreConfig(snap);
    }
  });

  it('recomputes derived thresholds when a chain knob moves', () => {
    const snap = snapshotConfig();
    try {
      const ctx = { game: createGame(), height: 620 };
      applyKnobDefaults(ctx);
      const before = PhysicsConfig.SHATTER_SPEED;
      applyKnobs({ burst: 1.0 }, ctx);
      expect(PhysicsConfig.SHATTER_SPEED).not.toBe(before);
      expect(PhysicsConfig.SHATTER_SPEED).toBeCloseTo(PhysicsConfig.THROW_MAX * PhysicsConfig.SC, 6);
    } finally {
      restoreConfig(snap);
    }
  });

  it('restores shared config so one run cannot leak into the next', () => {
    const snap = snapshotConfig();
    const originalRest = PhysicsConfig.REST;
    applyKnobs({ bounce: 0.5 }, { game: createGame(), height: 620 });
    expect(PhysicsConfig.REST).toBe(0.5);
    restoreConfig(snap);
    expect(PhysicsConfig.REST).toBe(originalRest);
  });

  it('rejects unknown knobs rather than ignoring them', () => {
    expect(() => applyKnobs({ nonesuch: 1 }, { game: createGame(), height: 620 })).toThrow(/Unknown knob/);
    expect(() => parseKnobValue('nonesuch', '1')).toThrow(/Unknown knob/);
  });

  it('rejects values outside the slider range a player can reach', () => {
    expect(() => parseKnobValue('burst', '5')).toThrow(/above its maximum/);
    expect(() => parseKnobValue('burst', '0')).toThrow(/below its minimum/);
    expect(() => parseKnobValue('burst', 'loud')).toThrow(/needs a number/);
    expect(() => parseKnobValue('scale', 'Lydian')).toThrow(/must be one of/);
    expect(parseKnobValue('burst', '0.55')).toBe(0.55);
  });
});
