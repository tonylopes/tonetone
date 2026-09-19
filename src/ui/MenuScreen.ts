import { AudioStore, BEAT, applyGain, initAudio as initGameAudio, isOptionsOpen } from '../audio/SynthEngine';
import { playNote, playRandomGameBoom } from '../audio/Voices';
import { Flash, Pop } from '../physics/Types';
import { CURRENTS, FLASH_SPECS, MENU_RING, drawRippleRing, ringFade, ringRadius } from '../graphics/VisualFX';
import { FLASH_LIFE, POP_LIFE } from '../physics/Types';
import { PlayMode } from '../game/GameState';
import { setHidden } from './Dom';
import { TAU } from '../math';
import { ballSprite, clearSpriteCache, glowSprite } from '../graphics/Sprites';
import { uiFont, logoFont } from '../graphics/Fonts';
import { colorOfKind, randomKind } from '../game/Rules';
import { BLACK_HEX, MENU_CYAN, MENU_PINK, MENU_PINK_DEEP, WHITE_HEX, hex, rgb, rgba } from '../graphics/Palette';
import { P_COLOR } from '../graphics/Renderer';

export interface MenuItem {
  text: string;
  action: string;
}

const menuItems: MenuItem[] = [
  { text: 'Solo', action: 'solo' },
  { text: '1 player', action: 'one_player' },
  { text: '2 players', action: 'two_player' },
  { text: 'Options', action: 'options' }
];

let menuContainer: HTMLElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let audioBtn: HTMLButtonElement | null = null;
let fsBtn: HTMLButtonElement | null = null;

let width = 0;
let height = 0;
let dpr = 1;
let animFrame = 0;
let animationId = 0;
let menuActive = false;

let onModeSelectCallback: ((mode: PlayMode) => void) | null = null;
let onOptionsCallback: (() => void) | null = null;

const pointer = { x: -1000, y: -1000, isDown: false };
let activeHoverIndex = -1;
let clickedItemIndex = -1;

const spotlights = [
  { baseX: 0.16, baseY: -0.18, angle: 0.40, spread: 0.52, color: 'rgba(0, 247, 255, ', intensity: 0.46, pulseSpeed: 0.012, pulseOffset: 0.0 },
  { baseX: 0.50, baseY: -0.22, angle: 0.0, spread: 0.65, color: 'rgba(255, 0, 127, ', intensity: 0.48, pulseSpeed: 0.015, pulseOffset: 2.1 },
  { baseX: 0.84, baseY: -0.18, angle: -0.40, spread: 0.52, color: 'rgba(165, 0, 255, ', intensity: 0.42, pulseSpeed: 0.010, pulseOffset: 3.8 },
  { baseX: 0.50, baseY: -0.10, angle: 0.0, spread: 0.35, color: 'rgba(0, 247, 255, ', intensity: 0.25, pulseSpeed: 0.020, pulseOffset: 1.0 }
];

interface Mote {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  alpha: number;
  pulse: number;
}

const motes: Mote[] = [];
const NUM_MOTES = 75;

function initMotes() {
  motes.length = 0;
  for (let i = 0; i < NUM_MOTES; i++) {
    motes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2.0 + 0.6,
      speedY: -(Math.random() * 0.35 + 0.12),
      speedX: (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.65 + 0.25,
      pulse: Math.random() * TAU
    });
  }
}

// ── Ambient Menu Background Balls & Bonds ──────────────────────────────
interface MenuBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  kind: number;
}
const menuBalls: MenuBall[] = [];
const NUM_MENU_BALLS = 8;
let lastBondFlashTime = 0;

function initMenuBalls() {
  menuBalls.length = 0;
  if (width <= 0 || height <= 0) return;
  const pad = 40;
  for (let i = 0; i < NUM_MENU_BALLS; i++) {
    const kind = randomKind();
    const isSpecial = Math.random() < 0.15;
    const color = isSpecial ? (Math.random() < 0.5 ? BLACK_HEX : WHITE_HEX) : colorOfKind(kind);
    menuBalls.push({
      id: i + 1,
      x: pad + Math.random() * (width - pad * 2),
      y: pad + Math.random() * (height - pad * 2),
      vx: (Math.random() - 0.5) * 0.9,
      vy: (Math.random() - 0.5) * 0.9,
      radius: Math.floor(Math.random() * 4 + 13),
      color,
      kind
    });
  }
}

function updateAndDrawMenuBalls() {
  const c = ctx;
  if (!c || menuBalls.length === 0) return;

  const pad = 25;
  c.save();

  // Update positions and bounce off boundaries
  for (let i = 0; i < menuBalls.length; i++) {
    const b = menuBalls[i];
    b.x += b.vx;
    b.y += b.vy;

    if (b.x < pad) { b.x = pad; b.vx *= -1; }
    if (b.x > width - pad) { b.x = width - pad; b.vx *= -1; }
    if (b.y < pad) { b.y = pad; b.vy *= -1; }
    if (b.y > height - pad) { b.y = height - pad; b.vy *= -1; }
  }

  // Draw glowing bond lines between nearby balls
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  const now = performance.now();

  for (let i = 0; i < menuBalls.length; i++) {
    for (let j = i + 1; j < menuBalls.length; j++) {
      const b1 = menuBalls[i];
      const b2 = menuBalls[j];
      const dx = b2.x - b1.x;
      const dy = b2.y - b1.y;
      const distSq = dx * dx + dy * dy;
      const maxDist = 150;

      if (distSq < maxDist * maxDist) {
        const dist = Math.sqrt(distSq);
        const alpha = Math.max(0, 1 - dist / maxDist) * 0.5;

        c.beginPath();
        c.moveTo(b1.x, b1.y);
        c.lineTo(b2.x, b2.y);
        c.globalAlpha = alpha * 0.45;
        c.lineWidth = 9;
        const wash = c.createLinearGradient(b1.x, b1.y, b2.x, b2.y);
        wash.addColorStop(0, b1.color);
        wash.addColorStop(1, b2.color);
        c.strokeStyle = wash;
        c.stroke();

        c.globalAlpha = alpha * 0.85;
        c.lineWidth = 1.8;
        c.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        c.stroke();

        // Trigger flash when two balls drift very close
        if (dist < (b1.radius + b2.radius) * 1.8 && now - lastBondFlashTime > 800) {
          lastBondFlashTime = now;
          spawnMenuFlash((b1.x + b2.x) / 2, (b1.y + b2.y) / 2, 'bond',
            b1.kind < 0 ? 0.5 : b1.kind / 6);
        }
      }
    }
  }

  // Draw background menu balls with sprite and glowing aura
  c.globalCompositeOperation = 'source-over';
  for (const b of menuBalls) {
    const d = b.radius * 2;
    c.globalAlpha = 0.55;
    c.drawImage(glowSprite(b.color), b.x - d * 1.2, b.y - d * 1.2, d * 2.4, d * 2.4);

    c.globalAlpha = 0.85;
    c.drawImage(ballSprite(b.color, false), b.x - b.radius, b.y - b.radius, d, d);
  }

  c.restore();
}

