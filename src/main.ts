import { Game, createGame, resetField, startTurns, spawn } from './game/GameState';
import { advanceFrame } from './sim/Frame';
import { createRenderContext, resizeRenderer, drawGame, drawResultsCanvas } from './graphics/Renderer';
import { clearSpriteCache } from './graphics/Sprites';
import { createStrip } from './ui/ControlStrips';
import { setupTouchControls } from './ui/TouchControls';
import { updateHUD, endMatchUI } from './ui/HUD';
import { setupSettingsKnobs } from './ui/SettingsModal';
import { settingsLine } from './game/Settings';
import { PhysicsConfig } from './physics/Config';
import { initAudio, AudioStore, applyGain, fadeDroneForResults, fadeDroneForOptions, setOptionsOpenState, isOptionsOpen } from './audio/SynthEngine';
import { playNote, playThud, playCountdownTick } from './audio/Voices';
import { initMenuScreen, showMenu, isMenuOccluding, playBinauralClick, slideOutRight, slideInFromRight } from './ui/MenuScreen';

const stageEl = document.getElementById('stage') as HTMLElement;
const cv = document.getElementById('c') as HTMLCanvasElement;
const renderCtx = createRenderContext(cv);
const game = createGame();

function handleResize() {
  resizeRenderer(renderCtx, stageEl);
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 60));

if (window.ResizeObserver) {
  new ResizeObserver(() => handleResize()).observe(stageEl);
}
if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
  document.fonts.ready.then(handleResize);
}

/**
 * Chrome can drop a 2D canvas's backing store while the tab is in the
 * background. The context comes back reset: the DPR transform is gone, so the
 * field draws into the top-left quarter with stale pixels around it, and the
 * cached sprite canvases are blank, so the balls and the liquid glow vanish.
 * Nothing about the size changed, so an ordinary resize cannot see it — rebuild
 * the sprites and re-apply sizing unconditionally.
 */
function recoverGraphics() {
  clearSpriteCache();
  resizeRenderer(renderCtx, stageEl, true);
}
for (const c of [cv, renderCtx.resCv, renderCtx.bg]) {
  c?.addEventListener('contextrestored', recoverGraphics);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recoverGraphics();
});
window.addEventListener('pageshow', recoverGraphics);

const strip1 = createStrip(
  game.players[0],
  { chipNow: 'chipNow', chipNext: 'chipNext', strip: 'cue' },
  false,
  () => game
);

const strip2 = createStrip(
  game.players[1],
  { chipNow: 'chipNow2', chipNext: 'chipNext2', strip: 'cue2' },
  true,
  () => game
);

function syncAllStrips() {
  strip1.sync();
  strip2.sync();
}

function refreshAllStrips() {
  strip1.refresh();
  strip2.refresh();
}

setupTouchControls(cv, () => game, syncAllStrips);

const pauseBtn = document.getElementById('pause-btn');
const pauseOverlay = document.getElementById('pause-overlay');

export function setPaused(paused: boolean) {
  if (game.matchOver) {
    paused = false;
  }
  game.paused = paused;
  if (pauseOverlay) {
    if (paused) pauseOverlay.removeAttribute('hidden');
    else pauseOverlay.setAttribute('hidden', '');
  }
  // Also dismiss the exit confirmation when unpausing
  if (!paused) {
    const confirmEl = document.getElementById('menu-confirm-overlay');
    if (confirmEl) confirmEl.setAttribute('hidden', '');
  }
  if (pauseBtn) {
    pauseBtn.textContent = paused ? 'Unpause' : 'Pause';
    if (paused) pauseBtn.classList.add('is-paused');
    else pauseBtn.classList.remove('is-paused');
  }
}

function togglePause() {
  initAudio();
  const nextState = !game.paused;
  playBinauralClick(nextState ? 330 : 261.63, 0.16, 0, 'toggle');
  setPaused(nextState);
}

