import { Game, getRainBallAlpha } from '../game/GameState';
import { PhysicsConfig, recalcThresholds } from '../physics/Config';
import { uiFont } from './Fonts';
import { ballSprite, inkOn, SP_R, SPRITE } from './Sprites';
import { BG_SCALE, FLASH_LIFE, FLASH_SPECS, drawLiquid } from './VisualFX';
import { aimDirOf, aimMaxReach, aimReachOf, launchPointOf, mouthRadius, throwSpeedOf } from '../physics/LauncherBays';
import { LauncherPlayer } from '../physics/Types';
import { kindLabel } from '../game/Rules';

export const P_COLOR = ['#4ff0ff', '#ff1ad9'];

export interface RenderContext {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  bg: HTMLCanvasElement;
  bgx: CanvasRenderingContext2D;
  resCv: HTMLCanvasElement | null;
  resCtx: CanvasRenderingContext2D | null;
  W: number;
  H: number;
  bgW: number;
  bgH: number;
}

export function createRenderContext(canvas: HTMLCanvasElement): RenderContext {
  const ctx = canvas.getContext('2d')!;
  const bg = document.createElement('canvas');
  const bgx = bg.getContext('2d')!;
  const resCv = document.getElementById('resultsCanvas') as HTMLCanvasElement | null;
  const resCtx = resCv ? resCv.getContext('2d') : null;
  return {
    cv: canvas,
    ctx,
    bg,
    bgx,
    resCv,
    resCtx,
    W: 0,
    H: 0,
    bgW: 1,
    bgH: 1,
  };
}

/**
 * Size the canvases to the stage. `force` re-applies everything even when the
 * size is unchanged: after a lost 2D context is restored the canvas keeps its
 * dimensions but its transform is back to identity, so the field draws into the
 * top-left 1/dpr of the screen and the same-size early return would never fix it.
 */
export function resizeRenderer(rc: RenderContext, stageEl: HTMLElement, force = false) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = stageEl.getBoundingClientRect();
  if (!r.width || !r.height) return;
  if (!force && r.width === rc.W && r.height === rc.H && rc.cv.width) return;

  rc.W = r.width;
  rc.H = r.height;
  rc.cv.width = Math.round(rc.W * dpr);
  rc.cv.height = Math.round(rc.H * dpr);
  rc.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  rc.bgW = Math.max(16, Math.round(rc.W / BG_SCALE));
  rc.bgH = Math.max(16, Math.round(rc.H / BG_SCALE));
  rc.bg.width = rc.bgW;
  rc.bg.height = rc.bgH;

  if (rc.resCv && rc.resCtx) {
    rc.resCv.width = rc.cv.width;
    rc.resCv.height = rc.cv.height;
    rc.resCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Derive every scale-dependent threshold from the field we just sized, through
  // the one function that owns the formula. Setting `SC` here by hand used to
  // leave SHATTER_SPEED and KICKOUT_MAX behind at whatever height the tuning
  // panel last happened to pass, so how hard a burst was to trigger drifted with
  // the screen and never updated on rotate.
  recalcThresholds(rc.H);
}

