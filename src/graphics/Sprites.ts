const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  watchSprite(c);
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

const inkCache = new Map<string, string>();
export function inkOn(color: string): string {
  let t = inkCache.get(color);
  if (t) return t;
  const h = color.replace('#', '');
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(parseInt(h.slice(0, 2), 16))
          + 0.7152 * lin(parseInt(h.slice(2, 4), 16))
          + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
  const vsWhite = 1.05 / (L + 0.05);
  const vsInk = (L + 0.05) / 0.0626;
  t = vsInk >= vsWhite ? 'rgba(30,6,58,.92)' : 'rgba(255,255,255,.97)';
  inkCache.set(color, t);
  return t;
}

import { BLACK_HEX } from './Palette';
import { TAU } from '../math';

export const SPRITE = 128;
export const SP_R = SPRITE / 2 - 8;
const ballCache = new Map<string, HTMLCanvasElement>();

export function ballSprite(color: string, grouped: boolean): HTMLCanvasElement {
  const key = color + (grouped ? '|g' : '');
  let c = ballCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = SPRITE;
  watchSprite(c);
  const x = c.getContext('2d')!;
  x.beginPath(); x.arc(SPRITE / 2, SPRITE / 2, SP_R, 0, TAU);
  x.fillStyle = color; x.fill();

  // Only the black special ball takes the dark treatment. This used to also test
  // three colours that appear nowhere else in the code or the CSS, plus a second
  // spelling of BLACK, so it always reduced to this.
  const isDark = color.toLowerCase() === BLACK_HEX;

  x.globalCompositeOperation = 'source-atop';
  const hi = x.createRadialGradient(SPRITE * 0.36, SPRITE * 0.31, 0, SPRITE * 0.36, SPRITE * 0.31, SP_R * 1.15);
  if (isDark) {
    hi.addColorStop(0, 'rgba(255,255,255,.82)');
    hi.addColorStop(0.18, 'rgba(255,255,255,.30)');
    hi.addColorStop(0.48, 'rgba(255,255,255,.08)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    hi.addColorStop(0, 'rgba(255,255,255,.85)');
    hi.addColorStop(0.4, 'rgba(255,255,255,.12)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
  }
  x.fillStyle = hi; x.fillRect(0, 0, SPRITE, SPRITE);

  const sh = x.createRadialGradient(SPRITE * 0.7, SPRITE * 0.74, 0, SPRITE * 0.7, SPRITE * 0.74, SP_R * 1.25);
  sh.addColorStop(0, isDark ? 'rgba(0,0,0,.80)' : 'rgba(26,0,58,.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sh; x.fillRect(0, 0, SPRITE, SPRITE);
  x.globalCompositeOperation = 'source-over';

  x.beginPath(); x.arc(SPRITE / 2, SPRITE / 2, SP_R, 0, TAU);
  x.lineWidth = grouped ? 8 : 3;
  x.strokeStyle = grouped ? 'rgba(255,255,255,.95)' : (isDark ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.32)');
  x.stroke();

  ballCache.set(key, c);
  return c;
}

/**
 * Bumped every time the caches are dropped. Anything that paints a sprite once
 * and keeps the pixels (the next-ball chips) keys on it, so it repaints from the
 * rebuilt sprites instead of holding onto a blank one.
 */
let spriteEpoch = 0;
export function getSpriteEpoch(): number {
  return spriteEpoch;
}

/**
 * Chrome can drop the backing store of any 2D canvas — offscreen ones included —
 * while a tab sits in the background. The sprite canvases come back empty, so
 * every ball draws as nothing. A restored sprite drops the whole cache so the
 * next draw regenerates them.
 */
function watchSprite(c: HTMLCanvasElement) {
  if (c.addEventListener) c.addEventListener('contextrestored', clearSpriteCache);
}

export function clearSpriteCache() {
  glowCache.clear();
  inkCache.clear();
  ballCache.clear();
  spriteEpoch++;
}
