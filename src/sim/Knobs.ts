/**
 * The tunable-knob registry.
 *
 * Every knob the game exposes is defined once, here: its range, its default, how
 * it is applied, and how it reads back. The in-game tuning panel
 * (`ui/SettingsModal.ts`) binds DOM inputs to these definitions, and the
 * simulation harness drives the same definitions by name. A knob therefore
 * cannot mean one thing to a player dragging a slider and another to a
 * simulation measuring its effect.
 *
 * Knob ids match the `<input>` ids in `index.html`; `tests/sim/Knobs.test.ts`
 * asserts the markup's min/max/step/value still agree with the registry.
 */
import { Game } from '../game/GameState';
import { PhysicsConfig, chainPercent, recalcThresholds } from '../physics/Config';
import { COLORS, SHOT_DECAY, SPECIALS, colorOfKind, setColorsCount, setShotDecay, setSpecialsToggle } from '../game/Rules';
import { AudioStore, applyDrone, applyGain, buildScale, setLatencyHint } from '../audio/SynthEngine';

export type KnobValue = number | string;

export interface KnobContext {
  game: Game;
  /** Field height, used by knobs that recompute scale-derived thresholds. */
  height: number;
}

export interface KnobDef {
  id: string;
  /** Which panel section the knob belongs to. */
  group: 'game' | 'physics' | 'chain' | 'audio';
  kind: 'range' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  default: KnobValue;
  /** Audio knobs need the AudioContext resumed before they mean anything. */
  wakesAudio?: boolean;
  /** True for knobs with no effect on simulation outcomes (visual/audio only). */
  cosmetic?: boolean;
  apply(value: any, ctx: KnobContext): void;
  format(value: any, ctx: KnobContext): string;
  read(ctx: KnobContext): KnobValue;
}

function pct(v: number): string {
  return Math.round(v * 100) + '%';
}