// ── Randomized Menu In-Game Flashes ─────────────────────────────────────
interface MenuFlash extends Flash {
  id: number;
}
const menuFlashes: MenuFlash[] = [];
let nextFlashId = 1;
let lastAutoFlashTime = 0;

/**
 * Spawn a menu flash and play the sound the same event makes in a match.
 *
 * The menu used to play a `playBinauralClick` blip for every flash kind. That
 * routed all four through the `'hover'` branch, which clamps the frequency to
 * 261.63Hz — so bond's 330Hz was pulled down to the same note as the others and
 * the whole menu came out as one low tone. The game's voices are pitched off
 * `AudioStore.scale`, so playing them here gives the menu the tonal range a
 * match has. `rel` picks the scale degree; pass the ball's kind through where
 * there is one, exactly as the collision solver does.
 *
 * `blocked` keeps the UI click: it is a "no" from the interface, not a game event.
 */
function spawnMenuFlash(x: number, y: number, kind?: 'bond' | 'break' | 'spawn' | 'blocked', rel?: number) {
  if (isOptionsOpen()) return;
  const kinds: ('bond' | 'break' | 'spawn' | 'blocked')[] = ['bond', 'break', 'spawn', 'blocked'];
  const k = kind || kinds[Math.floor(Math.random() * kinds.length)];
  menuFlashes.push({ id: nextFlashId++, x, y, t: 0, kind: k });

  if (!AudioStore.soundOn) return;
  const normX = width > 0 ? (x / width) * 2 - 1 : 0;
  if (k === 'blocked') {
    playBinauralClick(261.63, 0.2, normX, 'hover');
    return;
  }
  initMenuAudio();
  if (k === 'spawn') {
    // A boom on the menu is a real one, drawn from the spread of chain sizes a
    // match actually produces, rather than the bare `playNote(..., 'boom')`
    // this used to make — that passes no chain size, so every menu boom was the
    // smallest tier and the range never showed.
    playRandomGameBoom(normX, 'menu');
    return;
  }
  playNote(rel !== undefined ? rel : Math.random(), normX,
    k === 'break' ? 'break' : 'bond');
}

function updateAndDrawMenuFlashes() {
  const c = ctx;
  if (!c) return;

  const now = performance.now();
  if (menuFlashes.length < 4 && now - lastAutoFlashTime > 1200 + Math.random() * 1800) {
    lastAutoFlashTime = now;
    const rx = width * (0.10 + Math.random() * 0.80);
    const ry = height * (0.12 + Math.random() * 0.76);
    spawnMenuFlash(rx, ry);
  }

  c.save();
  c.globalCompositeOperation = 'lighter';

  const R = 22; // Virtual ball radius scale for flash sizing
  for (let i = menuFlashes.length - 1; i >= 0; i--) {
    const f = menuFlashes[i];
    f.t += 0.016;
    const spec = FLASH_SPECS[f.kind] || FLASH_SPECS.spawn;
    const p = f.t / FLASH_LIFE;
    if (p >= 1) {
      menuFlashes.splice(i, 1);
      continue;
    }

    const rad = ringRadius(spec, R, p);
    if (rad > 0) {
      // Glow background blob
      const bgRad = rad * 1.5;
      c.globalAlpha = 0.5 * ringFade(p);
      c.drawImage(glowSprite(rgb(spec.color)), f.x - bgRad, f.y - bgRad, bgRad * 2, bgRad * 2);

      // The ring is drawn under the blob's `globalAlpha`, not at full strength:
      // that is how the menu's rings have always been dimmer than the field's,
      // over and above their lower stroke alpha.
      drawRippleRing(c, spec, f.x, f.y, R, p, MENU_RING);
    }
  }

  c.restore();
}

// ── Randomized Menu In-Game Pops ────────────────────────────────────────
interface MenuPop extends Pop {
  id: number;
  vy: number;
}
const menuPops: MenuPop[] = [];
let nextPopId = 1;
let lastAutoPopTime = 0;

const POP_TEXTS = ['BOND!', 'BOOM!', 'PEEL!', 'LOCK!', 'COMBO!', '+100', '+500', '+1000', 'SLOT!', 'PERFECT!'];

function spawnMenuPop(x?: number, y?: number, text?: string, who?: number) {
  if (isOptionsOpen()) return;
  const px = x !== undefined ? x : width * (0.15 + Math.random() * 0.70);
  const py = y !== undefined ? y : height * (0.20 + Math.random() * 0.60);
  const txt = text || POP_TEXTS[Math.floor(Math.random() * POP_TEXTS.length)];
  const w = who !== undefined ? who : (Math.random() < 0.5 ? 0 : 1);

  menuPops.push({
    id: nextPopId++,
    x: px,
    y: py,
    t: 0,
    text: txt,
    who: w,
    vy: -(Math.random() * 0.4 + 0.5)
  });

  if (AudioStore.soundOn && !isOptionsOpen() && Math.random() < 0.35) {
    const normX = width > 0 ? (px / width) * 2 - 1 : 0;
    playBinauralClick(247.94, 0.18, normX, 'hover');
  }
}

function updateAndDrawMenuPops() {
  const c = ctx;
  if (!c) return;

  const now = performance.now();
  if (menuPops.length < 3 && now - lastAutoPopTime > 1800 + Math.random() * 2200) {
    lastAutoPopTime = now;
    spawnMenuPop();
  }

  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.globalCompositeOperation = 'source-over';

  for (let i = menuPops.length - 1; i >= 0; i--) {
    const pop = menuPops[i];
    pop.t += 0.016;
    pop.y += pop.vy;

    const k = pop.t / POP_LIFE;
    if (k >= 1) {
      menuPops.splice(i, 1);
      continue;
    }

    c.save();
    c.translate(pop.x, pop.y);
    const alpha = Math.max(0, 1 - k * k);
    c.globalAlpha = alpha;

    const fontSize = 17 + 8 * (1 - k);
    c.font = uiFont(800, fontSize.toFixed(1));
    const color = P_COLOR[pop.who] || hex(MENU_CYAN);

    c.shadowColor = color;
    c.shadowBlur = 12;
    c.fillStyle = color;
    c.fillText(pop.text, 0, -k * 30);

    c.fillStyle = WHITE_HEX;
    c.shadowBlur = 4;
    c.fillText(pop.text, 0, -k * 30);

    c.restore();
  }

  c.restore();
}

const noteSymbols = ['♪', '♫', '♬', '♩', '𝄢'];
const noteColors = [
  { main: hex(MENU_CYAN), glow: rgba(MENU_CYAN, 0.95) },
  { main: hex(MENU_PINK), glow: rgba(MENU_PINK, 0.95) },
  { main: '#00e5ff', glow: 'rgba(0, 229, 255, 0.90)' },
  { main: '#e879f9', glow: 'rgba(232, 121, 249, 0.90)' },
  { main: '#c084fc', glow: 'rgba(192, 132, 252, 0.90)' }
];

interface SoundNote {
  symbol: string;
  color: string;
  glow: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  opacity: number;
  maxOpacity: number;
  life: number;
  maxLife: number;
  pulseSpeed: number;
  pulseOffset: number;
}

const notes: SoundNote[] = [];
const MAX_NOTES = 7;