pauseBtn?.addEventListener('click', togglePause);
pauseOverlay?.addEventListener('click', () => {
  if (game.paused) {
    initAudio();
    playBinauralClick(330, 0.16, 0, 'toggle');
    setPaused(false);
  }
});

window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
    if (e.key === ' ') e.preventDefault();
    togglePause();
  }
});

function newMatch() {
  resetField(game, renderCtx.W, renderCtx.H);
  setPaused(false);
  game.matchT = 0;
  game.matchOver = false;
  // Give each player a full reload delay so no ball fires until the start countdown finishes
  for (const p of game.players) p.reload = game.reloadTime;
  game.matchRunning = true;
  fadeDroneForResults(false);
  const overEl = document.getElementById('over');
  if (overEl) overEl.setAttribute('hidden', '');
  // Reset start countdown
  _cdStartElapsed = 0;
  _cdLastText = '';
}


setupSettingsKnobs(() => game, handleResize, () => renderCtx.H || window.innerHeight);

let playMode = 1;
function setPlayers(n: number) {
  // The menu owns the audio toggle while it is up, and it writes straight to
  // AudioStore. Nothing refreshed the bar's button from that, so a match entered
  // with audio switched off in the menu still showed "Audio on".
  setSound(AudioStore.soundOn);
  playMode = n;
  game.twoPlayer = n !== 1;
  game.aiOn = n === 3;
  const strip2El = document.getElementById('cue2');
  if (strip2El) {
    if (game.twoPlayer && !game.aiOn) strip2El.removeAttribute('hidden');
    else strip2El.setAttribute('hidden', '');
  }
  newMatch();
  handleResize();
}

const soundBtn = document.getElementById('sound');
function setSound(on: boolean) {
  AudioStore.soundOn = on;
  if (soundBtn) {
    soundBtn.textContent = on ? 'Audio on' : 'Audio off';
    soundBtn.setAttribute('aria-pressed', String(on));
  }
  applyGain();
}
soundBtn?.addEventListener('click', () => { initAudio(); setSound(!AudioStore.soundOn); if (AudioStore.soundOn) playBinauralClick(330, 0.16, 0, 'toggle'); });

const panelEl = document.getElementById('panel');
const panelCloseBtn = document.getElementById('panel-close');
function showOptionsPanel() {
  setOptionsOpenState(true);
  fadeDroneForOptions(true);
  if (panelEl) panelEl.removeAttribute('hidden');
}
function hideOptionsPanel() {
  setOptionsOpenState(false);
  fadeDroneForOptions(false);
  if (panelEl) panelEl.setAttribute('hidden', '');
}
panelCloseBtn?.addEventListener('click', () => {
  initAudio();
  playBinauralClick(261.63, 0.16, 0, 'toggle');
  slideInFromRight();
  setTimeout(() => {
    hideOptionsPanel();
  }, 550);
});

const copyBtn = document.getElementById('copy') as HTMLButtonElement;
const settingsBox = document.getElementById('settings') as HTMLTextAreaElement;
copyBtn?.addEventListener('click', () => {
  const line = settingsLine();
  if (settingsBox) {
    settingsBox.value = line;
    settingsBox.focus();
    if (settingsBox.setSelectionRange) settingsBox.setSelectionRange(0, line.length);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(line).then(() => {
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy these settings'; }, 2600);
    });
  }
});

// Fullscreen API fallback
const fsBtn = document.getElementById('fs');
const docEl = document.documentElement as any;
const fsRequest = docEl.requestFullscreen || docEl.webkitRequestFullscreen || null;
const fsExit = document.exitFullscreen || (document as any).webkitExitFullscreen || null;
function fsActive() { return document.fullscreenElement || (document as any).webkitFullscreenElement || null; }
function fsLabel() { if (fsBtn) fsBtn.textContent = fsActive() ? 'Exit full screen' : 'Full screen'; }
if (!fsRequest && fsBtn) {
  fsBtn.setAttribute('hidden', '');
} else if (fsBtn) {
  fsBtn.addEventListener('click', () => {
    try {
      if (fsActive()) { if (fsExit) fsExit.call(document); }
      else { fsRequest.call(docEl); }
    } catch (e) {}
  });
  document.addEventListener('fullscreenchange', () => { fsLabel(); handleResize(); });
}

