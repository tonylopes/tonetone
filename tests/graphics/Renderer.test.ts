import { describe, it, expect, vi } from 'vitest';
import { drawPops, drawOneLauncher, popCenterX, POP_EDGE_PAD, RenderContext, P_COLOR } from '../../src/graphics/Renderer';
import { CYAN, PINK, rgba } from '../../src/graphics/Palette';
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
  it('renders arrow head with the exact same strokeStyle as the dotted line and scales width and length with strength', () => {
    // Taken from the palette rather than spelled out, so a colour decision moves
    // this test with it instead of breaking it.
    const cyanPrefix = rgba(CYAN, 0).slice(0, -2);
    const pinkPrefix = rgba(PINK, 0).slice(0, -2);
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
    const p = game.players[0];
    p.reload = 0;

    // Test low strength (non-boom)
    p.strength = 0.2;
    drawOneLauncher(rc, game, p, 0);

    const lowStrokes = strokeStyles.slice(-2);
    expect(lowStrokes[0]).toBe(lowStrokes[1]); // Dotted line & arrow share identical color
    expect(lowStrokes[0]).toContain(cyanPrefix); // P1's colour
    const lowWidth = lineWidths[lineWidths.length - 1];
    expect(lowWidth).toBeCloseTo(3.1); // 2.5 + 0.2 * 3 = 3.1

    // Test high strength (boom mode)
    p.strength = 0.9;
    drawOneLauncher(rc, game, p, 0);

    const highStrokes = strokeStyles.slice(-2);
    expect(highStrokes[0]).toBe(highStrokes[1]); // Dotted line & arrow share identical color
    expect(highStrokes[0]).toContain(pinkPrefix); // the boom magenta
    const highWidth = lineWidths[lineWidths.length - 1];
    expect(highWidth).toBeCloseTo(5.2); // 2.5 + 0.9 * 3 = 5.2

    // Both colors changed synchronously between low and high strength
    expect(lowStrokes[0]).not.toBe(highStrokes[0]);
    expect(lowStrokes[1]).not.toBe(highStrokes[1]);

    // Verify translucent white glow contrast pass was recorded in strokeStyles.
    // The colour is built by the palette's `rgba` helper, so it is spelled
    // without spaces; assert on the prefix rather than on one exact alpha.
    expect(strokeStyles.some((s) => s.startsWith('rgba(255,255,255,'))).toBe(true);
  });
});