function createSoundNote(centerX: number, centerY: number, boundsW: number, boundsH: number): SoundNote {
  const sym = noteSymbols[Math.floor(Math.random() * noteSymbols.length)];
  const colorObj = noteColors[Math.floor(Math.random() * noteColors.length)];
  const spawnAngle = Math.random() * TAU;
  const spreadX = (boundsW * 0.52) * (0.4 + Math.random() * 0.65);
  const spreadY = (boundsH * 0.58) * (0.4 + Math.random() * 0.65);

  return {
    symbol: sym,
    color: colorObj.main,
    glow: colorObj.glow,
    x: centerX + Math.cos(spawnAngle) * spreadX,
    y: centerY + Math.sin(spawnAngle) * spreadY,
    vx: (Math.random() - 0.5) * 0.35 + Math.cos(spawnAngle) * 0.12,
    vy: -(Math.random() * 0.40 + 0.25),
    size: Math.floor(Math.random() * 22 + 30),
    rotation: (Math.random() - 0.5) * 0.4,
    rotSpeed: (Math.random() - 0.5) * 0.015,
    opacity: 0,
    maxOpacity: Math.random() * 0.6 + 0.35,
    life: 0,
    maxLife: Math.floor(Math.random() * 140 + 110),
    pulseSpeed: Math.random() * 0.05 + 0.03,
    pulseOffset: Math.random() * TAU
  };
}

function updateAndDrawSoundNotes(centerX: number, centerY: number, boundsW: number, boundsH: number) {
  const c = ctx;
  if (!c) return;
  if (notes.length < MAX_NOTES && Math.random() < 0.04) {
    notes.push(createSoundNote(centerX, centerY, boundsW, boundsH));
  }

  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    n.life++;
    n.x += n.vx;
    n.y += n.vy;
    n.rotation += n.rotSpeed;

    const progress = n.life / n.maxLife;
    if (progress < 0.18) {
      n.opacity = (progress / 0.18) * n.maxOpacity;
    } else if (progress > 0.70) {
      n.opacity = ((1 - progress) / 0.30) * n.maxOpacity;
    } else {
      n.opacity = n.maxOpacity;
    }

    const pulse = 1 + Math.sin(n.life * n.pulseSpeed + n.pulseOffset) * 0.12;
    const currentSize = Math.max(12, n.size * pulse);

    c.save();
    c.translate(n.x, n.y);
    c.rotate(n.rotation);
    c.font = uiFont(700, currentSize);
    c.globalAlpha = Math.max(0, Math.min(1, n.opacity));

    c.shadowColor = n.glow;
    c.shadowBlur = 16;
    c.fillStyle = n.color;
    c.fillText(n.symbol, 0, 0);

    c.fillStyle = WHITE_HEX;
    c.shadowBlur = 4;
    c.fillText(n.symbol, 0, 0);

    c.restore();

    if (n.life >= n.maxLife) {
      notes.splice(i, 1);
    }
  }
  c.restore();
}

function initMenuAudio() {
  initGameAudio();
  if (AudioStore.actx && AudioStore.actx.state === 'suspended') {
    AudioStore.actx.resume();
  }
}

function getAudioCtx(): AudioContext | null {
  initMenuAudio();
  return AudioStore.actx;
}

let activeMenuVoices = 0;
const MAX_MENU_VOICES = 6;
let lastClickTimestamp = 0;
let lastSelectTimestamp = 0;
let lastInteractionTimestamp = 0;

export function resetBinauralAudioStateForTesting() {
  activeMenuVoices = 0;
  lastClickTimestamp = 0;
}

/**
 * Plays a single spatial 3D binaural menu click audio effect with left/right channel frequency separation,
 * sub-harmonic resonance, lowpass smoothing, and interaural Haas spatial delay.
 */
export function playBinauralClick(
  freq: number = 261.63,
  duration: number = 0.16,
  xNorm: number = 0,
  clickType: 'select' | 'hover' | 'toggle' = 'select',
  volBoost: number = 1.0,
  ignoreOptionsGuard: boolean = false
) {
  if (!AudioStore.soundOn) return;
  if (!ignoreOptionsGuard && isOptionsOpen()) return;
  const nowMs = performance.now();
  const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  if (!isTest && nowMs - lastClickTimestamp < 180) return; // Strict 180ms global audio lock
  if (activeMenuVoices >= MAX_MENU_VOICES) return;
  lastClickTimestamp = nowMs;
  if (clickType === 'select') {
    lastSelectTimestamp = nowMs;
  }

  try {
    const actx = getAudioCtx();
    if (!actx) return;

    const now = actx.currentTime;
    const dest = AudioStore.master || actx.destination;

    let targetFreq = freq;
    if (clickType === 'select') {
      targetFreq = Math.min(freq, 293.66);
    } else if (clickType === 'hover') {
      targetFreq = Math.min(freq, 261.63);
    }

    const baseVol = (clickType === 'hover' ? 0.06 : clickType === 'toggle' ? 0.22 : 0.30) * volBoost;

    const leftPanVal = Math.max(-1, Math.min(1, -0.85 + xNorm * 0.25));
    const rightPanVal = Math.max(-1, Math.min(1, 0.85 + xNorm * 0.25));

    const nodesToClean: (AudioNode | OscillatorNode)[] = [];

    // Create lowpass filter node to eliminate any high-frequency harshness
    const lpFilter = actx.createBiquadFilter();
    nodesToClean.push(lpFilter);
    lpFilter.type = 'lowpass';
    const lpFreq = clickType === 'hover' ? 650 : 800;
    lpFilter.frequency.value = lpFreq;
    lpFilter.frequency.setValueAtTime(lpFreq, now);
    lpFilter.Q.setValueAtTime(0.5, now);
    lpFilter.connect(dest);

    const pTime = now + 0.025; // 25ms lookahead to prevent JS rendering quantum lag crackling
    const dur = Math.max(0.08, duration);
    const stopTime = pTime + dur + 0.04;

    // Sub-harmonic sine wave node (adds warm bass body)
    const subOsc = actx.createOscillator();
    const subGain = actx.createGain();
    nodesToClean.push(subOsc, subGain);
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(targetFreq * 0.5, pTime);
    subGain.gain.value = 0.0001;
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.setValueAtTime(0.0001, pTime);
    subGain.gain.linearRampToValueAtTime(baseVol * 0.35, pTime + 0.015);
    subGain.gain.linearRampToValueAtTime(0, pTime + dur);
    subOsc.connect(subGain);
    subGain.connect(lpFilter);
    subOsc.start(pTime);
    subOsc.stop(stopTime);

    // Left Channel Oscillator (f - 2.5 Hz)
    const leftOsc = actx.createOscillator();
    const leftGain = actx.createGain();
    nodesToClean.push(leftOsc, leftGain);
    const leftFreq = targetFreq - BEAT / 2;

    leftOsc.type = 'sine';
    leftOsc.frequency.setValueAtTime(leftFreq, pTime);

    leftGain.gain.value = 0.0001;
    leftGain.gain.setValueAtTime(0.0001, now);
    leftGain.gain.setValueAtTime(0.0001, pTime);
    leftGain.gain.linearRampToValueAtTime(baseVol, pTime + 0.015);
    leftGain.gain.linearRampToValueAtTime(0, pTime + dur);

    if (actx.createStereoPanner) {
      const panL = actx.createStereoPanner();
      nodesToClean.push(panL);
      panL.pan.setValueAtTime(leftPanVal, pTime);
      leftOsc.connect(leftGain);
      leftGain.connect(panL);
      panL.connect(lpFilter);
    } else {
      leftOsc.connect(leftGain);
      leftGain.connect(lpFilter);
    }

    leftOsc.start(pTime);
    leftOsc.stop(stopTime);

    // Right Channel Oscillator (f + 2.5 Hz)
    const rightOsc = actx.createOscillator();
    const rightGain = actx.createGain();
    nodesToClean.push(rightOsc, rightGain);
    const rightFreq = targetFreq + BEAT / 2;

    rightOsc.type = 'sine';
    rightOsc.frequency.setValueAtTime(rightFreq, pTime);

    rightGain.gain.value = 0.0001;
    rightGain.gain.setValueAtTime(0.0001, now);
    rightGain.gain.setValueAtTime(0.0001, pTime);
    rightGain.gain.linearRampToValueAtTime(baseVol * 0.95, pTime + 0.015);
    rightGain.gain.linearRampToValueAtTime(0, pTime + dur);

    if (actx.createStereoPanner) {
      const panR = actx.createStereoPanner();
      nodesToClean.push(panR);
      panR.pan.setValueAtTime(rightPanVal, pTime);
      rightOsc.connect(rightGain);
      rightGain.connect(panR);
      panR.connect(lpFilter);
    } else {
      rightOsc.connect(rightGain);
      rightGain.connect(lpFilter);
    }

    activeMenuVoices++;
    rightOsc.onended = () => {
      activeMenuVoices = Math.max(0, activeMenuVoices - 1);
      for (const n of nodesToClean) {
        try { n.disconnect(); } catch (e) {}
      }
      nodesToClean.length = 0;
    };

    rightOsc.start(pTime);
    rightOsc.stop(stopTime);
  } catch (e) {
    activeMenuVoices = Math.max(0, activeMenuVoices - 1);
  }
}

