import { logoFont } from '../../graphics/Fonts';
import { BLACK_HEX, MENU_CYAN, MENU_PINK_DEEP, PINK, Rgb, WHITE, WHITE_HEX, hex, rgba } from '../../graphics/Palette';
import { TAU } from '../../math';
import { MenuLayout } from './MenuLayout';
import { drawSoundNotes } from './MenuAmbience';

/**
 * The TONE BOOM wordmark: a speaker for the O, two billiard balls colliding for
 * the two Os of BOOM, and the boom itself between them.
 *
 * This is artwork, so most of its colours are one-off gradient stops that belong
 * to a shape rather than to the palette. The brand colours it does use are named.
 */

/** The soft shadow every logo element casts on the floor. */
const FLOOR_SHADOW: Rgb = [2, 1, 8];

function drawFloorShadow(c: CanvasRenderingContext2D, cx: number, cy: number, radius: number, alpha: number) {
  c.beginPath();
  c.ellipse(cx, cy + radius * 0.94, radius * 0.85, radius * 0.26, 0, 0, TAU);
  c.fillStyle = rgba(FLOOR_SHADOW, alpha);
  if (c.filter) c.filter = 'blur(5px)';
  c.fill();
  if (c.filter) c.filter = 'none';
}

export function drawSpeakerO(c: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number) {
  c.save();

  drawFloorShadow(c, cx, cy, radius, 0.9);

  const pulse = Math.sin(t * 0.12) * (radius * 0.05);

  const frameGrad = c.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
  frameGrad.addColorStop(0.0, '#1a103c');
  frameGrad.addColorStop(0.7, '#0d0722');
  frameGrad.addColorStop(1.0, hex(MENU_CYAN));

  c.beginPath();
  c.arc(cx, cy, radius, 0, TAU);
  c.fillStyle = frameGrad;
  c.fill();

  c.strokeStyle = rgba(MENU_CYAN, 0.85);
  c.lineWidth = Math.max(1.5, radius * 0.06);
  c.shadowColor = hex(MENU_CYAN);
  c.shadowBlur = 10;
  c.stroke();
  c.shadowBlur = 0;

  c.beginPath();
  c.arc(cx, cy, radius * 0.82, 0, TAU);
  c.fillStyle = '#0a0618';
  c.fill();
  c.strokeStyle = '#221545';
  c.lineWidth = Math.max(1, radius * 0.08);
  c.stroke();

  const coneGrad = c.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius * 0.78);
  coneGrad.addColorStop(0.0, '#2e1859');
  coneGrad.addColorStop(0.5, '#150a2a');
  coneGrad.addColorStop(1.0, '#090314');

  c.beginPath();
  c.arc(cx, cy, radius * 0.76, 0, TAU);
  c.fillStyle = coneGrad;
  c.fill();

  c.strokeStyle = rgba(MENU_CYAN, 0.28);
  c.lineWidth = 1;
  [0.62, 0.48, 0.36].forEach(rRatio => {
    c.beginPath();
    c.arc(cx, cy, radius * rRatio, 0, TAU);
    c.stroke();
  });

  const capRadius = Math.max(3, radius * (0.30 + (pulse / radius) * 0.5));
  const capGrad = c.createRadialGradient(
    cx - capRadius * 0.3, cy - capRadius * 0.3, capRadius * 0.1,
    cx, cy, capRadius
  );
  capGrad.addColorStop(0.0, WHITE_HEX);
  capGrad.addColorStop(0.3, hex(MENU_CYAN));
  capGrad.addColorStop(0.7, '#0088cc');
  capGrad.addColorStop(1.0, '#003355');

  c.beginPath();
  c.arc(cx, cy, capRadius, 0, TAU);
  c.fillStyle = capGrad;
  c.shadowColor = hex(MENU_CYAN);
  c.shadowBlur = 8;
  c.fill();
  c.shadowBlur = 0;

  c.beginPath();
  c.arc(cx - capRadius * 0.35, cy - capRadius * 0.35, Math.max(1, capRadius * 0.25), 0, TAU);
  c.fillStyle = rgba(WHITE, 0.85);
  c.fill();

  c.strokeStyle = hex(MENU_CYAN);
  c.lineCap = 'round';

  for (let wave = 1; wave <= 2; wave++) {
    const waveOffset = (t * 0.025 + wave * 1.6) % 3.6;
    const waveR = radius * (1.05 + waveOffset * 0.28);
    const waveAlpha = Math.max(0, 1 - waveOffset / 3.6) * 0.65;

    c.globalAlpha = waveAlpha;
    c.lineWidth = Math.max(1.2, radius * 0.05);

    c.beginPath();
    c.arc(cx, cy, waveR, Math.PI * 0.7, Math.PI * 1.3);
    c.stroke();

    c.beginPath();
    c.arc(cx, cy, waveR, -Math.PI * 0.3, Math.PI * 0.3);
    c.stroke();
  }

  c.restore();
}

