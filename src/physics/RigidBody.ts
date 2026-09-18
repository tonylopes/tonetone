import { Ball, Group, Offset } from './Types';
import { PhysicsConfig } from './Config';
import { BLACK, colorOfKind } from '../game/Rules';

export function makeGroup(members: Ball[], vx: number, vy: number): Group {
  let cx = 0, cy = 0;
  for (const m of members) { cx += m.x; cy += m.y; }
  cx /= members.length; cy /= members.length;

  const offsets: Offset[] = [];
  let inertia = 0;
  for (const m of members) {
    const ox = m.x - cx, oy = m.y - cy;
    offsets.push({ x: ox, y: oy });
    inertia += ox * ox + oy * oy + (PhysicsConfig.R * PhysicsConfig.R) / 2;
  }

  return {
    members,
    offsets,
    com: { x: cx, y: cy },
    ang: 0,
    av: 0,
    vx,
    vy,
    mass: members.length,
    inertia,
    color: null,
  };
}

export function syncGroup(g: Group) {
  const c = Math.cos(g.ang), s = Math.sin(g.ang);
  for (let i = 0; i < g.members.length; i++) {
    const o = g.offsets[i], m = g.members[i];
    m.x = g.com.x + o.x * c - o.y * s;
    m.y = g.com.y + o.x * s + o.y * c;
  }
}

export function shiftGroup(g: Group, dx: number, dy: number) {
  g.com.x += dx; g.com.y += dy;
  for (const b of g.members) { b.x += dx; b.y += dy; }
}

export function rebuildGroups(balls: Ball[], byId: Map<number, Ball>): Group[] {
  // One pass per group, not one per member. `balls.map(b => b.group)` lists a
  // group once for every ball in it, so an N-ball cluster used to re-derive the
  // same N member velocities N times — O(N^2) of byte-identical writes.
  const carried = new Set<Group>();
  for (const b of balls) {
    const g = b.group;
    if (!g || carried.has(g)) continue;
    carried.add(g);
    for (const m of g.members) {
      const rx = m.x - g.com.x, ry = m.y - g.com.y;
      m._vx = g.vx - g.av * ry;
      m._vy = g.vy + g.av * rx;
      m._av = g.av;
      m._pg = g;
    }
  }

  const seen = new Set<number>();
  const out: Group[] = [];

  for (const b of balls) {
    if (seen.has(b.id)) continue;
    const members: Ball[] = [];
    const stack = [b];
    seen.add(b.id);

    while (stack.length) {
      const cur = stack.pop()!;
      members.push(cur);
      for (const id of cur.bonds) {
        if (!seen.has(id) && byId.has(id)) {
          seen.add(id);
          stack.push(byId.get(id)!);
        }
      }
    }

    let vx = 0, vy = 0;
    for (const m of members) { vx += m._vx || 0; vy += m._vy || 0; }
    vx /= members.length; vy /= members.length;
    const g = makeGroup(members, vx, vy);

    let L = 0;
    for (let i = 0; i < members.length; i++) {
      const o = g.offsets[i], m = members[i];
      L += o.x * ((m._vy || 0) - vy) - o.y * ((m._vx || 0) - vx);
      L += ((PhysicsConfig.R * PhysicsConfig.R) / 2) * (m._av || 0);
    }
    g.av = Math.max(-12, Math.min(12, PhysicsConfig.SPIN * L / g.inertia));

    if (members.length > 1) {
      const plain = members.find(m => !m.special);
      g.color = plain ? colorOfKind(plain.kind) : BLACK;
    }

    for (const m of members) m.group = g;
    out.push(g);
  }

  return out;
}

export function clampWalls(g: Group, width: number, height: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const R = PhysicsConfig.R;
  for (const b of g.members) {
    minX = Math.min(minX, b.x - R); maxX = Math.max(maxX, b.x + R);
    minY = Math.min(minY, b.y - R); maxY = Math.max(maxY, b.y + R);
  }
  if (minX < 0) shiftGroup(g, -minX, 0); else if (maxX > width) shiftGroup(g, width - maxX, 0);
  if (minY < 0) shiftGroup(g, 0, -minY); else if (maxY > height) shiftGroup(g, 0, height - maxY);
}

export function separateGroups(A: Group, B: Group, nx: number, ny: number): boolean {
  const R = PhysicsConfig.R;
  const need = 2 * R + 0.05, need2 = need * need;
  const LIMIT = 2 * R;
  const windows: [number, number][] = [];

  for (const a of A.members) {
    for (const b of B.members) {
      const px = b.x - a.x, py = b.y - a.y;
      const pn = px * nx + py * ny;
      const disc = pn * pn - (px * px + py * py) + need2;
      if (disc <= 0) continue;
      const s = Math.sqrt(disc);
      const hi = -pn + s;
      if (hi <= 0) continue;
      windows.push([-pn - s, hi]);
    }
  }
  windows.sort((u, v) => u[0] - v[0]);

  let delta = 0;
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (const [lo, hi] of windows) {
      if (delta >= lo && delta < hi) { delta = hi; moved = true; }
    }
    if (!moved) break;
  }
  if (delta > LIMIT) return false;
  if (delta > 0) {
    const mA = A.members.length, mB = B.members.length;
    shiftGroup(A, -nx * delta * mB / (mA + mB), -ny * delta * mB / (mA + mB));
    shiftGroup(B, nx * delta * mA / (mA + mB), ny * delta * mA / (mA + mB));
  }
  return true;
}
