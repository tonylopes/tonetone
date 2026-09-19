import { Game } from '../game/GameState';
import { LauncherPlayer } from '../physics/Types';
import { aimAt } from '../physics/LauncherBays';
import { initAudio } from '../audio/SynthEngine';

export function setupTouchControls(
  canvas: HTMLCanvasElement,
  getGame: () => Game,
  syncStrips: () => void
) {
  const owners = new Map<number, LauncherPlayer>();

  function playerForTouch(y: number, height: number, game: Game): LauncherPlayer | null {
    if (!game.twoPlayer) return game.players[0];
    const p = y < height / 2 ? game.players[1] : game.players[0];
    if (game.aiOn && p === game.players[1]) return null;
    return p;
  }

  function pointAt(e: PointerEvent, p: LauncherPlayer, height: number, width: number) {
    const r = canvas.getBoundingClientRect();
    aimAt(p, e.clientX - r.left, e.clientY - r.top, width, height, getGame().twoPlayer);
    syncStrips();
  }

  canvas.addEventListener('pointerdown', e => {
    const game = getGame();
    if (game.paused) return;
    initAudio();
    const r = canvas.getBoundingClientRect();
    const height = r.height || window.innerHeight;
    const width = r.width || window.innerWidth;
    const p = playerForTouch(e.clientY - r.top, height, game);
    if (!p) return;

    for (const held of owners.values()) if (held === p) return;
    owners.set(e.pointerId, p);
    pointAt(e, p, height, width);
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    const game = getGame();
    if (game.paused) return;
    const p = owners.get(e.pointerId);
    if (p) {
      const r = canvas.getBoundingClientRect();
      pointAt(e, p, r.height || window.innerHeight, r.width || window.innerWidth);
    }
  });

  const release = (e: PointerEvent) => {
    const p = owners.get(e.pointerId);
    if (!p) return;
    owners.delete(e.pointerId);
    const r = canvas.getBoundingClientRect();
    pointAt(e, p, r.height || window.innerHeight, r.width || window.innerWidth);
  };

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
}