/**
 * What separates the white ball from the black one.
 *
 * The two were painted by ~93 lines each that differed only in these values —
 * the same gloss, the same rim, the same number box, the same specular arc, in
 * the same order. Anything that reads as a shape stays in `drawBilliardBall`;
 * only what differs is here.
 */
interface BilliardBallStyle {
  /** How dark the floor shadow is. */
  shadowAlpha: number;
  /** The body gloss: inner radius, the offset of the far focus, its radius. */
  gloss: { innerR: number; farX: number; farY: number; farR: number };
  /** Stops of the body gradient, light to dark. */
  body: [number, string][];
  /** The accent the rim light and every glow take. */
  accent: Rgb;
  /** How strongly the accent rims the ball's far edge. */
  rimAccentAlpha: number;
  /** The white bloom just outside the rim light. */
  rimWhiteAlpha: number;
  /** Stops of the number box's gradient. */
  box: [number, string][];
  /** The specular arc across the top. */
  specular: { alpha: number; minWidth: number; widthRatio: number };
  /** Opacity of the outline that draws the ball's edge. */
  outlineAlpha: number;
}

export const WHITE_BALL: BilliardBallStyle = {
  shadowAlpha: 0.9,
  gloss: { innerR: 0.08, farX: 0.25, farY: 0.30, farR: 1.15 },
  body: [
    [0.00, WHITE_HEX],
    [0.20, '#e2e8f0'],
    [0.40, '#94a3b8'],
    [0.68, '#475569'],
    [0.88, '#1e293b'],
    [1.00, '#0f172a'],
  ],
  accent: MENU_CYAN,
  rimAccentAlpha: 0.45,
  rimWhiteAlpha: 0.6,
  box: [[0.0, WHITE_HEX], [0.5, WHITE_HEX], [1.0, rgba(WHITE, 0.90)]],
  specular: { alpha: 0.8, minWidth: 1.8, widthRatio: 0.055 },
  outlineAlpha: 0.9,
};

export const BLACK_BALL: BilliardBallStyle = {
  shadowAlpha: 0.95,
  gloss: { innerR: 0.05, farX: 0.18, farY: 0.22, farR: 1.05 },
  body: [
    [0.00, '#484c60'],
    [0.18, '#1e202c'],
    [0.45, '#050609'],
    [1.00, BLACK_HEX],
  ],
  accent: MENU_PINK_DEEP,
  rimAccentAlpha: 0.25,
  rimWhiteAlpha: 0.15,
  box: [[0.0, rgba(WHITE, 0.90)], [0.5, WHITE_HEX], [1.0, rgba(WHITE, 0.50)]],
  specular: { alpha: 0.55, minWidth: 1.2, widthRatio: 0.045 },
  outlineAlpha: 0.9,
};