// Game Loop
let lastTime = performance.now() / 1000;
let clock = 0;

// ── Countdown in player cue bars ───────────────────────────────────────────
const cd1El = document.getElementById('countdown1') as HTMLElement;
const cd2El = document.getElementById('countdown2') as HTMLElement;
// Tracks the last text shown so we only re-trigger the pop animation on change
let _cdLastText = '';
let _cdStartElapsed = -1; // seconds since match reset; -1 = inactive

/** Apply text + classes to both countdown bar elements (hiding the time display
 *  when active, and only driving cd2El when in two-player mode). */
function setCdText(text: string, cls: 'start' | 'go' | 'end') {
  const els = game.twoPlayer ? [cd1El, cd2El] : [cd1El];
  const time1El = document.getElementById('time1');
  const time2El = document.getElementById('time2');

  for (const el of [cd1El, cd2El]) {
    if (!el) continue;
    el.setAttribute('hidden', '');
    el.classList.remove('end', 'go', 'pop');
  }
  if (time1El) time1El.removeAttribute('hidden');
  if (time2El) time2El.removeAttribute('hidden');

  if (text === '') return; // nothing to show

  if (time1El) time1El.setAttribute('hidden', '');
  if (game.twoPlayer && time2El) time2El.setAttribute('hidden', '');

  for (const el of els) {
    if (!el) continue;
    el.removeAttribute('hidden');
    if (cls === 'end') el.classList.add('end');
    if (cls === 'go')  el.classList.add('go');
    if (text !== _cdLastText) {
      el.classList.remove('pop');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('pop');
      el.textContent = text;
      // Play countdown tick once per text change (only on the first element to avoid double-fire)
      if (el === els[0]) {
        playCountdownTick(cls === 'go' || (cls === 'end' && text === '0'));
      }
    }
  }
  _cdLastText = text;
}

function updateCountdown() {
  const reloadSecs = game.reloadTime;

  // ── Start countdown (reloadTime → 1 → Start!) ─────────────────────────
  if (_cdStartElapsed >= 0 && !game.matchOver) {
    const left = reloadSecs - _cdStartElapsed;
    if (left > 0) {
      setCdText(Math.ceil(left).toString(), 'start');
      return;
    } else if (_cdStartElapsed < reloadSecs + 1) {
      setCdText('Start!', 'go');
      return;
    } else {
      _cdStartElapsed = -1; // done
    }
  }

  // ── End-of-match countdown (last 10 s) ────────────────────────────────
  if (game.matchLen > 0 && game.matchRunning && !game.matchOver) {
    const left = Math.max(0, game.matchLen - game.matchT);
    if (left <= 10) {
      setCdText(left <= 0 ? '0' : Math.ceil(left).toString(), 'end');
      return;
    }
  }

  // Nothing to show — restore time displays
  setCdText('', 'start');
  _cdLastText = '';
}

let lastResultsFlashTime = 0;
let lastResultsPopTime = 0;

/**
 * Which player the results celebration belongs to, or -1 for nobody.
 *
 * A draw is credited to player 1, the same way the results card calls it. The
 * AI is player 2 and never gets a celebration: losing to it is not an occasion
 * for fireworks, so when it wins nothing new is spawned.
 */
function celebrationWinner(game: Game): number {
  if (!game.twoPlayer) return 0;
  const p0 = game.players[0]?.score || 0;
  const p1 = game.players[1]?.score || 0;
  const winnerIdx = p0 >= p1 ? 0 : 1;
  if (game.aiOn && winnerIdx === 1) return -1;
  return winnerIdx;
}

/**
 * Vertical band the celebration is allowed to occupy, in screen pixels.
 *
 * Split-screen gives player 1 the bottom half and player 2 the top half (their
 * card is the flipped one), so the celebration stays on the winner's side of
 * the midline instead of spilling onto the loser's board. Solo play owns the
 * whole screen.
 */