function updateAudioBtnLabel() {
  if (audioBtn) {
    audioBtn.textContent = AudioStore.soundOn ? 'Audio on' : 'Audio off';
  }
}

function updateFsBtnLabel() {
  if (fsBtn) {
    const docEl = typeof document !== 'undefined' ? (document.documentElement as any) : null;
    const fsRequest = docEl ? (docEl.requestFullscreen || docEl.webkitRequestFullscreen || null) : null;
    if (!fsRequest) {
      setHidden(fsBtn, true);
      return;
    }
    const isFs = typeof document !== 'undefined' && !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    fsBtn.textContent = isFs ? 'Exit full screen' : 'Full screen';
  }
}

function resize() {
  if (!applyCanvasSize()) return;
  initMotes();
  initMenuBalls();
}

/**
 * Re-apply the canvas size and DPR transform after Chrome restores a lost 2D
 * context (see recoverGraphics in main.ts). The size is unchanged, so this must
 * not go through resize(), which would also respawn the menu balls.
 */
function recoverCanvas() {
  clearSpriteCache();
  applyCanvasSize();
}

function applyCanvasSize(): boolean {
  if (!canvas || !ctx) return false;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const newW = window.innerWidth;
  const newH = window.innerHeight;
  const targetCanvasW = Math.floor(newW * dpr);
  const targetCanvasH = Math.floor(newH * dpr);

  width = newW;
  height = newH;

  if (canvas.width !== targetCanvasW || canvas.height !== targetCanvasH) {
    canvas.width = targetCanvasW;
    canvas.height = targetCanvasH;
  }

  if (ctx.resetTransform) ctx.resetTransform();
  else ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return true;
}

