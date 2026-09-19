import { describe, it, expect, vi } from 'vitest';
import { drawScores, drawPops, drawOneLauncher, RenderContext, P_COLOR } from '../../src/graphics/Renderer';
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
  } as unknown as CanvasRenderingContext2D;

  return { ctx, fillTextCalls };
}

describe('Renderer module - drawScores', () => {
  it('is a no-op as scores and match time are rendered in the HTML next-balls bar HUD elements', () => {
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
    drawScores(rc, game);

    expect(fillTextCalls.length).toBe(0);
  });
});

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
      { x: 100, y: 200, t: 0.2, text: '+15', who: 0 },
      { x: 300, y: 400, t: 0.2, text: '+30', who: 1 },
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
});

describe('Renderer module - drawOneLauncher aim arrow & dotted line', () => {
  it('renders arrow head with the exact same strokeStyle as the dotted line and scales width and length with strength', () => {
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

    // Test low strength (non-burst)
    p.strength = 0.2;
    drawOneLauncher(rc, game, p, 0);

    const lowStrokes = strokeStyles.slice(-2);
    expect(lowStrokes[0]).toBe(lowStrokes[1]); // Dotted line & arrow share identical color
    expect(lowStrokes[0]).toContain('rgba(79,240,255,'); // P1 cyan color
    const lowWidth = lineWidths[lineWidths.length - 1];
    expect(lowWidth).toBeCloseTo(3.1); // 2.5 + 0.2 * 3 = 3.1

    // Test high strength (burst mode)
    p.strength = 0.9;
    drawOneLauncher(rc, game, p, 0);

    const highStrokes = strokeStyles.slice(-2);
    expect(highStrokes[0]).toBe(highStrokes[1]); // Dotted line & arrow share identical color
    expect(highStrokes[0]).toContain('rgba(255,26,217,'); // Burst magenta color
    const highWidth = lineWidths[lineWidths.length - 1];
    expect(highWidth).toBeCloseTo(5.2); // 2.5 + 0.9 * 3 = 5.2

    // Both colors changed synchronously between low and high strength
    expect(lowStrokes[0]).not.toBe(highStrokes[0]);
    expect(lowStrokes[1]).not.toBe(highStrokes[1]);

    // Verify translucent white glow contrast pass was recorded in strokeStyles
    expect(strokeStyles.some((s) => s.includes('255, 255, 255'))).toBe(true);
  });
});