function celebrationBand(game: Game, winnerIdx: number, H: number): { top: number; bottom: number } {
  if (!game.twoPlayer) return { top: H * 0.15, bottom: H * 0.85 };
  return winnerIdx === 0 ? { top: H * 0.5, bottom: H } : { top: 0, bottom: H * 0.5 };
}

/** Pick a coordinate inside [lo, hi], falling back to its centre when inverted. */
function randBetween(lo: number, hi: number): number {
  return hi > lo ? lo + Math.random() * (hi - lo) : (lo + hi) / 2;
}

function updateResultsEffects(game: Game, dt: number, W: number, H: number) {
  const now = performance.now();

  // 1. Advance active flashes
  for (let i = game.flashes.length - 1; i >= 0; i--) {
    game.flashes[i].t += dt;
    if (game.flashes[i].t >= 0.85) game.flashes.splice(i, 1);
  }

  // 2. Advance active pops
  for (let i = game.pops.length - 1; i >= 0; i--) {
    const pop = game.pops[i];
    pop.t += dt;
    pop.y -= dt * 30;
    if (pop.t >= 1.1) game.pops.splice(i, 1);
  }

  const winnerIdx = celebrationWinner(game);
  if (winnerIdx < 0) return; // AI won — let whatever is still on screen fade and spawn nothing

  const band = celebrationBand(game, winnerIdx, H);

  // 3. Spawn randomized celebratory flashes
  if (game.flashes.length < 5 && now - lastResultsFlashTime > 850 + Math.random() * 1300) {
    lastResultsFlashTime = now;
    const kinds: ('bond' | 'break' | 'spawn' | 'blocked')[] = ['bond', 'break', 'spawn', 'blocked'];
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    // A ring grows to about R*5 before it fades, so inset the spawn by that much
    // to keep the whole ring inside the winner's band.
    const ringReach = PhysicsConfig.R * 5.5;
    const rx = randBetween(Math.max(W * 0.12, ringReach), Math.min(W * 0.88, W - ringReach));
    const ry = randBetween(band.top + ringReach, band.bottom - ringReach);
    game.flashes.push({ x: rx, y: ry, t: 0, kind: k });

    if (AudioStore.soundOn && !isOptionsOpen()) {
      const normX = W > 0 ? (rx / W) * 2 - 1 : 0;
      playNote(Math.random(), normX, k === 'break' ? 'break' : k === 'bond' ? 'bond' : 'burst', 0.6);
    }
  }

  // 4. Spawn randomized celebratory pops
  if (game.pops.length < 4 && now - lastResultsPopTime > 1200 + Math.random() * 1600) {
    lastResultsPopTime = now;
    // Congratulations only. This list used to mix in the in-match event labels
    // (BOND, BURST, LOCK, PEEL) and invented score pops (+1000, +5000), which
    // read as though something were still being scored on a board that has
    // stopped. Keep the words short — a pop is drawn centred and can spawn as
    // far left as 15% of the width, so a long one clips on a phone.
    const celebrationTexts = ['WINNER!', 'VICTORY!', 'PERFECT!', 'AMAZING!', 'SUPERB!', 'BRAVO!', 'CHAMP!'];
    const txt = celebrationTexts[Math.floor(Math.random() * celebrationTexts.length)];
    // Player 1's pop rises about 70px over its life; player 2's is drawn rotated,
    // so its own drift and its float offset cancel and it stays roughly put.
    const pad = 28;
    const ry = winnerIdx === 1
      ? randBetween(band.top + pad, band.bottom - pad)
      : randBetween(band.top + 70, band.bottom - pad);
    const rx = randBetween(W * 0.15, W * 0.85);
    game.pops.push({ x: rx, y: ry, t: 0, text: txt, who: winnerIdx });

    if (AudioStore.soundOn && !isOptionsOpen() && Math.random() < 0.4) {
      const normX = W > 0 ? (rx / W) * 2 - 1 : 0;
      playThud('swoosh', normX, 0.4);
    }
  }
}

