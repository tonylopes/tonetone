import { Ball, Group, LauncherPlayer, Vector2D } from './Types';
import { PhysicsConfig } from './Config';
import { shiftGroup } from './RigidBody';

export function mouthRadius(): number {
  return PhysicsConfig.R * 2;
}

export function bayInset(): number {
  return mouthRadius() + PhysicsConfig.R + 2;
}

export function launchPointOf(p: LauncherPlayer, width: number, height: number): Vector2D {
  return p.side > 0
    ? { x: width / 2, y: height - bayInset() }
    : { x: width / 2, y: bayInset() };
}

export function aimDirOf(p: LauncherPlayer): number {
  return p.side > 0
    ? -Math.PI / 2 + (p.aimDeg * Math.PI) / 180
    : Math.PI / 2 + (p.aimDeg * Math.PI) / 180;
}

export function aimSpan(height: number, twoPlayer: boolean): number {
  return twoPlayer ? height * 0.40 : height * 0.80;
}

export function aimMaxReach(height: number, twoPlayer: boolean): number {
  return Math.max(38, twoPlayer ? height / 2 - bayInset() : height - bayInset());
}

export function aimReachOf(p: LauncherPlayer, height: number, twoPlayer: boolean): number {
  const maxReach = aimMaxReach(height, twoPlayer);
  const reach = p.strength * aimSpan(height, twoPlayer) * 1.75;
  return Math.min(maxReach, Math.max(38, reach));
}

export function aimAt(p: LauncherPlayer, x: number, y: number, width: number, height: number, twoPlayer: boolean) {
  const m = launchPointOf(p, width, height);
  const dx = x - m.x, dy = y - m.y;
  const raw = p.side > 0 ? Math.atan2(dx, -dy) : Math.atan2(-dx, dy);
  p.aimDeg = Math.max(-90, Math.min(90, (raw * 180) / Math.PI));
  p.strength = Math.max(0, Math.min(1, Math.hypot(dx, dy) / aimSpan(height, twoPlayer)));
}

export function throwSpeedOf(p: LauncherPlayer, twoPlayer?: boolean): number {
  const t = Math.pow(Math.max(0, p.strength), PhysicsConfig.POWER_CURVE);
  return (
    (PhysicsConfig.THROW_MIN + t * (PhysicsConfig.THROW_MAX - PhysicsConfig.THROW_MIN)) *
    PhysicsConfig.DUEL_POWER *
    PhysicsConfig.SC
  );
}

/**
 * Scratch for `mouthPenetration`, the scalar form of `mouthNormalAt`.
 *
 * The relax pass tests every member of every group against both bays on each of
 * its 24 iterations, so the small result object this used to allocate dominated
 * the cost of the test itself. Never read these without a `true` return.
 */
let penDeep = 0, penNx = 0, penNy = 0;

function mouthPenetration(b: Ball, mx: number, my: number, height: number): boolean {
  const dx = b.x - mx, dy = b.y - my;
  const d = Math.hypot(dx, dy);
  const pen = mouthRadius() + PhysicsConfig.R - d;
  if (pen <= 0) return false;
  penDeep = pen;
  if (d > 0.001) { penNx = dx / d; penNy = dy / d; }
  else { penNx = 0; penNy = -Math.sign(my - height / 2) || -1; }
  return true;
}

export function mouthNormalAt(b: Ball, m: Vector2D, height: number) {
  return mouthPenetration(b, m.x, m.y, height)
    ? { pen: penDeep, nx: penNx, ny: penNy }
    : null;
}

export function mouthClamp(g: Group, players: LauncherPlayer[], width: number, height: number) {
  const inset = bayInset();
  const mx = width / 2;
  for (const p of players) {
    const my = p.side > 0 ? height - inset : inset;
    let deep = 0, nx = 0, ny = 0;
    for (const b of g.members) {
      if (b.exempt) continue;
      if (mouthPenetration(b, mx, my, height) && penDeep > deep) {
        deep = penDeep; nx = penNx; ny = penNy;
      }
    }
    if (deep > 0) shiftGroup(g, nx * deep, ny * deep);
  }
}

export function mouthCollide(g: Group, players: LauncherPlayer[], width: number, height: number) {
  const inset = bayInset();
  const mx = width / 2;
  for (const p of players) {
    const my = p.side > 0 ? height - inset : inset;
    let deep = 0, hit: Ball | null = null, nx = 0, ny = 0;
    for (const b of g.members) {
      if (b.exempt) continue;
      if (mouthPenetration(b, mx, my, height) && penDeep > deep) {
        deep = penDeep; hit = b; nx = penNx; ny = penNy;
      }
    }
    if (!hit) continue;
    shiftGroup(g, nx * deep, ny * deep);
    const rx = hit.x - nx * PhysicsConfig.R - g.com.x, ry = hit.y - ny * PhysicsConfig.R - g.com.y;
    const vn = (g.vx - g.av * ry) * nx + (g.vy + g.av * rx) * ny;
    if (vn >= 0) continue;
    const rn = rx * ny - ry * nx;
    const invI = PhysicsConfig.SPIN / g.inertia;
    const j = (-(1 + PhysicsConfig.REST_WALL) * vn) / (1 / g.mass + rn * rn * invI);
    g.vx += (j * nx) / g.mass; g.vy += (j * ny) / g.mass;
    g.av += j * rn * invI;
  }
}

export function clearExempt(balls: Ball[], players: LauncherPlayer[], dt: number, width: number, height: number) {
  // The bay mouths do not move between balls, so resolve them once instead of
  // rebuilding a point per exempt ball per player.
  const inset = bayInset();
  const mx = width / 2;
  for (const b of balls) {
    if (!b.exempt) continue;
    b.exempt -= dt;
    let inside = false;
    for (const p of players) {
      if (mouthPenetration(b, mx, p.side > 0 ? height - inset : inset, height)) {
        inside = true;
        break;
      }
    }
    if (!inside || b.exempt <= 0) b.exempt = 0;
  }
}