export function drawBilliardBall(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  style: BilliardBallStyle
) {
  c.save();

  drawFloorShadow(c, cx, cy, radius, style.shadowAlpha);

  const lx = cx - radius * 0.32;
  const ly = cy - radius * 0.35;

  const bodyGrad = c.createRadialGradient(
    lx, ly, radius * style.gloss.innerR,
    cx + radius * style.gloss.farX, cy + radius * style.gloss.farY, radius * style.gloss.farR
  );
  for (const [at, color] of style.body) bodyGrad.addColorStop(at, color);

  c.beginPath();
  c.arc(cx, cy, radius, 0, TAU);
  c.fillStyle = bodyGrad;
  c.fill();

  c.save();
  c.beginPath();
  c.arc(cx, cy, radius, 0, TAU);
  c.clip();

  const rimGrad = c.createRadialGradient(
    cx + radius * 0.75, cy + radius * 0.75, radius * 0.05,
    cx, cy, radius
  );
  rimGrad.addColorStop(0.68, 'rgba(0,0,0,0)');
  rimGrad.addColorStop(0.92, rgba(style.accent, style.rimAccentAlpha));
  rimGrad.addColorStop(1.00, rgba(WHITE, style.rimWhiteAlpha));
  c.fillStyle = rimGrad;
  c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // The number box, tilted the way a billiard ball's is
  c.save();
  c.translate(lx, ly);
  c.rotate(-Math.PI / 4.2);

  const boxGrad = c.createLinearGradient(0, -radius * 0.08, 0, radius * 0.08);
  for (const [at, color] of style.box) boxGrad.addColorStop(at, color);
  c.fillStyle = boxGrad;
  c.beginPath();
  if (c.roundRect) {
    c.roundRect(-radius * 0.22, -radius * 0.07, radius * 0.44, radius * 0.14, radius * 0.05);
  } else {
    c.rect(-radius * 0.22, -radius * 0.07, radius * 0.44, radius * 0.14);
  }
  c.shadowColor = hex(style.accent);
  c.shadowBlur = 8;
  c.fill();

  c.beginPath();
  c.arc(-radius * 0.08, -radius * 0.02, radius * 0.038, 0, TAU);
  c.fillStyle = WHITE_HEX;
  c.shadowColor = hex(style.accent);
  c.shadowBlur = 10;
  c.fill();

  c.restore();

  c.beginPath();
  c.arc(cx - radius * 0.04, cy - radius * 0.04, radius * 0.82, -Math.PI * 0.85, -Math.PI * 0.35);
  c.strokeStyle = rgba(WHITE, style.specular.alpha);
  c.lineWidth = Math.max(style.specular.minWidth, radius * style.specular.widthRatio);
  c.stroke();

  c.restore();

  c.beginPath();
  c.arc(cx, cy, radius, 0, TAU);
  c.strokeStyle = rgba(style.accent, style.outlineAlpha);
  c.lineWidth = Math.max(3.5, radius * 0.09);
  c.shadowColor = hex(style.accent);
  c.shadowBlur = 10;
  c.stroke();
  c.shadowBlur = 0;

  c.restore();
}

