import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drawPops, drawOneLauncher, popCenterX, POP_EDGE_PAD, RenderContext, P_COLOR } from '../../src/graphics/Renderer';
import { AIM_HOT, CYAN, PINK, VOID, WHITE, rgba } from '../../src/graphics/Palette';
import { recalcThresholds } from '../../src/physics/Config';
import { restoreConfig, snapshotConfig } from '../../src/sim/Knobs';
import { createGame } from '../../src/game/GameState';

function createMockContext() {
  const fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    font: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    textAlign: '',
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillText: vi.fn((text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y });
    }),
    // Stand-in for real text metrics: 10px a character, so widths are predictable.
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  } as unknown as CanvasRenderingContext2D;

  return { ctx, fillTextCalls };
}

describe('Renderer module - drawPops', () => {
  it('renders score pops with source-over blending, player color, and black glow shadow', () => {
    const { ctx, fillTextCalls } = createMockContext();
    const rc: RenderContext = {
      cv: {} as any,
      ctx,
      bg: {} as any,
      bgx: {} as any,
      W: 800,
      H: 600,
      bgW: 100,
      bgH: 100,
    };

    const game = createGame();
    game.pops = [
      { x: 100, y: 200, t: 0.2, label: { text: '+15' }, who: 0 },
      { x: 300, y: 400, t: 0.2, label: { text: '+30' }, who: 1 },
    ];

    drawPops(rc, game);

    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.shadowColor).toBe('#000000');
    expect(ctx.shadowBlur).toBe(10);

    expect(fillTextCalls.length).toBe(2);
    expect(fillTextCalls[0].text).toBe('+15');
    expect(fillTextCalls[1].text).toBe('+30');
    expect(ctx.fillStyle).toBe(P_COLOR[1]); // last drawn item set fillStyle to P_COLOR[1]
  });

  it('slides a pop earned against a side wall back onto the screen', () => {
    const { ctx } = createMockContext();
    const rc: RenderContext = {
      cv: {} as any,
      ctx,
      bg: {} as any,
      bgx: {} as any,
      W: 400,
      H: 900,
      bgW: 100,
      bgH: 100,
    };

    const game = createGame();
    // '+120 BOOM' is 9 characters, so 90px wide under the mock's metrics.
    game.pops = [
      { x: 2, y: 200, t: 0, label: { text: '+120 BOOM' }, who: 0 },
      { x: 398, y: 300, t: 0, label: { text: '+120 BOOM' }, who: 0 },
      { x: 200, y: 400, t: 0, label: { text: '+120 BOOM' }, who: 0 },
    ];

    drawPops(rc, game);

    const xs = (ctx.translate as any).mock.calls.map((c: number[]) => c[0]);
    expect(xs[0]).toBe(45 + POP_EDGE_PAD); // pushed right off the left wall
    expect(xs[1]).toBe(400 - 45 - POP_EDGE_PAD); // pushed left off the right wall
    expect(xs[2]).toBe(200); // comfortably inside, left where it was earned
  });
});

describe('Renderer module - popCenterX', () => {
  it('keeps the whole label inside the canvas, padded from both edges', () => {
    expect(popCenterX(200, 90, 400)).toBe(200);
    expect(popCenterX(0, 90, 400)).toBe(45 + POP_EDGE_PAD);
    expect(popCenterX(400, 90, 400)).toBe(400 - 45 - POP_EDGE_PAD);
  });

  it('centres a label too wide to fit rather than clamping it off one edge', () => {
    // Both bounds cross once the text is wider than the canvas; centring at
    // least clips it evenly instead of pinning it hard against one wall.
    expect(popCenterX(10, 500, 400)).toBe(200);
  });
});

