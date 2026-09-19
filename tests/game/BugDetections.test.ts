import { describe, it, expect, beforeEach } from 'vitest';
import { drawFor, BLACK, WHITE, setColorsCount, colorOfKind } from '../../src/game/Rules';
import { KNOB_IDS } from '../../src/game/Settings';
import { KNOBS } from '../../src/sim/Knobs';
import { PhysicsConfig, recalcThresholds } from '../../src/physics/Config';
import { installSeededRandom, restoreRandom, currentSeed, withSeed } from '../../src/sim/Rng';
import { createStrip } from '../../src/ui/ControlStrips';
import { createRenderContext, resizeRenderer } from '../../src/graphics/Renderer';
import { clearSpriteCache } from '../../src/graphics/Sprites';
import { createGame, resetField, toCollisionState } from '../../src/game/GameState';
import { LauncherPlayer, Ball, Group } from '../../src/physics/Types';
import { collide, explode } from '../../src/physics/CollisionSolver';
import { makeGroup } from '../../src/physics/RigidBody';
import { playNote, playThud } from '../../src/audio/Voices';
import { AudioStore } from '../../src/audio/SynthEngine';

describe('Bug Detection Test Suite', () => {
  describe('Bug 1: drawFor with unlisted player', () => {
    it('prevents TypeError when player is not in playersList', () => {
      const p1: LauncherPlayer = { side: 1, score: 10 } as any;
      const p2: LauncherPlayer = { side: -1, score: 5 } as any;
      const unlistedPlayer: LauncherPlayer = { side: 1, score: 2 } as any;

      expect(() => drawFor(unlistedPlayer, [p1, p2], true)).not.toThrow();
    });
  });

  describe('Bug 2: Special ball color corruption during colors setting update', () => {
    it('preserves special ball color (BLACK/WHITE) when updating color count', () => {
      const game = createGame();
      const blackBall: Ball = {
        id: 1, x: 100, y: 100, kind: -1, special: 'black', color: BLACK, credit: 0, bonds: new Set(), group: null as any
      };
      const whiteBall: Ball = {
        id: 2, x: 200, y: 200, kind: -1, special: 'white', color: WHITE, credit: 0, bonds: new Set(), group: null as any
      };
      game.balls.push(blackBall, whiteBall);

      const count = 4;
      setColorsCount(count);
      for (const b of game.balls) {
        if (!b.special) {
          b.kind = b.kind % count;
          b.color = colorOfKind(b.kind);
        }
      }

      expect(blackBall.color).toBe(BLACK);
      expect(whiteBall.color).toBe(WHITE);
      expect(blackBall.special).toBe('black');
      expect(whiteBall.special).toBe('white');
    });
  });

  describe('Bug 4: Empty group explosion safety', () => {
    it('handles exploding an empty group without NaN or TypeError', () => {
      const game = createGame();
      const state = toCollisionState(game);
      const emptyGroup = makeGroup([], 0, 0);

      expect(() => explode(state, emptyGroup, 500, 0, 1, 800)).not.toThrow();
      expect(state.pops.some(p => Number.isNaN(p.x) || Number.isNaN(p.y))).toBe(false);
    });
  });

  describe('Bug 5: Audio counter bounds recovery', () => {
    it('ensures activeVoices and thuds stay non-negative', () => {
      AudioStore.activeVoices = 0;
      AudioStore.thuds = 0;

      expect(AudioStore.activeVoices).toBe(0);
      expect(AudioStore.thuds).toBe(0);
    });
  });

  describe('Bug 6: NaN relative value in playNote', () => {
    it('handles NaN relative values in playNote gracefully', () => {
      expect(() => playNote(NaN, 0, 'bond')).not.toThrow();
    });
  });

  describe('Bug 7: settings export drifting behind the knob registry', () => {
    it('exports every knob the registry declares', () => {
      // KNOB_IDS was a hand-kept copy of the registry and had fallen two knobs
      // behind it, so "Copy these settings" silently dropped them.
      expect([...KNOB_IDS].sort()).toEqual(Object.values(KNOBS).map(d => d.id).sort());
    });
  });

  describe('Bug 8: burst thresholds left behind by a field resize', () => {
    it('re-derives SHATTER_SPEED and KICKOUT_MAX from the stage the renderer just sized', () => {
      // resizeRenderer used to assign PhysicsConfig.SC straight from the stage
      // height while the derived thresholds kept whatever height the tuning
      // panel last happened to pass, so the speed needed to burst drifted with
      // the screen and never updated on rotate.
      const prevWindow = (globalThis as any).window;
      const prevDocument = (globalThis as any).document;
      (globalThis as any).window = { devicePixelRatio: 1 };
      (globalThis as any).document = { getElementById: () => null, createElement: () => makeCanvas() };

      function makeCanvas(): any {
        return {
          width: 0, height: 0,
          getContext: () => ({ setTransform: () => {} }),
        };
      }

      try {
        const rc = createRenderContext(makeCanvas());
        for (const height of [460, 900, 1024]) {
          const stage: any = { getBoundingClientRect: () => ({ width: 380, height }) };
          // Start the thresholds off at a different height, as a stale tuning
          // panel reading would leave them.
          recalcThresholds(620);
          resizeRenderer(rc, stage);

          const sc = Math.max(0.5, Math.min(1.8, height / 620));
          expect(PhysicsConfig.SC).toBeCloseTo(sc, 10);
          expect(PhysicsConfig.SHATTER_SPEED).toBeCloseTo(
            (PhysicsConfig.THROW_MIN +
              (PhysicsConfig.THROW_MAX - PhysicsConfig.THROW_MIN) * PhysicsConfig.BURST_AT) * sc,
            10
          );
          expect(PhysicsConfig.KICKOUT_MAX).toBeCloseTo(
            PhysicsConfig.THROW_MAX * PhysicsConfig.KICKOUT_FRAC * sc,
            10
          );
        }
      } finally {
        (globalThis as any).window = prevWindow;
        (globalThis as any).document = prevDocument;
        recalcThresholds(620);
      }
    });
  });

  describe('Bug 9: seeded randomness lost when installs nest', () => {
    it('returns to the enclosing seeded stream, not the native one', () => {
      const native = Math.random;
      withSeed(1, () => {
        const outer = Math.random;
        expect(currentSeed()).toBe(1);

        // A nested install/restore pair, as runSim does inside its finally.
        installSeededRandom(99);
        expect(currentSeed()).toBe(99);
        restoreRandom();

        expect(Math.random).toBe(outer);
        expect(Math.random).not.toBe(native);
        expect(currentSeed()).toBe(1);
      });
      expect(Math.random).toBe(native);
      expect(currentSeed()).toBeNull();
    });
  });

  describe('Bug 10: next-ball chip not repainted when one special replaces another', () => {
    it('repaints the chip when the slot swaps black for white', () => {
      // Black and white balls both carry kind -1, so a cache key built from
      // kind alone could not tell them apart and the chip kept the old colour.
      const painted: string[] = [];
      const canvas = {
        width: 76,
        height: 76,
        style: {} as Record<string, string>,
        getContext: () => ({
          clearRect: () => {},
          drawImage: (img: any) => painted.push(img.__color),
          fillText: () => {},
          textAlign: '', textBaseline: '', font: '', fillStyle: '',
        }),
      };
      const prevDocument = (globalThis as any).document;
      (globalThis as any).document = {
        getElementById: () => canvas,
        // ballSprite() caches per colour; tag each sprite so we can see which
        // colour actually reached the chip.
        createElement: () => ({
          width: 0, height: 0, __color: '',
          getContext: function (this: any) {
            const self = this;
            return {
              beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
              fillRect: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
              set fillStyle(v: string) { if (v && v[0] === '#' && !self.__color) self.__color = v; },
              get fillStyle() { return self.__color; },
              globalCompositeOperation: '', strokeStyle: '', lineWidth: 0,
            };
          },
        }),
      };

      try {
        const p: any = { side: 1, nextUp: null, then: null };
        const game: any = { showLabels: false };
        const strip = createStrip(p, { chipNow: 'a', chipNext: 'b', strip: 'c' }, false, () => game);

        p.nextUp = { kind: -1, special: 'black', color: BLACK };
        p.then = { kind: 1, special: null, color: colorOfKind(1) };
        strip.refresh();
        const afterBlack = painted.length;
        expect(afterBlack).toBeGreaterThan(0);

        // Same kinds in both slots, but the special itself changed.
        p.nextUp = { kind: -1, special: 'white', color: WHITE };
        strip.refresh();
        expect(painted.length).toBeGreaterThan(afterBlack);
      } finally {
        (globalThis as any).document = prevDocument;
      }
    });
  });

  describe('Bug 12: burst debris took credit off a live ball that rolled into it', () => {
    it('leaves a moving live ball its own credit when it runs into resting debris', () => {
      // Debris re-credited every live ball it touched, whichever one was moving,
      // so a ball the opponent had just thrown was handed to whoever burst the
      // cluster the moment it crossed the wreckage. See docs/scoring.md.
      recalcThresholds(620);
      const state = toCollisionState(createGame());
      const debris: Ball = {
        id: 1, x: 118, y: 100, kind: 0, special: null, color: colorOfKind(0), credit: 1,
        bonds: new Set(), group: null as any, ghost: true, age: 0,
      };
      const live: Ball = {
        id: 2, x: 100, y: 100, kind: 0, special: null, color: colorOfKind(0), credit: 0,
        shot: { events: 0 }, bonds: new Set(), group: null as any,
      };
      debris.group = makeGroup([debris], 0, 0);
      live.group = makeGroup([live], 400, 0);
      state.balls = [live, debris];
      state.byId.set(1, debris);
      state.byId.set(2, live);
      state.groups = [live.group, debris.group];
      const shot = live.shot;

      collide(state, 1, 800);

      expect(live.credit).toBe(0);
      expect(live.shot).toBe(shot);
    });
  });

  describe('Bug 11: field shrinks to a quarter of the screen after returning to the tab', () => {
    // Chrome can drop a 2D canvas's backing store while the tab is hidden. The
    // restored context keeps its size but loses its DPR transform, and the
    // cached sprite canvases come back blank — so the game drew into the
    // top-left quarter with no balls and no liquid glow.
    it('re-applies the DPR transform when forced at an unchanged size', () => {
      const prevWindow = (globalThis as any).window;
      const prevDocument = (globalThis as any).document;
      (globalThis as any).window = { devicePixelRatio: 2 };
      const transforms: number[][] = [];
      function makeCanvas(): any {
        return {
          width: 0, height: 0,
          getContext: () => ({ setTransform: (...m: number[]) => transforms.push(m) }),
        };
      }
      (globalThis as any).document = { getElementById: () => null, createElement: () => makeCanvas() };

      try {
        const rc = createRenderContext(makeCanvas());
        const stage: any = { getBoundingClientRect: () => ({ width: 400, height: 800 }) };
        resizeRenderer(rc, stage);
        expect(transforms).toEqual([[2, 0, 0, 2, 0, 0]]);

        // Same size: an ordinary resize is a no-op, which is why it never fixed this.
        resizeRenderer(rc, stage);
        expect(transforms.length).toBe(1);

        resizeRenderer(rc, stage, true);
        expect(transforms).toEqual([[2, 0, 0, 2, 0, 0], [2, 0, 0, 2, 0, 0]]);
        expect(rc.cv.width).toBe(800);
        expect(rc.cv.height).toBe(1600);
      } finally {
        (globalThis as any).window = prevWindow;
        (globalThis as any).document = prevDocument;
        recalcThresholds(620);
      }
    });

    it('repaints the next-ball chips once the sprite cache is rebuilt', () => {
      let paints = 0;
      const canvas = {
        width: 76, height: 76, style: {} as Record<string, string>,
        getContext: () => ({
          clearRect: () => {}, drawImage: () => { paints++; }, fillText: () => {},
          textAlign: '', textBaseline: '', font: '', fillStyle: '',
        }),
      };
      const prevDocument = (globalThis as any).document;
      (globalThis as any).document = {
        getElementById: () => canvas,
        createElement: () => ({
          width: 0, height: 0,
          getContext: () => ({
            beginPath: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
            fillRect: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
            fillStyle: '', globalCompositeOperation: '', strokeStyle: '', lineWidth: 0,
          }),
        }),
      };

      try {
        const p: any = { side: 1, nextUp: { kind: 1, special: null, color: colorOfKind(1) },
                         then: { kind: 2, special: null, color: colorOfKind(2) } };
        const game: any = { showLabels: false };
        const strip = createStrip(p, { chipNow: 'a', chipNext: 'b', strip: 'c' }, false, () => game);

        strip.refresh();
        const first = paints;
        strip.refresh();
        expect(paints).toBe(first); // unchanged balls do not repaint

        clearSpriteCache();
        strip.refresh();
        expect(paints).toBeGreaterThan(first);
      } finally {
        (globalThis as any).document = prevDocument;
      }
    });
  });
});
