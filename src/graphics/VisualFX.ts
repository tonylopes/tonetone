import { Ball, Flash } from '../physics/Types';
import { PhysicsConfig } from '../physics/Config';
import { glowSprite } from './Sprites';
import { FIELD_BG, Rgb, hex, rgb, rgba } from './Palette';
import { TAU } from '../math';
import { getRainBallAlpha } from '../game/GameState';

export const BG_SCALE = 7;

export const CURRENTS = [
  { c: '#ff2f9e', ax: 0.34, ay: 0.26, sx: 0.17, sy: 0.13, r: 0.85, ph: 0.0 },
  { c: '#00c8ff', ax: 0.31, ay: 0.31, sx: 0.12, sy: 0.19, r: 0.78, ph: 1.9 },
  { c: '#6f21ff', ax: 0.38, ay: 0.23, sx: 0.09, sy: 0.11, r: 1.05, ph: 3.4 },
  { c: '#ff77d4', ax: 0.27, ay: 0.35, sx: 0.21, sy: 0.08, r: 0.62, ph: 5.1 },
  { c: '#12d9c2', ax: 0.33, ay: 0.28, sx: 0.15, sy: 0.16, r: 0.58, ph: 2.6 },
];

import { FLASH_LIFE } from '../physics/Types';
export { FLASH_LIFE };

export interface FlashSpec {
  /** Ring radius at spawn, in ball radii. */
  r0: number;
  /** How far the ring travels over its life, in ball radii. `blocked` recoils. */
  r1: number;
  /** Depth of the wobble riding on the ring, in ball radii. */
  amp: number;
  /** How many wobbles go round it. */
  waves: number;
  /** Stroke width at spawn; it tapers to the style's boost as the ring fades. */
  w: number;
  color: Rgb;
}

export const FLASH_SPECS: Record<string, FlashSpec> = {
  bond:    { r0: 0.5, r1: 2.6, amp: 0.40, waves: 5, w: 4.0, color: [90, 255, 240] },
  break:   { r0: 0.6, r1: 4.0, amp: 0.55, waves: 7, w: 5.0, color: [255, 80, 200] },
  spawn:   { r0: 0.4, r1: 2.0, amp: 0.30, waves: 4, w: 2.5, color: [190, 150, 255] },
  blocked: { r0: 1.6, r1: -0.9, amp: 0.18, waves: 6, w: 1.6, color: [150, 140, 190] },
};

/** How many straight segments a ring's outline is drawn with. */
export const RING_SEGMENTS = 44;

/**
 * What a ring looks like on one canvas.
 *
 * The same ring was painted by three copies of the same loop — the field, the
 * results celebration and the menu's attract screen — and the copies had drifted
 * apart in exactly these three numbers. Naming the difference is what stops a
 * fix to one of them from silently missing the other two. Whether the three
 * should be one style is a design question, not a refactoring one.
 */
export interface RingStyle {
  segments: number;
  /** Floor added to the tapering stroke width, so a dying ring stays a line. */
  widthBoost: number;
  /** Opacity at spawn, before the fade. */
  alpha: number;
}

/** The field's rings, during a match. */
export const FIELD_RING: RingStyle = { segments: RING_SEGMENTS, widthBoost: 0.6, alpha: 0.9 };
/** The results celebration's, a shade heavier and brighter. */
export const RESULTS_RING: RingStyle = { segments: RING_SEGMENTS, widthBoost: 0.8, alpha: 0.95 };
/** The menu's, drawn against its own 22px virtual ball radius. */
export const MENU_RING: RingStyle = { segments: 40, widthBoost: 0.8, alpha: 0.85 };

/** A flash's fade, squared so it leaves faster than it arrives. */
export function ringFade(p: number): number {
  return (1 - p) * (1 - p);
}

/** How far a flash's ring has spread at progress `p`, in pixels. */
export function ringRadius(spec: FlashSpec, R: number, p: number): number {
  return R * (spec.r0 + p * spec.r1);
}

/**
 * Paint one flash's wobbling ring. The caller owns the composite mode and any
 * save/restore around it; `R` is the ball radius the ring is measured against.
 */
export function drawRippleRing(
  ctx: CanvasRenderingContext2D,
  spec: FlashSpec,
  x: number,
  y: number,
  R: number,
  p: number,
  style: RingStyle
) {
  const rad = ringRadius(spec, R, p);
  if (rad <= 0) return;
  const fade = ringFade(p);
  const amp = R * spec.amp * fade;
  const seed = x * 0.7 + y * 0.31;
  const N = style.segments;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const rr = rad + Math.sin(a * spec.waves + seed + p * 7) * amp;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.lineWidth = spec.w * (1 - p) + style.widthBoost;
  ctx.strokeStyle = rgba(spec.color, +(style.alpha * fade).toFixed(3));
  ctx.stroke();
}

// The currents add together, so where three or four drift over each other the
// channels clip to near-white and the aim arrow (also additive) vanishes into it.
// A 'darken' fill takes the per-channel minimum, capping those spots at this
// lavender. It stays on the GPU: reading the canvas back each frame to do a
// softer, hue-preserving curve made the game visibly sluggish.
const CURRENT_CEILING = 'rgb(170,130,190)';

export function drawLiquid(
  bgCtx: CanvasRenderingContext2D,
  bgW: number,
  bgH: number,
  balls: Ball[],
  flashes: Flash[],
  time: number
) {
  bgCtx.globalCompositeOperation = 'source-over';
  bgCtx.fillStyle = hex(FIELD_BG);
  bgCtx.fillRect(0, 0, bgW, bgH);
  bgCtx.globalCompositeOperation = 'lighter';

  for (const c of CURRENTS) {
    const x = bgW * (0.5 + c.ax * Math.sin(time * c.sx + c.ph));
    const y = bgH * (0.5 + c.ay * Math.cos(time * c.sy + c.ph * 1.7));
    const r = bgH * c.r;
    bgCtx.globalAlpha = 0.42;
    bgCtx.drawImage(glowSprite(c.c), x - r, y - r, r * 2, r * 2);
  }

  // Only the currents are compressed: ball glows and flashes stay at full strength.
  bgCtx.globalAlpha = 1;
  bgCtx.globalCompositeOperation = 'darken';
  bgCtx.fillStyle = CURRENT_CEILING;
  bgCtx.fillRect(0, 0, bgW, bgH);
  bgCtx.globalCompositeOperation = 'lighter';

  const s = (PhysicsConfig.R * 3.6) / BG_SCALE;
  for (const b of balls) {
    const ra = getRainBallAlpha(b.rainTime);
    bgCtx.globalAlpha = b.ghost ? 0.2 : 0.55 * ra;
    bgCtx.drawImage(glowSprite(b.color), b.x / BG_SCALE - s / 2, b.y / BG_SCALE - s / 2, s, s);
  }

  for (const f of flashes) {
    const spec = FLASH_SPECS[f.kind] || FLASH_SPECS.spawn;
    const p = f.t / FLASH_LIFE;
    const rad = (ringRadius(spec, PhysicsConfig.R, p) * 1.5) / BG_SCALE;
    if (rad <= 0.3) continue;
    bgCtx.globalAlpha = 0.55 * ringFade(p);
    bgCtx.drawImage(glowSprite(rgb(spec.color)), f.x / BG_SCALE - rad, f.y / BG_SCALE - rad, rad * 2, rad * 2);
  }

  bgCtx.globalAlpha = 1;
  bgCtx.globalCompositeOperation = 'source-over';
}