describe('Renderer module - drawOneLauncher aim arrow & dotted line', () => {
  /** A canvas context that remembers every stroke colour and width set on it. */
  function recordingContext() {
    const strokeStyles: string[] = [];
    const lineWidths: number[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      drawImage: vi.fn(),
      font: '',
      textBaseline: '',
      textAlign: '',
      fillStyle: '',
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      _strokeStyle: '',
      _lineWidth: 1,
      get strokeStyle() {
        return this._strokeStyle;
      },
      set strokeStyle(val: string) {
        this._strokeStyle = val;
        strokeStyles.push(val);
      },
      get lineWidth() {
        return this._lineWidth;
      },
      set lineWidth(val: number) {
        this._lineWidth = val;
        lineWidths.push(val);
      },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, strokeStyles, lineWidths };
  }

  /**
   * Draws one launcher's arrow and reports what it was painted with.
   *
   * The last two stroke colours are the arrow's own pass — the dashed shaft and
   * then the two head strokes — which follow the wider outline pass underneath.
   */
  function drawArrow(strength: number, playerIndex = 0) {
    const { ctx, strokeStyles, lineWidths } = recordingContext();
    const rc: RenderContext = {
      cv: {} as any,
      ctx,
      bg: {} as any,
      bgx: {} as any,
      W: 800,
      H: 600,
      bgW: 100,
      bgH: 100,
    };
    const game = createGame();
    const p = game.players[playerIndex];
    p.reload = 0;
    p.strength = strength;
    drawOneLauncher(rc, game, p, 0);
    return {
      shaft: strokeStyles[strokeStyles.length - 2],
      head: strokeStyles[strokeStyles.length - 1],
      all: strokeStyles,
      width: lineWidths[lineWidths.length - 1],
    };
  }

  /** The three channels of an `rgba(r,g,b,a)` string the palette wrote. */
  function channels(style: string): number[] {
    const m = style.match(/^rgba\((\d+),(\d+),(\d+),/);
    expect(m, style).not.toBeNull();
    return [Number(m![1]), Number(m![2]), Number(m![3])];
  }

  // The thresholds the heat is measured against are derived from the height, and
  // are module state shared with every other test in this process.
  const snap = snapshotConfig();
  beforeEach(() => recalcThresholds(600));
  afterEach(() => restoreConfig(snap));

  it('paints the arrow along a white-to-red power ramp, ending at the boom threshold', () => {
    const weak = drawArrow(0);
    const mid = drawArrow(0.2);
    const hard = drawArrow(0.9);

    // The weakest throw the bay can make is white, and anything at or past the
    // speed that booms on impact is the full red. 0.9 is far past it.
    expect(channels(weak.shaft)).toEqual([...WHITE]);
    expect(channels(hard.shaft)).toEqual([...AIM_HOT]);

    // In between it is neither: white's red channel is already 255, so it is the
    // other two that fall as the throw heats up.
    const [r, g, b] = channels(mid.shaft);
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(AIM_HOT[1]);
    expect(g).toBeLessThan(255);
    expect(b).toBeGreaterThan(AIM_HOT[2]);
    expect(b).toBeLessThan(255);

    // The shaft and the head are one arrow and are always painted alike.
    expect(weak.shaft).toBe(weak.head);
    expect(mid.shaft).toBe(mid.head);
    expect(hard.shaft).toBe(hard.head);
  });

  it('gives both players the same arrow, so its colour reads as power and not as whose turn it is', () => {
    // This is the whole point of the ramp: the arrow used to be cyan for player
    // 1 and pink for player 2, and pink again for either of them once the throw
    // would boom — so player 2's arrow was the boom colour at every strength.
    for (const strength of [0, 0.2, 0.9]) {
      expect(drawArrow(strength, 1).shaft).toBe(drawArrow(strength, 0).shaft);
    }
    expect(drawArrow(0.2, 1).shaft).not.toContain(rgba(PINK, 0).slice(0, -2));
    expect(drawArrow(0.2, 0).shaft).not.toContain(rgba(CYAN, 0).slice(0, -2));
  });

  it('scales the arrow head width with strength', () => {
    expect(drawArrow(0.2).width).toBeCloseTo(3.1); // 2.5 + 0.2 * 3
    expect(drawArrow(0.9).width).toBeCloseTo(5.2); // 2.5 + 0.9 * 3
  });

  it('edges the arrow in the dark void, which a white arrow needs and a white outline cannot give', () => {
    const voidPrefix = rgba(VOID, 0).slice(0, -2);
    for (const strength of [0, 0.9]) {
      const drawn = drawArrow(strength);
      expect(drawn.all.some((style) => style.startsWith(voidPrefix))).toBe(true);
    }
  });
});