export interface ButtonRect {
  index: number;
  text: string;
  action: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface MenuLayout {
  logoCenterY: number;
  effectiveFontSize: number;
  ballRadius: number;
  logoBottom: number;
  buttons: ButtonRect[];
}

export function computeMenuLayout(w: number, h: number, c: CanvasRenderingContext2D | null): MenuLayout {
  const isCompactHeight = h < 650;
  const logoBudget = isCompactHeight ? 0.96 : 1.22;
  const minSafeTop = isCompactHeight ? 70 : 100;
  const logoCenterY = Math.max(minSafeTop, Math.floor(h * (isCompactHeight ? 0.165 : 0.195)));

  const maxAllowedWidth = w * 0.92;
  const targetFontSize = Math.max(36, Math.min(130, Math.floor(w * 0.12 * logoBudget)));

  let effectiveFontSize = targetFontSize;
  let ballRadius = Math.max(12, Math.floor(targetFontSize * 0.39));

  if (c) {
    c.save();
    c.font = logoFont(targetFontSize);
    const tWidth = c.measureText('T').width;
    const neWidth = c.measureText('NE').width;
    const bWidth = c.measureText('B').width;
    const mWidth = c.measureText('M').width;
    c.restore();

    const speakerRadius = ballRadius;
    const letterSpacing = targetFontSize * 0.06;
    const word1Width = tWidth + letterSpacing + (speakerRadius * 2) + letterSpacing + neWidth;
    const ballSpacing = ballRadius * 2.12;
    const word2Width = bWidth + letterSpacing + ballRadius + ballSpacing + ballRadius + letterSpacing + mWidth;
    const wordGap = targetFontSize * 0.40;
    const totalLogoWidth = word1Width + wordGap + word2Width;

    if (totalLogoWidth > maxAllowedWidth) {
      const ratio = maxAllowedWidth / totalLogoWidth;
      effectiveFontSize = Math.max(26, Math.floor(targetFontSize * ratio));
      ballRadius = Math.max(10, Math.floor(effectiveFontSize * 0.39));
    }
  }

  const logoBottom = logoCenterY + ballRadius + 14;

  const numItems = menuItems.length;
  const availableHeight = Math.max(180, h - logoBottom);
  const rawItemH = Math.floor((availableHeight / (numItems + 1.2)));
  const itemH = Math.max(38, Math.min(50, rawItemH - 6));
  const itemGap = Math.max(10, Math.min(18, Math.floor((availableHeight - itemH * numItems) / (numItems + 1))));
  const totalMenuHeight = numItems * itemH + (numItems - 1) * itemGap;
  const itemSpacing = itemH + itemGap;

  // Position menu block higher up below logo (menu up a bit)
  const spaceBelowLogo = Math.max(0, h - logoBottom - totalMenuHeight);
  const centeredStartY = Math.floor(logoBottom + spaceBelowLogo * 0.32);
  const btnWidth = Math.min(w * 0.84, Math.max(260, Math.min(390, w * 0.38)));
  const fontSize = Math.max(14, Math.min(17, Math.floor(itemH * 0.38)));

  const buttons: ButtonRect[] = menuItems.map((item, index) => {
    const btnX = w / 2 - btnWidth / 2;
    const btnY = centeredStartY + index * itemSpacing;
    return {
      index,
      text: item.text,
      action: item.action,
      x: btnX,
      y: btnY,
      width: btnWidth,
      height: itemH,
      fontSize
    };
  });

  return {
    logoCenterY,
    effectiveFontSize,
    ballRadius,
    logoBottom,
    buttons
  };
}

function getButtonIndexAt(px: number, py: number): number {
  const layout = computeMenuLayout(width, height, ctx);
  for (const btn of layout.buttons) {
    if (px >= btn.x && px <= btn.x + btn.width && py >= btn.y && py <= btn.y + btn.height) {
      return btn.index;
    }
  }
  return -1;
}

function getCanvasPointer(e: { clientX: number; clientY: number }): { x: number; y: number } {
  if (!canvas) return { x: -1000, y: -1000 };
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? width / rect.width : 1;
  const scaleY = rect.height > 0 ? height / rect.height : 1;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function handleInteraction(px?: number, py?: number) {
  const nowMs = performance.now();
  if (nowMs - lastInteractionTimestamp < 180) return;

  let targetIndex = activeHoverIndex;
  if (px !== undefined && py !== undefined) {
    targetIndex = getButtonIndexAt(px, py);
  }
  if (targetIndex !== -1) {
    lastInteractionTimestamp = nowMs;
    clickedItemIndex = targetIndex;
    const normX = width > 0 ? (px !== undefined ? (px / width) * 2 - 1 : 0) : 0;
    playBinauralClick(293.66, 0.16, normX, 'select');

    const selectedItem = menuItems[targetIndex];
    if (selectedItem) {
      if (selectedItem.action === 'solo') {
        setTimeout(() => triggerSelection('solo'), 120);
      } else if (selectedItem.action === 'one_player') {
        setTimeout(() => triggerSelection('ai'), 120);
      } else if (selectedItem.action === 'two_player') {
        setTimeout(() => triggerSelection('duel'), 120);
      } else if (selectedItem.action === 'options') {
        setTimeout(() => {
          clickedItemIndex = -1;
          if (onOptionsCallback) onOptionsCallback();
        }, 120);
      }
    }
  }
}

let isTransitioning = false;

function triggerSelection(mode: PlayMode) {
  if (isTransitioning) return;
  isTransitioning = true;

  if (onModeSelectCallback) {
    onModeSelectCallback(mode);
  }

  if (!menuContainer) {
    menuContainer = document.getElementById('menu-screen');
  }

  if (menuContainer && typeof window !== 'undefined') {
    menuContainer.classList.add('slide-out');
    setTimeout(() => {
      hideMenuImmediate();
      if (menuContainer) menuContainer.classList.remove('slide-out');
      isTransitioning = false;
    }, 550);
  } else {
    hideMenuImmediate();
    isTransitioning = false;
  }
}

function hideMenuImmediate() {
  clickedItemIndex = -1;
  if (!menuContainer) {
    menuContainer = document.getElementById('menu-screen');
  }
  if (menuContainer) {
    setHidden(menuContainer, true);
  }
  menuActive = false;
  if (animationId) {
    safeCancelAnimationFrame(animationId);
    animationId = 0;
  }
}

export function slideOutRight(onComplete?: () => void) {
  if (!menuContainer) {
    menuContainer = document.getElementById('menu-screen');
  }
  if (menuContainer && typeof window !== 'undefined') {
    menuContainer.classList.add('slide-out-right');
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 550);
  } else if (onComplete) {
    onComplete();
  }
}

export function slideInFromRight() {
  if (!menuContainer) {
    menuContainer = document.getElementById('menu-screen');
  }
  if (menuContainer && typeof window !== 'undefined') {
    menuContainer.classList.remove('slide-out-right');
  }
}

export function showMenu() {
  if (!menuContainer) {
    menuContainer = document.getElementById('menu-screen');
  }
  if (menuContainer) {
    if (typeof window !== 'undefined') {
      menuContainer.classList.remove('slide-out', 'slide-out-right');
      menuContainer.classList.add('slide-in-start');
      setHidden(menuContainer, false);
      void menuContainer.offsetWidth;
      menuContainer.classList.remove('slide-in-start');
    } else {
      setHidden(menuContainer, false);
    }
  }
  menuActive = true;
  // The in-game bar toggles the same AudioStore flag, so the label may have gone
  // stale while the menu was down.
  updateAudioBtnLabel();
  updateFsBtnLabel();
  resize();
  if (!animationId) {
    animationId = safeRequestAnimationFrame(renderLoop);
  }
}

export function hideMenu() {
  hideMenuImmediate();
}

export function isMenuVisible(): boolean {
  return menuActive;
}

/**
 * True while the menu is an opaque full-screen cover, so nothing drawn behind it
 * can be seen. Goes false as soon as a selection starts the slide-out, which is
 * when the game underneath becomes visible again and has to be live.
 */
export function isMenuOccluding(): boolean {
  return menuActive && !isTransitioning;
}

function drawEtherealBackground(t: number) {
  const c = ctx;
  if (!c) return;

  c.save();
  c.shadowBlur = 0;
  c.shadowColor = 'transparent';
  c.globalAlpha = 1.0;
  c.globalCompositeOperation = 'source-over';

  const bgGrad = c.createRadialGradient(
    width * 0.5, height * 0.35, width * 0.08,
    width * 0.5, height * 0.5, Math.max(width, height) * 0.98
  );
  bgGrad.addColorStop(0.00, '#1c0836');
  bgGrad.addColorStop(0.38, '#0f0520');
  bgGrad.addColorStop(0.72, '#070212');
  bgGrad.addColorStop(1.00, '#020106');
  c.fillStyle = bgGrad;
  c.fillRect(0, 0, width, height);

  // Dynamic Liquid Plasma Currents (as in game VisualFX)
  c.save();
  c.globalCompositeOperation = 'lighter';
  const liquidT = t * 0.010;
  for (const cur of CURRENTS) {
    const cx = width * (0.5 + cur.ax * Math.sin(liquidT * cur.sx + cur.ph));
    const cy = height * (0.5 + cur.ay * Math.cos(liquidT * cur.sy + cur.ph * 1.7));
    const cr = height * cur.r;
    c.globalAlpha = 0.38;
    c.drawImage(glowSprite(cur.c), cx - cr, cy - cr, cr * 2, cr * 2);
  }
  c.restore();

  c.save();
  c.globalCompositeOperation = 'screen';

  spotlights.forEach((spot, idx) => {
    const pulse = Math.sin(t * spot.pulseSpeed + spot.pulseOffset) * 0.10;
    const currentIntensity = spot.intensity + pulse;
    const originX = width * spot.baseX + Math.sin(t * 0.005 + idx * 1.5) * (width * 0.035);
    const originY = height * spot.baseY;

    const coneHeight = height * 1.45;
    const targetX = width * spot.baseX + Math.tan(spot.angle) * coneHeight;
    const halfSpread = (coneHeight * spot.spread) * 0.65;

    c.beginPath();
    c.moveTo(originX, originY);
    c.lineTo(targetX - halfSpread, height);
    c.lineTo(targetX + halfSpread, height);
    c.closePath();

    const coneGrad = c.createLinearGradient(originX, originY, targetX, height);
    coneGrad.addColorStop(0.00, spot.color + (currentIntensity * 1.6) + ')');
    coneGrad.addColorStop(0.30, spot.color + (currentIntensity * 0.90) + ')');
    coneGrad.addColorStop(0.70, spot.color + (currentIntensity * 0.40) + ')');
    coneGrad.addColorStop(1.00, spot.color + (currentIntensity * 0.10) + ')');

    c.fillStyle = coneGrad;
    c.fill();
  });

  c.restore();

  c.save();
  c.fillStyle = WHITE_HEX;
  motes.forEach(m => {
    m.y += m.speedY;
    m.x += m.speedX + Math.sin(t * 0.01 + m.pulse) * 0.22;
    if (m.y < -10) m.y = height + 10;
    if (m.x < -10) m.x = width + 10;
    if (m.x > width + 10) m.x = -10;

    const flicker = Math.sin(t * 0.03 + m.pulse) * 0.25 + 0.75;
    c.globalAlpha = m.alpha * flicker * 0.65;
    c.beginPath();
    c.arc(m.x, m.y, m.radius, 0, TAU);
    c.fill();
  });
  c.restore();

  c.restore();
}

function drawSpeakerO(cx: number, cy: number, radius: number, t: number) {
  const c = ctx;
  if (!c) return;
  c.save();

  c.beginPath();
  c.ellipse(cx, cy + radius * 0.94, radius * 0.85, radius * 0.26, 0, 0, TAU);
  c.fillStyle = 'rgba(2, 1, 8, 0.9)';
  if (c.filter) c.filter = 'blur(5px)';
  c.fill();
  if (c.filter) c.filter = 'none';

  const pulse = Math.sin(t * 0.12) * (radius * 0.05);

  const frameGrad = c.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
  frameGrad.addColorStop(0.0, '#1a103c');
  frameGrad.addColorStop(0.7, '#0d0722');
  frameGrad.addColorStop(1.0, hex(MENU_CYAN));

  c.beginPath();
  c.arc(cx, cy, radius, 0, TAU);
  c.fillStyle = frameGrad;
  c.fill();

  c.strokeStyle = 'rgba(0, 247, 255, 0.85)';
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

  c.strokeStyle = 'rgba(0, 247, 255, 0.28)';
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
  c.fillStyle = 'rgba(255, 255, 255, 0.85)';
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

function drawWhiteBilliardBall(cx: number, cy: number, radius: number) {
  const c = ctx;
  if (!c) return;
  c.save();

  c.beginPath();
  c.ellipse(cx, cy + radius * 0.94, radius * 0.85, radius * 0.26, 0, 0, TAU);
  c.fillStyle = 'rgba(2, 1, 8, 0.9)';
  if (c.filter) c.filter = 'blur(5px)';
  c.fill();
  if (c.filter) c.filter = 'none';

  const lx = cx - radius * 0.32;
  const ly = cy - radius * 0.35;

  const bodyGrad = c.createRadialGradient(
    lx, ly, radius * 0.08,
    cx + radius * 0.25, cy + radius * 0.30, radius * 1.15
  );

  bodyGrad.addColorStop(0.00, WHITE_HEX);
  bodyGrad.addColorStop(0.20, '#e2e8f0');
  bodyGrad.addColorStop(0.40, '#94a3b8');
  bodyGrad.addColorStop(0.68, '#475569');
  bodyGrad.addColorStop(0.88, '#1e293b');
  bodyGrad.addColorStop(1.00, '#0f172a');

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
  rimGrad.addColorStop(0.92, 'rgba(0, 247, 255, 0.45)');
  rimGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0.6)');
  c.fillStyle = rimGrad;
  c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  c.save();
  c.translate(lx, ly);
  c.rotate(-Math.PI / 4.2);

  const boxGrad = c.createLinearGradient(0, -radius * 0.08, 0, radius * 0.08);
  boxGrad.addColorStop(0.0, WHITE_HEX);
  boxGrad.addColorStop(0.5, WHITE_HEX);
  boxGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.90)');
  c.fillStyle = boxGrad;
  c.beginPath();
  if (c.roundRect) {
    c.roundRect(-radius * 0.22, -radius * 0.07, radius * 0.44, radius * 0.14, radius * 0.05);
  } else {
    c.rect(-radius * 0.22, -radius * 0.07, radius * 0.44, radius * 0.14);
  }
  c.shadowColor = hex(MENU_CYAN);
  c.shadowBlur = 8;
  c.fill();

