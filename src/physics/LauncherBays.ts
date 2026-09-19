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

/**
 * The furthest the aim may reach, in any direction it can point: both how long
 * the arrow can be drawn and how far a drag goes for a full-strength throw.
 *
 * Both bays sit on the vertical centre line and sweep a half-disc of 180°, so
 * the envelope is round and the tighter of the two dimensions bounds it. A bound
 * taken from the height alone let a sideways aim run off the left or right edge
 * on any portrait screen, where `width / 2` is much the smaller of the two.
 *
 * The drag used to be scaled by the height instead (0.40 of it, 0.80 in solo),
 * which a drag can only reach going forward. Sideways there is only half the
 * width to drag in, so a touch at a bottom corner of a 412×915 phone threw at
 * 0.56 strength at best, and 0.28 in solo. On the round envelope a drag to the
 * edge of the player's area is full strength in every direction.
 */
export function aimMaxReach(width: number, height: number, twoPlayer: boolean): number {
  const forward = twoPlayer ? height / 2 - bayInset() : height - bayInset();
  const sideways = width / 2;
  return Math.max(38, Math.min(forward, sideways));
}

/**
 * How long to draw the aim arrow, growing with strength and topping out at the
 * round limit above.
 *
 * The length is scaled to that limit rather than to the height, so the arrow
 * saturates two thirds of the way up the strength range whatever the screen
 * shape. Scaling it to the height instead left the arrow at full length from a
 * sixth of the range upward on a tall phone, once the width bounded the limit,
 * which stopped it reporting power over most of the throw.
 */
export function aimReachOf(p: LauncherPlayer, width: number, height: number, twoPlayer: boolean): number {
  const maxReach = aimMaxReach(width, height, twoPlayer);
  const reach = p.strength * maxReach * 1.5;
  return Math.min(maxReach, Math.max(38, reach));
}

export function aimAt(p: LauncherPlayer, x: number, y: number, width: number, height: number, twoPlayer: boolean) {
  const m = launchPointOf(p, width, height);
  const dx = x - m.x, dy = y - m.y;
  const raw = p.side > 0 ? Math.atan2(dx, -dy) : Math.atan2(-dx, dy);
  p.aimDeg = Math.max(-90, Math.min(90, (raw * 180) / Math.PI));
  p.strength = Math.max(0, Math.min(1, Math.hypot(dx, dy) / aimMaxReach(width, height, twoPlayer)));
}

// `_twoPlayer` is deliberately ignored: throw power is mode-independent so that a
// single-player shot can still reach BOOM_SPEED. LauncherBays.test.ts pins
// speed1P === speed2P.
export function throwSpeedOf(p: LauncherPlayer, _twoPlayer?: boolean): number {
  const t = Math.pow(Math.max(0, p.strength), PhysicsConfig.POWER_CURVE);
  return (
    (PhysicsConfig.THROW_MIN + t * (PhysicsConfig.THROW_MAX - PhysicsConfig.THROW_MIN)) *
    PhysicsConfig.DUEL_POWER *
    PhysicsConfig.SC
  );
}

/**
 * How close a throw is to booming on impact: 0 at the weakest throw the bay can
 * make, 1 once it reaches `BOOM_SPEED`, and 1 for everything harder.
 *
 * This is the aim arrow's colour — white at 0, red at 1 — so the arrow reports
 * the one thing about power that decides what happens: whether the ball will
 * boom the group it hits. The arrow used to say the same thing as a switch from
 * the player's colour to pink at exactly this threshold, which is the point that
 * is preserved here: heat reaches 1 where the switch used to flip.
 *
 * The floor is the speed at zero strength rather than zero, because a bay never
 * throws slower than `THROW_MIN` and an arrow that starts a third of the way up
 * its own ramp does not read as weak. The threshold above it moves with the
 * `boom` and `maxpower` knobs, which is why it is read from `BOOM_SPEED` each
 * time rather than turned into a strength once. Low enough settings of the two
 * — `boom` 0.2 with `maxpower` 600 — put the threshold under the floor, meaning
 * every throw booms; the heat is then 1 throughout, which is the truth about
 * that combination rather than a case to guard against.
 *
 * **`KICK` is why this is not just `throwSpeedOf`.** The ball leaves the bay at
 * `throwSpeedOf(p) * KICK` — `spawn` applies the multiplier, not this function —
 * so comparing the unmultiplied speed against `BOOM_SPEED` answers a question
 * about a ball nobody throws. The old pink cue did exactly that and was wrong by
 * the size of the `kick` knob in whichever direction it pointed: late at the
 * default 1.2x, where it turned pink at strength 0.35 but the ball boomed from
 * 0.29, and early in Drift at 0.6x, where it promised a boom that did not come.
 * It was exact only in Relax, the one preset at 1.0x.
 */
export function boomHeatOf(p: LauncherPlayer, twoPlayer?: boolean): number {
  const launched = PhysicsConfig.KICK;
  const floor = PhysicsConfig.THROW_MIN * PhysicsConfig.DUEL_POWER * PhysicsConfig.SC * launched;
  const span = PhysicsConfig.BOOM_SPEED - floor;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (throwSpeedOf(p, twoPlayer) * launched - floor) / span));
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