export const KNOBS: Record<string, KnobDef> = {
  specials: {
    id: 'specials', group: 'game', kind: 'range', min: 0, max: 1, step: 1, default: 1,
    apply: v => setSpecialsToggle(v > 0),
    format: v => (v > 0 ? 'on' : 'off'),
    read: () => (SPECIALS ? 1 : 0),
  },

  colours: {
    id: 'colours', group: 'game', kind: 'range', min: 3, max: 6, step: 1, default: 3,
    apply: (v, { game }) => {
      setColorsCount(v);
      for (const b of game.balls) {
        if (!b.special) {
          b.kind = b.kind % v;
          b.color = colorOfKind(b.kind);
        }
      }
      for (const g of game.groups) if (g.members.length > 1) g.color = colorOfKind(g.members[0].kind);
      for (const p of game.players) {
        for (const slot of ['loaded', 'nextUp', 'then'] as const) {
          if (p[slot] && !p[slot]!.special) {
            p[slot]!.kind = p[slot]!.kind % v;
            p[slot]!.color = colorOfKind(p[slot]!.kind);
          }
        }
      }
    },
    format: v => String(v),
    read: () => COLORS,
  },

  labels: {
    id: 'labels', group: 'game', kind: 'range', min: 0, max: 1, step: 1, default: 0, cosmetic: true,
    apply: (v, { game }) => { game.showLabels = v > 0; },
    format: v => (v > 0 ? 'on' : 'off'),
    read: ({ game }) => (game.showLabels ? 1 : 0),
  },

  stats: {
    id: 'stats', group: 'game', kind: 'range', min: 0, max: 1, step: 1, default: 0, cosmetic: true,
    apply: (v, { game }) => { game.showStats = v > 0; },
    format: v => (v > 0 ? 'on' : 'off'),
    read: ({ game }) => (game.showStats ? 1 : 0),
  },

  match: {
    // 1:00 to 20:00 in half-minute steps. 0 is off the slider but still a legal
    // value: the harness sets `matchLen = 0` for an unwindowed run, so `format`
    // still has to name it.
    id: 'match', group: 'game', kind: 'range', min: 60, max: 1200, step: 30, default: 180,
    apply: (v, { game }) => { game.matchLen = v; },
    format: v => (v === 0 ? 'endless' : Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0')),
    read: ({ game }) => game.matchLen,
  },

  size: {
    id: 'size', group: 'game', kind: 'range', min: 8, max: 26, step: 1, default: 12,
    apply: (v, { game }) => {
      PhysicsConfig.R = v;
      for (const g of game.groups) {
        g.inertia = 0;
        for (const o of g.offsets) {
          g.inertia += o.x * o.x + o.y * o.y + (PhysicsConfig.R * PhysicsConfig.R) / 2;
        }
      }
    },
    format: () => String(Math.round(PhysicsConfig.R)),
    read: () => PhysicsConfig.R,
  },

  rain: {
    id: 'rain', group: 'game', kind: 'range', min: 0, max: 10, step: 0.5, default: 0,
    apply: (v, { game }) => { game.rainInterval = v; },
    format: v => (v === 0 ? 'auto (low density)' : v.toFixed(1) + 's'),
    read: ({ game }) => game.rainInterval,
  },

  shotdecay: {
    // Each further scoring event from one throw pays this fraction of the last.
    id: 'shotdecay', group: 'game', kind: 'range', min: 0.3, max: 1, step: 0.05, default: 0.5,
    apply: v => setShotDecay(v),
    format: v => (v >= 1 ? 'no decay' : '×' + v.toFixed(2)),
    read: () => SHOT_DECAY,
  },

  roll: {
    id: 'roll', group: 'physics', kind: 'range', min: 0.15, max: 1, step: 0.01, default: 0.45,
    apply: v => { PhysicsConfig.DRAG = v; },
    format: v => (v >= 0.999 ? 'none' : Math.round(Math.log(500 / PhysicsConfig.STOP) / Math.log(1 / v)) + 's'),
    read: () => PhysicsConfig.DRAG,
  },

  bounce: {
    id: 'bounce', group: 'physics', kind: 'range', min: 0.5, max: 1, step: 0.01, default: 0.94,
    apply: v => { PhysicsConfig.REST = v; PhysicsConfig.REST_WALL = v * 0.8; },
    format: v => pct(v),
    read: () => PhysicsConfig.REST,
  },

  spin: {
    id: 'spin', group: 'physics', kind: 'range', min: 0, max: 1, step: 0.05, default: 1,
    apply: v => { PhysicsConfig.SPIN = v; },
    format: v => pct(v),
    read: () => PhysicsConfig.SPIN,
  },

  kick: {
    id: 'kick', group: 'physics', kind: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1,
    apply: v => { PhysicsConfig.KICK = v; },
    format: v => v.toFixed(1) + '×',
    read: () => PhysicsConfig.KICK,
  },

  reload: {
    id: 'reload', group: 'physics', kind: 'range', min: 0, max: 8, step: 0.5, default: 3,
    apply: (v, { game }) => { game.reloadTime = v; },
    format: v => (v === 0 ? 'off' : v.toFixed(1) + 's'),
    read: ({ game }) => game.reloadTime,
  },

  burst: {
    id: 'burst', group: 'chain', kind: 'range', min: 0.2, max: 1, step: 0.05, default: 0.4,
    apply: (v, { height }) => { PhysicsConfig.BURST_AT = v; recalcThresholds(height); },
    format: v => pct(v),
    read: () => PhysicsConfig.BURST_AT,
  },

  maxpower: {
    id: 'maxpower', group: 'chain', kind: 'range', min: 600, max: 2000, step: 50, default: 1600,
    apply: (v, { height }) => { PhysicsConfig.THROW_MAX = v; recalcThresholds(height); },
    format: v => String(v),
    read: () => PhysicsConfig.THROW_MAX,
  },

  kickout: {
    id: 'kickout', group: 'chain', kind: 'range', min: 0.3, max: 1.2, step: 0.05, default: 0.5,
    apply: (v, { height }) => { PhysicsConfig.KICKOUT_FRAC = v; recalcThresholds(height); },
    format: v => Math.round(v * 100) + '% /' + chainPercent() + '%',
    read: () => PhysicsConfig.KICKOUT_FRAC,
  },

  spread: {
    id: 'spread', group: 'chain', kind: 'range', min: 0.5, max: 2, step: 0.05, default: 2,
    apply: v => { PhysicsConfig.GHOST_SPREAD_HI = v; },
    format: v => v.toFixed(2) + '×',
    read: () => PhysicsConfig.GHOST_SPREAD_HI,
  },

  speedcap: {
    id: 'speedcap', group: 'chain', kind: 'range', min: 600, max: 3600, step: 100, default: 3200,
    apply: v => { PhysicsConfig.SPEED_CAP = v; },
    format: v => v + ' px/s',
    read: () => PhysicsConfig.SPEED_CAP,
  },

  minburst: {
    id: 'minburst', group: 'chain', kind: 'range', min: 1, max: 6, step: 1, default: 2,
    apply: v => { PhysicsConfig.MIN_BURST = v; },
    format: v => (v <= 1 ? 'any' : v + '+'),
    read: () => PhysicsConfig.MIN_BURST,
  },

  scale: {
    id: 'scale', group: 'audio', kind: 'select', default: 'Minor pentatonic', wakesAudio: true, cosmetic: true,
    options: ['Minor pentatonic', 'Major pentatonic', 'Hirajoshi', 'Kumoi', 'Whole tone'],
    apply: v => { AudioStore.scale = buildScale(v); },
    format: () => '',
    read: () => 'Minor pentatonic',
  },

  latency: {
    id: 'latency', group: 'audio', kind: 'range', min: 0, max: 0.2, step: 0.01, default: 0.05,
    wakesAudio: true, cosmetic: true,
    apply: v => { setLatencyHint(v as number); },
    format: v => (v ? Math.round((v as number) * 1000) + 'ms' : 'auto'),
    read: () => AudioStore.latency,
  },

  haptics: {
    id: 'haptics', group: 'audio', kind: 'range', min: 0, max: 1, step: 1, default: 1, cosmetic: true,
    apply: v => { AudioStore.haptics = v as number; },
    format: v => (v ? 'on' : 'off'),
    read: () => AudioStore.haptics,
  },

  vol: {
    id: 'vol', group: 'audio', kind: 'range', min: 0, max: 2, step: 0.05, default: 0.9, wakesAudio: true, cosmetic: true,
    apply: v => { AudioStore.volume = v; applyGain(); },
    format: v => pct(v),
    read: () => AudioStore.volume,
  },

  lock: {
    id: 'lock', group: 'audio', kind: 'range', min: 0, max: 2, step: 0.05, default: 0.5, wakesAudio: true, cosmetic: true,
    apply: v => { AudioStore.lockVol = v; },
    format: v => pct(v),
    read: () => AudioStore.lockVol,
  },

  brk: {
    id: 'brk', group: 'audio', kind: 'range', min: 0, max: 2, step: 0.05, default: 1.7, wakesAudio: true, cosmetic: true,
    apply: v => { AudioStore.breakVol = v; },
    format: v => pct(v),
    read: () => AudioStore.breakVol,
  },

  burstvol: {
    id: 'burstvol', group: 'audio', kind: 'range', min: 0, max: 2, step: 0.05, default: 1, wakesAudio: true, cosmetic: true,
    apply: v => { AudioStore.burstVol = v; },
    format: v => pct(v),
    read: () => AudioStore.burstVol,
  },

  clicks: {
    id: 'clicks', group: 'audio', kind: 'range', min: 0, max: 2, step: 0.05, default: 0.5, wakesAudio: true, cosmetic: true,
    apply: v => { AudioStore.clickVol = v; },
    format: v => pct(v),
    read: () => AudioStore.clickVol,
  },

  drone: {
    id: 'drone', group: 'audio', kind: 'range', min: 0, max: 1, step: 0.05, default: 1, wakesAudio: true, cosmetic: true,
    apply: v => { AudioStore.drone = v; applyDrone(); },
    format: v => (v === 0 ? 'off' : pct(v)),
    read: () => AudioStore.drone,
  },
};

/** Knob ids that can change what a simulation measures. */
export const SIM_KNOBS = Object.keys(KNOBS).filter(id => !KNOBS[id].cosmetic);

export function knobIds(): string[] {
  return Object.keys(KNOBS);
}

/**
 * Coerce a knob value written on a command line ("0.6", "Hirajoshi") into the
 * type the knob expects, and reject values outside the slider's range — an
 * out-of-range knob measures a game no player can reach.
 */
export function parseKnobValue(id: string, raw: string): KnobValue {
  const def = KNOBS[id];
  if (!def) throw new Error(`Unknown knob "${id}". Known knobs: ${knobIds().join(', ')}`);
  if (def.kind === 'select') {
    if (def.options && !def.options.includes(raw)) {
      throw new Error(`Knob "${id}" must be one of: ${def.options.join(', ')}`);
    }
    return raw;
  }
  const v = parseFloat(raw);
  if (!isFinite(v)) throw new Error(`Knob "${id}" needs a number, got "${raw}"`);
  if (def.min !== undefined && v < def.min) throw new Error(`Knob "${id}" is below its minimum ${def.min}`);
  if (def.max !== undefined && v > def.max) throw new Error(`Knob "${id}" is above its maximum ${def.max}`);
  return v;
}

/** Apply a set of knob values by id. Unknown ids throw rather than pass silently. */
export function applyKnobs(values: Record<string, KnobValue>, ctx: KnobContext): void {
  for (const [id, value] of Object.entries(values)) {
    const def = KNOBS[id];
    if (!def) throw new Error(`Unknown knob "${id}". Known knobs: ${knobIds().join(', ')}`);
    def.apply(value, ctx);
  }
}

/** Apply every knob's documented default — the state a fresh page load produces. */
export function applyKnobDefaults(ctx: KnobContext): void {
  for (const def of Object.values(KNOBS)) def.apply(def.default, ctx);
}

/** Read back the live value of every knob. */
export function readKnobs(ctx: KnobContext): Record<string, KnobValue> {
  const out: Record<string, KnobValue> = {};
  for (const [id, def] of Object.entries(KNOBS)) out[id] = def.read(ctx);
  return out;
}

/**
 * Module-level config is shared mutable state, so any harness run that tunes a
 * knob must put it back. Snapshot/restore covers PhysicsConfig wholesale, plus
 * the Rules and AudioStore fields knobs reach into.
 */
export interface ConfigSnapshot {
  physics: typeof PhysicsConfig;
  colors: number;
  specials: boolean;
  shotDecay: number;
  audio: { volume: number; lockVol: number; breakVol: number; burstVol: number; clickVol: number; drone: number; haptics: number; latency: number };
}

export function snapshotConfig(): ConfigSnapshot {
  return {
    physics: { ...PhysicsConfig },
    colors: COLORS,
    specials: SPECIALS,
    shotDecay: SHOT_DECAY,
    audio: {
      volume: AudioStore.volume, lockVol: AudioStore.lockVol, breakVol: AudioStore.breakVol,
      burstVol: AudioStore.burstVol, clickVol: AudioStore.clickVol, drone: AudioStore.drone,
      haptics: AudioStore.haptics, latency: AudioStore.latency,
    },
  };
}

export function restoreConfig(snap: ConfigSnapshot): void {
  Object.assign(PhysicsConfig, snap.physics);
  setColorsCount(snap.colors);
  setSpecialsToggle(snap.specials);
  setShotDecay(snap.shotDecay);
  Object.assign(AudioStore, snap.audio);
}