export function drawGame(rc: RenderContext, game: Game, time: number) {
  const { ctx, W, H } = rc;
  if (game.matchOver) {
    rc.bgx.globalCompositeOperation = 'source-over';
    rc.bgx.fillStyle = '#140a2b';
    rc.bgx.fillRect(0, 0, rc.bgW, rc.bgH);
  } else {
    drawLiquid(rc.bgx, rc.bgW, rc.bgH, game.balls, game.flashes, time);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(rc.bg, 0, 0, W, H);


  // Draw bond lines
  const R = PhysicsConfig.R;
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (const b of game.balls) {
    for (const id of b.bonds) {
      // Bonds are symmetric, so draw each from its lower-id end only. This is
      // the same dedupe the per-frame Set of string keys was doing, without
      // building two strings and a Set entry per bond per frame.
      if (id < b.id) continue;
      const o = game.byId.get(id);
      if (!o) continue;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(o.x, o.y);
      ctx.globalAlpha = 0.35; ctx.lineWidth = R * 0.8;
      // Bonds form between matching colours except through a black special, so
      // the gradient is usually flat. Building one per bond per frame is the
      // most expensive call in this loop; skip it when both ends agree.
      if (b.color === o.color) {
        ctx.strokeStyle = b.color;
      } else {
        const wash = ctx.createLinearGradient(b.x, b.y, o.x, o.y);
        wash.addColorStop(0, b.color); wash.addColorStop(1, o.color);
        ctx.strokeStyle = wash;
      }
      ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.lineWidth = Math.max(1.5, R * 0.16);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Draw ripple rings
  for (const f of game.flashes) {
    const spec = FLASH_SPECS[f.kind] || FLASH_SPECS.spawn;
    const p = f.t / FLASH_LIFE;
    const fade = (1 - p) * (1 - p);
    const rad = R * (spec.r0 + p * spec.r1);
    if (rad <= 0) continue;
    const amp = R * spec.amp * fade;
    const seed = f.x * 0.7 + f.y * 0.31;
    ctx.beginPath();
    const N = 44;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 6.2832;
      const rr = rad + Math.sin(a * spec.waves + seed + p * 7) * amp;
      const px = f.x + Math.cos(a) * rr, py = f.y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.lineWidth = spec.w * (1 - p) + 0.6;
    ctx.strokeStyle = 'rgba(' + spec.rgb + ',' + (0.9 * fade).toFixed(3) + ')';
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Draw balls
  const d = 2 * R * (SPRITE / (2 * SP_R));
  for (const b of game.balls) {
    if (b.ghost) {
      ctx.globalAlpha = 0.34 * Math.min(1, (PhysicsConfig.GHOST_LIFE - (b.age || 0)) / 1.5);
      ctx.drawImage(ballSprite(b.color, false), b.x - d / 2, b.y - d / 2, d, d);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y, R * 0.94, 0, 6.2832);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.stroke();
      continue;
    }
    const grouped = b.group && b.group.members && b.group.members.length > 1;
    const ra = getRainBallAlpha(b.rainTime);
    ctx.globalAlpha = ra;
    ctx.drawImage(ballSprite(b.color, grouped), b.x - d / 2, b.y - d / 2, d, d);
    ctx.globalAlpha = 1;
  }

  if (game.showLabels && R >= 11) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = uiFont(600, Math.round(R * 0.66));
    for (const b of game.balls) {
      const ra = getRainBallAlpha(b.rainTime);
      if (b.ghost) ctx.globalAlpha = 0.5;
      else ctx.globalAlpha = ra;
      ctx.fillStyle = inkOn(b.color);
      ctx.fillText(kindLabel(b.kind), b.x, b.y + 0.5);
      ctx.globalAlpha = 1;
    }
  }

  if (game.twoPlayer) {
    ctx.save();
    ctx.setLineDash([11, 9]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.restore();
  }

  drawLaunchers(rc, game, time);
  drawPops(rc, game);
}

export function drawPops(rc: RenderContext, game: Game) {
  if (!game.pops.length) return;
  const ctx = rc.ctx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalCompositeOperation = 'source-over';
  for (const f of game.pops) {
    const k = f.t / 1.1;
    ctx.save();
    ctx.translate(f.x, f.y);
    if (game.twoPlayer && f.who === 1) ctx.rotate(Math.PI);
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.font = uiFont(800, (17 + 8 * (1 - k)).toFixed(1));
    ctx.fillStyle = P_COLOR[f.who] || '#ffffff';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(f.text, 0, -k * 34);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function drawScores(_rc: RenderContext, _game: Game) {
  // Scores and match time are rendered in the HTML next-balls bar HUD elements
}

export function drawLaunchers(rc: RenderContext, game: Game, time: number) {
  const activePlayers = game.twoPlayer ? game.players : [game.players[0]];
  for (const p of activePlayers) drawOneLauncher(rc, game, p, time);
}

export function drawOneLauncher(rc: RenderContext, game: Game, p: LauncherPlayer, time: number) {
  const { ctx, W, H } = rc;
  const R = PhysicsConfig.R;
  const dir = aimDirOf(p);
  const m = launchPointOf(p, W, H);
  const burst = throwSpeedOf(p, game.twoPlayer) >= PhysicsConfig.SHATTER_SPEED;
  const ready = p.reload <= 0;

  const pIdx = game.players.indexOf(p) === 1 ? 1 : 0;
  const isP1 = pIdx === 0;
  const strokeBase = isP1 ? 'rgba(79,240,255,.4)' : 'rgba(255,26,217,.4)';
  const strokeReload = isP1 ? 'rgba(0,229,255,1.0)' : 'rgba(255,26,217,1.0)';
  const strokeInner = isP1 ? 'rgba(79,240,255,.65)' : 'rgba(255,26,217,.65)';
  const playerColorHex = isP1 ? '#00e5ff' : '#ff1ad9';
  const playerGlowColor = isP1 ? 'rgba(0, 200, 255, 0.4)' : 'rgba(255, 26, 217, 0.4)';

  const mouthR = mouthRadius() + R - 2;

  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(m.x, m.y, mouthR, 0, 6.2832);
  ctx.fillStyle = 'rgba(12,4,30,.42)';
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(m.x, m.y, mouthR, 0, 6.2832);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = strokeBase;
  ctx.stroke();

  if (game.reloadTime > 0 && p.reload > 0) {
    const done = Math.max(0, Math.min(1, 1 - p.reload / game.reloadTime));
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + done * 6.2832;

    // 1. Soft player team color outer glow
    ctx.beginPath();
    ctx.arc(m.x, m.y, mouthR, startAngle, endAngle);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = playerGlowColor;
    ctx.stroke();

    // 2. Main vibrant player team color arc stroke (Cyan for P1, Pink for P2)
    ctx.beginPath();
    ctx.arc(m.x, m.y, mouthR, startAngle, endAngle);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = strokeReload;
    ctx.stroke();

    // 3. Sleek leading tip bead (matching team color + highlight)
    const tipX = m.x + Math.cos(endAngle) * mouthR;
    const tipY = m.y + Math.sin(endAngle) * mouthR;

    ctx.beginPath();
    ctx.arc(tipX, tipY, 3.5, 0, 6.2832);
    ctx.fillStyle = playerColorHex;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(tipX, tipY, 1.8, 0, 6.2832);
    ctx.fillStyle = isP1 ? '#b3f7ff' : '#ffd9f7';
    ctx.fill();
  } else if (ready) {
    const readyGlowAlpha = 0.25 + 0.15 * Math.sin(time * 4);
    ctx.beginPath();
    ctx.arc(m.x, m.y, mouthR, 0, 6.2832);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isP1
      ? 'rgba(0, 229, 255, ' + readyGlowAlpha.toFixed(2) + ')'
      : 'rgba(255, 26, 217, ' + readyGlowAlpha.toFixed(2) + ')';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(m.x, m.y, R * 1.25, 0, 6.2832);
  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeInner;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';

  if (p.loaded) {
    const bob = ready ? 1 + 0.04 * Math.sin(time * 2.6) : 1;
    const d = 2 * R * (SPRITE / (2 * SP_R)) * bob;
    ctx.drawImage(ballSprite(p.loaded.color, false), m.x - d / 2, m.y - d / 2, d, d);
    if (game.showLabels && R >= 11) {
      ctx.save();
      ctx.translate(m.x, m.y);
      if (p.side < 0) ctx.rotate(Math.PI);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = uiFont(600, Math.round(R * 0.66));
      ctx.fillStyle = inkOn(p.loaded.color);
      ctx.fillText(kindLabel(p.loaded.kind), 0, 0.5);
      ctx.restore();
    }
  }
  const fade = ready ? 1 : 0.35;
  const reach = aimReachOf(p, H, game.twoPlayer);
  const lineReach = aimMaxReach(H, game.twoPlayer);
  const aimColor =
    (burst
      ? 'rgba(255,26,217,'
      : isP1
      ? 'rgba(79,240,255,'
      : 'rgba(255,26,217,') +
    ((0.65 + 0.35 * p.strength) * fade).toFixed(3) +
    ')';

  const tx = m.x + Math.cos(dir) * reach, ty = m.y + Math.sin(dir) * reach;
  const arrowHeadLength = 11 + p.strength * 18;
  const arrowHeadWidth = 2.5 + p.strength * 3;
  const mainLineWidth = 2 + p.strength * 3;

  // 1. Translucent white glow pass for crisp, soft edge definition against magenta or dark surfaces
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = `rgba(255, 255, 255, ${(0.6 * fade).toFixed(3)})`;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const whiteGlowColor = `rgba(255, 255, 255, ${(0.35 * fade).toFixed(3)})`;

  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(m.x + Math.cos(dir) * R * 1.1, m.y + Math.sin(dir) * R * 1.1);
  ctx.lineTo(tx, ty);
  ctx.lineWidth = mainLineWidth + 1.5;
  ctx.strokeStyle = whiteGlowColor;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  for (const side of [-0.5, 0.5]) {
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(dir + side) * arrowHeadLength, ty - Math.sin(dir + side) * arrowHeadLength);
  }
  ctx.lineWidth = arrowHeadWidth + 1.5;
  ctx.strokeStyle = whiteGlowColor;
  ctx.stroke();
  ctx.restore();

  // 2. Main vibrant player aim color stroke
  ctx.globalCompositeOperation = 'lighter';
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(m.x + Math.cos(dir) * R * 1.1, m.y + Math.sin(dir) * R * 1.1);
  ctx.lineTo(tx, ty);
  ctx.lineWidth = mainLineWidth;
  ctx.strokeStyle = aimColor;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  for (const side of [-0.5, 0.5]) {
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(dir + side) * arrowHeadLength, ty - Math.sin(dir + side) * arrowHeadLength);
  }
  ctx.lineWidth = arrowHeadWidth;
  ctx.strokeStyle = aimColor;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

export function drawResultsCanvas(rc: RenderContext, game: Game) {
  if (!rc.resCv || !rc.resCtx) return;
  const { resCtx: ctx, W, H } = rc;

  ctx.clearRect(0, 0, W, H);
  if (!game.matchOver) {
    rc.resCv.setAttribute('hidden', '');
    return;
  }
  rc.resCv.removeAttribute('hidden');

  const R = PhysicsConfig.R;

  // Draw celebratory flashes on results overlay canvas (above the dark blurred backdrop)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of game.flashes) {
    const spec = FLASH_SPECS[f.kind] || FLASH_SPECS.spawn;
    const p = f.t / FLASH_LIFE;
    const fade = (1 - p) * (1 - p);
    const rad = R * (spec.r0 + p * spec.r1);
    if (rad <= 0) continue;
    const amp = R * spec.amp * fade;
    const seed = f.x * 0.7 + f.y * 0.31;
    ctx.beginPath();
    const N = 44;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 6.2832;
      const rr = rad + Math.sin(a * spec.waves + seed + p * 7) * amp;
      const px = f.x + Math.cos(a) * rr, py = f.y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.lineWidth = spec.w * (1 - p) + 0.8;
    ctx.strokeStyle = 'rgba(' + spec.rgb + ',' + (0.95 * fade).toFixed(3) + ')';
    ctx.stroke();
  }
  ctx.restore();

  // Draw celebratory floating pops on results overlay canvas (above the dark blurred backdrop)
  if (game.pops.length) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalCompositeOperation = 'source-over';
    for (const f of game.pops) {
      const k = f.t / 1.1;
      ctx.save();
      ctx.translate(f.x, f.y);
      if (game.twoPlayer && f.who === 1) ctx.rotate(Math.PI);
      const alpha = Math.max(0, 1 - k * k);
      ctx.globalAlpha = alpha;
      const fontSize = (17 + 8 * (1 - k)).toFixed(1);
      ctx.font = uiFont(800, fontSize);
      const color = P_COLOR[f.who] || '#00f7ff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color;
      ctx.fillText(f.text, 0, -k * 34);

      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.fillText(f.text, 0, -k * 34);
      ctx.restore();
    }
    ctx.restore();
  }
}