export function drawImpactBoom(c: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number) {
  c.save();

  const energyPulse = 0.85 + Math.sin(t * 0.2) * 0.15;
  const boomR = radius * 0.70 * energyPulse;

  const flashGrad = c.createRadialGradient(cx, cy, 0, cx, cy, boomR);
  flashGrad.addColorStop(0.00, WHITE_HEX);
  flashGrad.addColorStop(0.30, '#ffff55');
  flashGrad.addColorStop(0.65, hex(PINK));
  flashGrad.addColorStop(1.00, rgba(MENU_CYAN, 0));

  c.beginPath();
  c.arc(cx, cy, boomR, 0, TAU);
  c.fillStyle = flashGrad;
  c.shadowColor = hex(PINK);
  c.shadowBlur = 18 * energyPulse;
  c.fill();

  const numSpikes = 12;
  c.shadowColor = WHITE_HEX;
  c.shadowBlur = 6;

  for (let i = 0; i < numSpikes; i++) {
    const angle = (i * TAU / numSpikes) + Math.sin(t * 0.05 + i * 0.5) * 0.1;
    const spikeLen = (i % 2 === 0 ? radius * 0.85 : radius * 0.50) * (0.85 + Math.sin(t * 0.15 + i) * 0.2);

    const x1 = cx + Math.cos(angle) * (radius * 0.1);
    const y1 = cy + Math.sin(angle) * (radius * 0.1);
    const x2 = cx + Math.cos(angle) * spikeLen;
    const y2 = cy + Math.sin(angle) * spikeLen;

    const rayGrad = c.createLinearGradient(x1, y1, x2, y2);
    rayGrad.addColorStop(0.0, WHITE_HEX);
    rayGrad.addColorStop(0.4, (i % 2 === 0 ? hex(MENU_CYAN) : hex(PINK)));
    rayGrad.addColorStop(1.0, rgba(WHITE, 0));

    c.strokeStyle = rayGrad;
    c.lineWidth = (i % 2 === 0 ? 2.2 : 1.2) * energyPulse;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  c.restore();
}

/** A logo letter: extruded downwards, outlined, then filled with the split gradient. */
export function drawSplitLettering(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number
) {
  c.save();
  c.font = logoFont(fontSize);
  c.textAlign = 'left';
  c.textBaseline = 'middle';

  const depth = Math.max(3, Math.floor(fontSize * 0.085));
  for (let d = depth; d > 0; d--) {
    c.fillStyle = `rgba(4, 1, 12, ${0.5 + (d / depth) * 0.45})`;
    c.fillText(text, x + d * 1.3, y + d * 1.5);
  }

  c.lineWidth = Math.max(3.5, fontSize * 0.075);
  c.strokeStyle = '#04010a';
  c.lineJoin = 'round';
  c.strokeText(text, x, y);

  const halfH = fontSize * 0.50;
  const splitGrad = c.createLinearGradient(x, y - halfH, x, y + halfH);
  splitGrad.addColorStop(0.00, WHITE_HEX);
  splitGrad.addColorStop(0.12, '#8affff');
  splitGrad.addColorStop(0.35, hex(MENU_CYAN));
  splitGrad.addColorStop(0.48, '#00b8e6');
  splitGrad.addColorStop(0.50, WHITE_HEX);
  splitGrad.addColorStop(0.52, WHITE_HEX);
  splitGrad.addColorStop(0.55, hex(PINK));
  splitGrad.addColorStop(0.75, hex(MENU_PINK_DEEP));
  splitGrad.addColorStop(0.92, '#b30059');
  splitGrad.addColorStop(1.00, '#420021');

  c.fillStyle = splitGrad;
  c.fillText(text, x, y);

  c.restore();
}

/** Lay out and paint the whole wordmark. Returns the logo's bottom edge. */
export function drawLogo(
  c: CanvasRenderingContext2D,
  layout: MenuLayout,
  width: number,
  t: number
): number {
  c.save();
  c.font = logoFont(layout.effectiveFontSize);

  const tMetrics = c.measureText('T');
  const neMetrics = c.measureText('NE');
  const bMetrics = c.measureText('B');
  const mMetrics = c.measureText('M');

  const ballRadius = layout.ballRadius;
  const speakerRadius = ballRadius;
  const letterSpacing = layout.effectiveFontSize * 0.06;

  const word1Width = tMetrics.width + letterSpacing + (speakerRadius * 2) + letterSpacing + neMetrics.width;
  const ballSpacing = ballRadius * 2.12;
  const word2Width = bMetrics.width + letterSpacing + ballRadius + ballSpacing + ballRadius + letterSpacing + mMetrics.width;

  const wordGap = layout.effectiveFontSize * 0.40;
  const totalLogoWidth = word1Width + wordGap + word2Width;

  const startX = (width - totalLogoWidth) / 2;
  const baselineY = layout.logoCenterY;
  const elementY = baselineY - (layout.effectiveFontSize * 0.04);

  const logoBoundsH = ballRadius * 3.5;
  drawSoundNotes(c, width / 2, baselineY, totalLogoWidth, logoBoundsH);

  const word1X = startX;
  drawSplitLettering(c, 'T', word1X, baselineY, layout.effectiveFontSize);
  const speakerX = word1X + tMetrics.width + letterSpacing + speakerRadius;
  drawSpeakerO(c, speakerX, elementY, speakerRadius, t);
  const neX = speakerX + speakerRadius + letterSpacing;
  drawSplitLettering(c, 'NE', neX, baselineY, layout.effectiveFontSize);

  const word2X = word1X + word1Width + wordGap;
  drawSplitLettering(c, 'B', word2X, baselineY, layout.effectiveFontSize);

  const whiteBallX = word2X + bMetrics.width + letterSpacing + ballRadius;
  const blackBallX = whiteBallX + ballSpacing;
  const impactX = (whiteBallX + blackBallX) / 2;

  drawBilliardBall(c, whiteBallX, elementY, ballRadius, WHITE_BALL);
  drawBilliardBall(c, blackBallX, elementY, ballRadius, BLACK_BALL);
  drawImpactBoom(c, impactX, elementY, ballRadius, t);

  const mX = blackBallX + ballRadius + letterSpacing;
  drawSplitLettering(c, 'M', mX, baselineY, layout.effectiveFontSize);

  c.restore();

  return layout.logoBottom;
}