  c.beginPath();
  c.arc(-radius * 0.08, -radius * 0.02, radius * 0.038, 0, TAU);
  c.fillStyle = WHITE_HEX;
  c.shadowColor = hex(MENU_CYAN);
  c.shadowBlur = 10;
  c.fill();

  c.restore();

  c.beginPath();
  c.arc(cx - radius * 0.04, cy - radius * 0.04, radius * 0.82, -Math.PI * 0.85, -Math.PI * 0.35);
  c.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  c.lineWidth = Math.max(1.8, radius * 0.055);
  c.stroke();

  c.restore();

  c.beginPath();
  c.arc(cx, cy, radius, 0, TAU);
  c.strokeStyle = 'rgba(0, 247, 255, 0.9)';
  c.lineWidth = Math.max(3.5, radius * 0.09);
  c.shadowColor = hex(MENU_CYAN);
  c.shadowBlur = 10;
  c.stroke();
  c.shadowBlur = 0;

  c.restore();
}

function drawBlackBilliardBall(cx: number, cy: number, radius: number) {
  const c = ctx;
  if (!c) return;
  c.save();

  c.beginPath();
  c.ellipse(cx, cy + radius * 0.94, radius * 0.85, radius * 0.26, 0, 0, TAU);
  c.fillStyle = 'rgba(2, 1, 8, 0.95)';
  if (c.filter) c.filter = 'blur(5px)';
  c.fill();
  if (c.filter) c.filter = 'none';

  const lx = cx - radius * 0.32;
  const ly = cy - radius * 0.35;

  const bodyGrad = c.createRadialGradient(
    lx, ly, radius * 0.05,
    cx + radius * 0.18, cy + radius * 0.22, radius * 1.05
  );

  bodyGrad.addColorStop(0.00, '#484c60');
  bodyGrad.addColorStop(0.18, '#1e202c');
  bodyGrad.addColorStop(0.45, '#050609');
  bodyGrad.addColorStop(1.00, BLACK_HEX);

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
  rimGrad.addColorStop(0.92, 'rgba(255, 0, 127, 0.25)');
  rimGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0.15)');
  c.fillStyle = rimGrad;
  c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  c.save();
  c.translate(lx, ly);
  c.rotate(-Math.PI / 4.2);

  const boxGrad = c.createLinearGradient(0, -radius * 0.08, 0, radius * 0.08);
  boxGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.90)');
  boxGrad.addColorStop(0.5, WHITE_HEX);
  boxGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.50)');
  c.fillStyle = boxGrad;
  c.beginPath();
  if (c.roundRect) {
    c.roundRect(-radius * 0.22, -radius * 0.07, radius * 0.44, radius * 0.14, radius * 0.05);
  } else {
    c.rect(-radius * 0.22, -radius * 0.07, radius * 0.44, radius * 0.14);
  }
  c.shadowColor = hex(MENU_PINK_DEEP);
  c.shadowBlur = 8;
  c.fill();

  c.beginPath();
  c.arc(-radius * 0.08, -radius * 0.02, radius * 0.038, 0, TAU);
  c.fillStyle = WHITE_HEX;
  c.shadowColor = hex(MENU_PINK_DEEP);
  c.shadowBlur = 10;
  c.fill();

  c.restore();

  c.beginPath();
  c.arc(cx - radius * 0.04, cy - radius * 0.04, radius * 0.82, -Math.PI * 0.85, -Math.PI * 0.35);
  c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  c.lineWidth = Math.max(1.2, radius * 0.045);
  c.stroke();

  c.restore();

  c.beginPath();
  c.arc(cx, cy, radius, 0, TAU);
  c.strokeStyle = 'rgba(255, 0, 127, 0.9)';
  c.lineWidth = Math.max(3.5, radius * 0.09);
  c.shadowColor = hex(MENU_PINK_DEEP);
  c.shadowBlur = 10;
  c.stroke();
  c.shadowBlur = 0;

  c.restore();
}