function frame(ts: number) {
  const t = ts / 1000;
  const rawDt = t - lastTime;
  lastTime = t;

  // The menu is an opaque full-screen overlay that runs its own render loop.
  // Simulating and drawing the game underneath it is invisible work — a full
  // physics step, a full canvas render, seven innerHTML writes and both control
  // strips, every frame — and the main-thread time it costs is what starves the
  // Web Audio thread and makes the menu crackle. `lastTime` is still advanced
  // above, so the first live frame after the menu closes gets a normal dt.
  if (isMenuOccluding()) {
    requestAnimationFrame(frame);
    return;
  }

  const W = renderCtx.W || window.innerWidth;
  const H = renderCtx.H || window.innerHeight;

  clock = advanceFrame(game, rawDt, W, H, clock, {
    onMatchOver: g => { setPaused(false); endMatchUI(g, newMatch); },
  }).clock;

  if (game.matchOver && !game.paused) {
    updateResultsEffects(game, rawDt, W, H);
  }

  drawGame(renderCtx, game, clock);
  drawResultsCanvas(renderCtx, game);
  updateHUD(game);
  refreshAllStrips();

  // Advance start countdown timer when not paused
  if (_cdStartElapsed >= 0 && !game.paused) _cdStartElapsed += rawDt;
  updateCountdown();

  requestAnimationFrame(frame);
}

const menuBtn = document.getElementById('menu-btn');
const menuConfirmOverlay = document.getElementById('menu-confirm-overlay');
const menuConfirmExit = document.getElementById('menu-confirm-exit');
const menuConfirmCancel = document.getElementById('menu-confirm-cancel');

function showMenuConfirm() {
  initAudio();
  playBinauralClick(261.63, 0.16, 0, 'toggle');
  // On the results screen there is no progress left to lose, and `setPaused`
  // refuses to pause once the match is over — so asking for confirmation there
  // would put up a dialog that nothing can dismiss. Leave straight away.
  if (game.matchOver) {
    exitToMenu();
    return;
  }
  setPaused(true);
  if (menuConfirmOverlay) menuConfirmOverlay.removeAttribute('hidden');
}

function hideMenuConfirm() {
  if (menuConfirmOverlay) menuConfirmOverlay.setAttribute('hidden', '');
}

/**
 * Leave the match for the main menu, from anywhere the match can be left: the
 * confirmation dialog, or the results screen. The results overlay and its
 * ducked drone outlive `matchOver`, so both have to be cleared here — otherwise
 * the menu comes up with the score card still stacked over it and the ambient
 * drone silenced until the next match starts.
 */
function exitToMenu() {
  hideMenuConfirm();
  setPaused(false);
  const overEl = document.getElementById('over');
  if (overEl) overEl.setAttribute('hidden', '');
  fadeDroneForResults(false);
  showMenu();
}

function confirmExitToMenu() {
  initAudio();
  playBinauralClick(330, 0.16, 0, 'toggle');
  exitToMenu();
}

function cancelExitToMenu() {
  initAudio();
  playBinauralClick(261.63, 0.16, 0, 'toggle');
  hideMenuConfirm();
  setPaused(false);
}

if (menuBtn) {
  menuBtn.addEventListener('click', showMenuConfirm);
}
menuConfirmExit?.addEventListener('click', confirmExitToMenu);
menuConfirmCancel?.addEventListener('click', cancelExitToMenu);

initMenuScreen(
  (selectedMode: number) => {
    initAudio();
    setPlayers(selectedMode);
  },
  () => {
    initAudio();
    showOptionsPanel();
    slideOutRight();
  }
);

setPlayers(1);
if (settingsBox) settingsBox.value = settingsLine();
handleResize();
newMatch();
setTimeout(handleResize, 60);
setTimeout(handleResize, 300);
requestAnimationFrame(frame);
showMenu();
