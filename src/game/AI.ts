import { Ball, Group, LauncherPlayer } from '../physics/Types';
import { aimAt, launchPointOf } from '../physics/LauncherBays';

export function aiAim(p: LauncherPlayer, groups: Group[], balls: Ball[], width: number, height: number, twoPlayer: boolean) {
  let best: Group | null = null, most = 0;
  for (const g of groups) {
    if (!g.members.length || g.members[0].ghost) continue;
    if (g.members.length > most) { most = g.members.length; best = g; }
  }

  const tempP = { ...p };

  if (best && most >= 2) {
    // NOTE: `rebuildGroups` mints new Group objects on every bond, burst, peel
    // and spawn, so this identity check rarely holds and `_targetStrength` is
    // re-rolled far more often than "once per target" suggests. Keying on
    // something stable (the lowest member id) makes it behave as written, but
    // that is a balance change, not a cleanup: it moved 119 baseline metrics,
    // in no consistent direction. Decide the feel first, then re-save.
    if ((p as any)._targetGroup !== best) {
      (p as any)._targetGroup = best;
      (p as any)._targetStrength = 0.35 + Math.random() * 0.65;
    }
    aimAt(tempP, best.com.x, best.com.y, width, height, twoPlayer);
    tempP.strength = (p as any)._targetStrength;
    p._idleDeg = undefined;
  } else {
    const m = launchPointOf(p, width, height);
    let near: Ball | null = null, gap = Infinity;
    for (const b of balls) {
      if (b.ghost) continue;
      const d = Math.hypot(b.x - m.x, b.y - m.y);
      if (d < gap) { gap = d; near = b; }
    }
    if (near) {
      if ((p as any)._targetGroup !== near) {
        (p as any)._targetGroup = near;
        (p as any)._targetStrength = 0.35 + Math.random() * 0.65;
      }
      aimAt(tempP, near.x, near.y, width, height, twoPlayer);
      tempP.strength = (p as any)._targetStrength;
      p._idleDeg = undefined;
    } else {
      (p as any)._targetGroup = null;
      // Empty court: select a single idle angle per empty state instead of randomizing every frame
      if (p._idleDeg === undefined) {
        p._idleDeg = Math.random() * 40 - 20;
      }
      tempP.aimDeg = p._idleDeg;
      tempP.strength = 0.7;
    }
  }

  // Smoothly interpolate aim angle and power so the AI arrow rotates fluidly
  p.aimDeg += (tempP.aimDeg - p.aimDeg) * 0.15;
  p.strength += (tempP.strength - p.strength) * 0.15;
}