function drawImpactBoom(cx: number, cy: number, radius: number, t: number) {
  const c = ctx;
  if (!c) return;
  c.save();

  const energyPulse = 0.85 + Math.sin(t * 0.2) * 0.15;
  const boomR = radius * 0.70 * energyPulse;

  const flashGrad = c.createRadialGradient(cx, cy, 0, cx, cy, boomR);
  flashGrad.addColorStop(0.00, WHITE_HEX);
  flashGrad.addColorStop(0.30, '#ffff55');
  flashGrad.addColorStop(0.65, hex(MENU_PINK));
  flashGrad.addColorStop(1.00, 'rgba(0, 247, 255, 0)');

  c.beginPath();
  c.arc(cx, cy, boomR, 0, TAU);
  c.fillStyle = flashGrad;
  c.shadowColor = hex(MENU_PINK);
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
    rayGrad.addColorStop(0.4, (i % 2 === 0 ? hex(MENU_CYAN) : hex(MENU_PINK)));
    rayGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');

    c.strokeStyle = rayGrad;
    c.lineWidth = (i % 2 === 0 ? 2.2 : 1.2) * energyPulse;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  c.restore();
}

function drawPhysicalSplitLettering(text: string, x: number, y: number, fontSize: number) {
  const c = ctx;
  if (!c) return;
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
  splitGrad.addColorStop(0.55, hex(MENU_PINK));
  splitGrad.addColorStop(0.75, hex(MENU_PINK_DEEP));
  splitGrad.addColorStop(0.92, '#b30059');
  splitGrad.addColorStop(1.00, '#420021');

  c.fillStyle = splitGrad;
  c.fillText(text, x, y);

  c.restore();
}

function drawLogo(layout: MenuLayout): number {
  const c = ctx;
  if (!c) return layout.logoCenterY;

  c.save();
  c.font = logoFont(layout.effectiveFontSize);

  let tMetrics = c.measureText('T');
  let neMetrics = c.measureText('NE');
  let bMetrics = c.measureText('B');
  let mMetrics = c.measureText('M');

  let ballRadius = layout.ballRadius;
  let speakerRadius = ballRadius;
  let letterSpacing = layout.effectiveFontSize * 0.06;

  let word1Width = tMetrics.width + letterSpacing + (speakerRadius * 2) + letterSpacing + neMetrics.width;
  let ballSpacing = ballRadius * 2.12;
  let word2Width = bMetrics.width + letterSpacing + ballRadius + ballSpacing + ballRadius + letterSpacing + mMetrics.width;

  let wordGap = layout.effectiveFontSize * 0.40;
  let totalLogoWidth = word1Width + wordGap + word2Width;

  const startX = (width - totalLogoWidth) / 2;
  const baselineY = layout.logoCenterY;
  const elementY = baselineY - (layout.effectiveFontSize * 0.04);

  const logoBoundsH = ballRadius * 3.5;
  updateAndDrawSoundNotes(width / 2, baselineY, totalLogoWidth, logoBoundsH);

  const word1X = startX;
  drawPhysicalSplitLettering('T', word1X, baselineY, layout.effectiveFontSize);
  const speakerX = word1X + tMetrics.width + letterSpacing + speakerRadius;
  drawSpeakerO(speakerX, elementY, speakerRadius, animFrame);
  const neX = speakerX + speakerRadius + letterSpacing;
  drawPhysicalSplitLettering('NE', neX, baselineY, layout.effectiveFontSize);

  const word2X = word1X + word1Width + wordGap;
  drawPhysicalSplitLettering('B', word2X, baselineY, layout.effectiveFontSize);

  const whiteBallX = word2X + bMetrics.width + letterSpacing + ballRadius;
  const blackBallX = whiteBallX + ballSpacing;
  const impactX = (whiteBallX + blackBallX) / 2;

  drawWhiteBilliardBall(whiteBallX, elementY, ballRadius);
  drawBlackBilliardBall(blackBallX, elementY, ballRadius);
  drawImpactBoom(impactX, elementY, ballRadius, animFrame);

  const mX = blackBallX + ballRadius + letterSpacing;
  drawPhysicalSplitLettering('M', mX, baselineY, layout.effectiveFontSize);

  c.restore();

  return layout.logoBottom;
}

function drawMenu(layout: MenuLayout) {
  const c = ctx;
  if (!c || !canvas) return;

  let prevHoverIndex = activeHoverIndex;
  let currentHoverIndex = getButtonIndexAt(pointer.x, pointer.y);

  layout.buttons.forEach((btn) => {
    const isHovered = (currentHoverIndex === btn.index);
    const isClicked = (clickedItemIndex === btn.index);

    c.save();
    c.shadowBlur = 0;
    c.shadowColor = 'transparent';
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(btn.x, btn.y, btn.width, btn.height, 10);
    } else {
      c.rect(btn.x, btn.y, btn.width, btn.height);
    }

    // A press once flipped the fill to its own gradient, whose stops at 0.48 and
    // 0.52 put a hard cyan/pink seam across the middle of the button — and it is
    // held for the whole 550ms slide-out, so that seam was the last thing seen of
    // the menu. The highlight gradient spreads the same palette over 0.25-0.70,
    // so press and highlight now share it.
    if (isHovered || isClicked) {
      const activeGrad = c.createLinearGradient(btn.x, btn.y, btn.x + btn.width, btn.y + btn.height);
      activeGrad.addColorStop(0.00, 'rgba(0, 247, 255, 0.45)');
      activeGrad.addColorStop(0.25, 'rgba(0, 180, 240, 0.55)');
      activeGrad.addColorStop(0.70, 'rgba(190, 0, 140, 0.62)');
      activeGrad.addColorStop(1.00, 'rgba(255, 0, 127, 0.52)');
      c.fillStyle = activeGrad;

      c.shadowColor = 'rgba(255, 0, 127, 0.85)';
      c.shadowBlur = 14;
      c.fill();

      const borderGrad = c.createLinearGradient(btn.x, btn.y, btn.x + btn.width, btn.y);
      borderGrad.addColorStop(0.00, hex(MENU_CYAN));
      borderGrad.addColorStop(0.45, '#00e1ff');
      borderGrad.addColorStop(0.55, hex(MENU_PINK));
      borderGrad.addColorStop(1.00, hex(MENU_PINK_DEEP));
      c.strokeStyle = borderGrad;
      c.lineWidth = 2.4;
      c.shadowColor = rgba(MENU_CYAN, 0.95);
      c.shadowBlur = 10;
      c.stroke();

      c.beginPath();
      c.moveTo(btn.x + 18, btn.y + 1.5);
      c.lineTo(btn.x + btn.width - 18, btn.y + 1.5);
      const sheenGrad = c.createLinearGradient(btn.x, 0, btn.x + btn.width, 0);
      sheenGrad.addColorStop(0.0, 'rgba(0, 247, 255, 0.9)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
      sheenGrad.addColorStop(1.0, 'rgba(255, 0, 127, 0.9)');
      c.strokeStyle = sheenGrad;
      c.lineWidth = 1.6;
      c.stroke();
      c.shadowBlur = 0;
    } else {
      // Kept dark enough for the label to hold contrast over a bright ball
      // drifting behind it, but light enough that the drifting balls read
      // through the button instead of stopping at its edge.
      const idleGrad = c.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.height);
      idleGrad.addColorStop(0.0, 'rgba(22, 10, 42, 0.40)');
      idleGrad.addColorStop(1.0, 'rgba(9, 4, 18, 0.52)');
      c.fillStyle = idleGrad;

      const idleBorderGrad = c.createLinearGradient(btn.x, 0, btn.x + btn.width, 0);
      idleBorderGrad.addColorStop(0.0, 'rgba(0, 247, 255, 0.35)');
      idleBorderGrad.addColorStop(1.0, 'rgba(255, 0, 127, 0.35)');
      c.strokeStyle = idleBorderGrad;
      c.lineWidth = 1.2;
      c.shadowColor = 'rgba(0, 0, 0, 0.6)';
      c.shadowBlur = 6;
      c.fill();
      c.stroke();
      c.shadowBlur = 0;
    }

    c.font = uiFont(800, btn.fontSize);
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    if (isHovered || isClicked) {
      c.fillStyle = WHITE_HEX;
      c.shadowColor = hex(MENU_CYAN);
      c.shadowBlur = 10;
      c.fillText(btn.text, width / 2, btn.y + btn.height / 2);
      c.shadowBlur = 0;
    } else {
      c.fillStyle = '#f0e6ff';
      c.shadowColor = 'rgba(0, 247, 255, 0.25)';
      c.shadowBlur = 4;
      c.fillText(btn.text, width / 2, btn.y + btn.height / 2);
      c.shadowBlur = 0;
    }

    c.restore();
  });

  if (currentHoverIndex !== -1 && currentHoverIndex !== prevHoverIndex) {
    const now = performance.now();
    if (now - lastSelectTimestamp > 350 && now - lastInteractionTimestamp > 350) {
      const normX = width > 0 ? (pointer.x / width) * 2 - 1 : 0;
      playBinauralClick(220 + currentHoverIndex * 30, 0.10, normX, 'hover');
    }
  }
  activeHoverIndex = currentHoverIndex;

  canvas.style.cursor = (activeHoverIndex !== -1) ? 'pointer' : 'default';
}

function safeRequestAnimationFrame(cb: FrameRequestCallback): number {
  if (typeof requestAnimationFrame !== 'undefined') {
    return requestAnimationFrame(cb);
  }
  return setTimeout(cb, 16) as unknown as number;
}

function safeCancelAnimationFrame(id: number) {
  if (typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

function renderLoop() {
  if (!menuActive) return;
  if (isOptionsOpen()) {
    animationId = safeRequestAnimationFrame(renderLoop);
    return;
  }
  animFrame++;

  drawEtherealBackground(animFrame);
  updateAndDrawMenuBalls();
  updateAndDrawMenuFlashes();
  updateAndDrawMenuPops();

  const layout = computeMenuLayout(width, height, ctx);
  drawLogo(layout);
  drawMenu(layout);

  animationId = safeRequestAnimationFrame(renderLoop);
}

export function initMenuScreen(onSelectMode: (mode: PlayMode) => void, onOptions?: () => void) {
  onModeSelectCallback = onSelectMode;
  onOptionsCallback = onOptions || null;
  menuContainer = document.getElementById('menu-screen');
  canvas = document.getElementById('gameMenu') as HTMLCanvasElement;
  audioBtn = document.getElementById('audioToggle') as HTMLButtonElement;
  fsBtn = document.getElementById('fsToggle') as HTMLButtonElement;

  if (!canvas) return;
  ctx = canvas.getContext('2d');

  resize();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
    canvas.addEventListener('contextrestored', recoverCanvas);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) recoverCanvas();
    });

    window.addEventListener('mousemove', (e) => {
      if (!menuActive) return;
      const p = getCanvasPointer(e);
      pointer.x = p.x;
      pointer.y = p.y;
    });

    window.addEventListener('mousedown', (e) => {
      if (!menuActive) return;
      const p = getCanvasPointer(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.isDown = true;
      initMenuAudio();
      handleInteraction(p.x, p.y);
    });

    window.addEventListener('mouseup', () => {
      pointer.isDown = false;
    });

    window.addEventListener('touchstart', (e) => {
      if (!menuActive) return;
      if (e.touches.length > 0) {
        const p = getCanvasPointer(e.touches[0]);
        pointer.x = p.x;
        pointer.y = p.y;
        pointer.isDown = true;
        initMenuAudio();
        handleInteraction(p.x, p.y);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      pointer.isDown = false;
    });
  }

  audioBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    AudioStore.soundOn = !AudioStore.soundOn;
    updateAudioBtnLabel();
    // Without this the master gain and the ambient drone keep running when the
    // button says "Audio off" — soundOn alone only gates newly started voices.
    applyGain();
    if (AudioStore.soundOn) {
      playBinauralClick(587.33, 0.20, 0, 'toggle');
    }
  });

  if (fsBtn) {
    const docEl = typeof document !== 'undefined' ? (document.documentElement as any) : null;
    const fsRequest = docEl ? (docEl.requestFullscreen || docEl.webkitRequestFullscreen || null) : null;
    const fsExit = typeof document !== 'undefined' ? (document.exitFullscreen || (document as any).webkitExitFullscreen || null) : null;

    if (!fsRequest) {
      setHidden(fsBtn, true);
    } else {
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
          if (isFs) {
            if (fsExit) fsExit.call(document);
          } else {
            if (fsRequest) fsRequest.call(docEl);
          }
        } catch (err) {}
        if (AudioStore.soundOn) {
          playBinauralClick(587.33, 0.20, 0, 'toggle');
        }
      });
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', () => {
      updateFsBtnLabel();
    });
    document.addEventListener('webkitfullscreenchange', () => {
      updateFsBtnLabel();
    });
  }

  updateAudioBtnLabel();
  updateFsBtnLabel();
}
