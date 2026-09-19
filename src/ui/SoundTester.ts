import { AudioStore, BEAT, initAudio, applyGain } from '../audio/SynthEngine';
import { playNote, playSwoosh, playKnock, playCountdownTick, getBoomProps, getMagnetLockProps, getWhiteBlackBoomVol, boomEchoSpec, playMagneticElectricSound, PAIR_LIFT, PAIR_SUB_LIFT, PAIR_DUR, PAIR_VOL } from '../audio/Voices';
import { playBinauralClick } from '../audio/UiSounds';

export interface SoundDef {
  id: string;
  name: string;
  category: 'Game FX' | 'Boom Levels' | 'Black & White Levels' | 'System & UI';
  situation: string;
  getParamsText: () => string;
  play: () => void;
}


/**
 * The five boom-size tiers the boom voice and the magnet lock both scale on.
 * Each entry's `boomSize` is a representative size inside that tier.
 */
const LEVEL_TIERS: { boomSize: number; label: string }[] = [
  { boomSize: 3, label: 'Level 0-5 (0..4 balls)' },
  { boomSize: 7, label: 'Level 5-10 (5..9 balls)' },
  { boomSize: 12, label: 'Level 10-15 (10..14 balls)' },
  { boomSize: 18, label: 'Level 15-20 (15..19 balls)' },
  { boomSize: 25, label: 'Level 20+ (20+ balls)' },
];

function echoText(boomSize: number, whiteBlack: boolean): string {
  const e = boomEchoSpec(boomSize, whiteBlack);
  return `Echo: ${Math.round(e.left * 1000)}/${Math.round(e.right * 1000)}ms cross-fed, fb ${e.feedback.toFixed(2)}, tail ${e.tail.toFixed(1)}s`;
}

/** White-on-black boom, one card per tier: the lifted, ringing boom. */
const WHITE_BLACK_LEVELS: SoundDef[] = LEVEL_TIERS.map(({ boomSize, label }) => ({
  id: `wb_boom_${boomSize}`,
  name: `White-on-Black Boom — ${label}`,
  category: 'Black & White Levels',
  situation: `A white cue ball reaches a ${boomSize}-ball group holding a black — the only way a black is destroyed`,
  getParamsText: () => {
    const p = getBoomProps(boomSize);
    const tone = p.tone * 1.8;
    const wbVol = getWhiteBlackBoomVol(boomSize);
    const loudest = wbVol >= getWhiteBlackBoomVol(12) ? ' ◀ LOUDEST' : '';
    return `Lifted ×1.8 — Pitch Dive: ${Math.round(tone * 3.4)}Hz → ${Math.round(tone * 0.5)}Hz | + Struck-metal ring (×6, ×9.2) | Dur: ${(p.dur * 0.85).toFixed(2)}s | Level vol: ${wbVol.toFixed(2)}${loudest} | Vol: boomVol (${Math.round(AudioStore.boomVol * 100)}%)\n${echoText(boomSize, true)}`;
  },
  play: () => {
    initAudio();
    playNote(0.5, 0, 'boom', { boost: 1.0, boomSize, ignoreOptionsGuard: true, whiteBlack: true });
  },
}));

/** Black magnet lock, one card per tier, single black and black-on-black. */
const BLACK_LOCK_LEVELS: SoundDef[] = LEVEL_TIERS.flatMap(({ boomSize, label }) =>
  [false, true].map((isPair) => ({
    id: `black_lock_${isPair ? 'pair' : 'single'}_${boomSize}`,
    name: `${isPair ? 'Black + Black' : 'Black'} Magnet Lock — ${label}`,
    category: 'Black & White Levels' as const,
    situation: isPair
      ? `Two blacks lock to each other, closing a ${boomSize}-ball group`
      : `A coloured ball or group locks onto a black, closing a ${boomSize}-ball group`,
    getParamsText: () => {
      const l = getMagnetLockProps(boomSize);
      // Read from the voice's own constants, so this readout cannot drift.
      const lift = isPair ? PAIR_LIFT : 1;
      const dur = l.dur * (isPair ? PAIR_DUR : 1);
      const vol = l.vol * (isPair ? PAIR_VOL : 1);
      return `Arc: ${Math.round(2400 * lift)}Hz → ${Math.round(450 * lift)}Hz | Dur: ${dur.toFixed(2)}s | Drive ×${l.drive.toFixed(2)} | Sub ×${(l.sub * (isPair ? PAIR_SUB_LIFT : 1)).toFixed(2)} | Vol: lockVol × ${vol.toFixed(2)} (${Math.round(AudioStore.lockVol * vol * 100)}%)`;
    },
    play: () => {
      initAudio();
      playMagneticElectricSound(0, { ignoreOptionsGuard: true, isPair, groupSize: boomSize });
    },
  }))
);

export const SOUND_CATALOG: SoundDef[] = [
  {
    id: 'bond',
    name: 'Bond Lock',
    category: 'Game FX',
    situation: 'Two balls of matching type collide and form a permanent energy bond line',
    getParamsText: () => `Voice: BOND_VOICE (2.5× Pitch) | Vol: lockVol (${Math.round(AudioStore.lockVol * 100)}%) | Master: ${Math.round(AudioStore.volume * 100)}%`,
    play: () => {
      initAudio();
      playNote(0.3, 0, 'bond', { boost: 1.0, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'black_attach',
    name: 'Black Ball Magnet Lock',
    category: 'Game FX',
    situation: 'A coloured ball or group attaches to a black ball with an electric arc zap and magnetic suction snap',
    getParamsText: () => `Electric Square Arc FM Zap + Bandpass Static Discharge + Magnetic Sub Snap | Arc: 2400Hz → 450Hz | Controlled Vol (${Math.round(AudioStore.lockVol * 100)}%)`,
    play: () => {
      initAudio();
      playMagneticElectricSound(0, { ignoreOptionsGuard: true });
    }
  },
  {
    id: 'break',
    name: 'Bond Break',
    category: 'Game FX',
    situation: 'A bond line between balls is severed by high-speed impact or ghost ball detachment',
    getParamsText: () => `Voice: BREAK_VOICE (1.0× Pitch, 0.42s) | Vol: breakVol (${Math.round(AudioStore.breakVol * 100)}%) | Master: ${Math.round(AudioStore.volume * 100)}%`,
    play: () => {
      initAudio();
      playNote(0.5, 0, 'break', { boost: 1.0, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'boom_l0',
    name: 'Boom — Level 0-5 (0..4 balls)',
    category: 'Boom Levels',
    situation: 'Small boom (2 to 4 balls destroyed by a high-power cue shot)',
    getParamsText: () => {
      const p = getBoomProps(3);
      const loudest = p.vol >= getBoomProps(18).vol ? ' ◀ LOUDEST' : '';
      return `Boom size: 3 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s | Level vol: ${p.vol.toFixed(2)}${loudest} | Vol: boomVol (${Math.round(AudioStore.boomVol * 100)}%)\nEcho: ${Math.round(boomEchoSpec(3, false).left * 1000)}/${Math.round(boomEchoSpec(3, false).right * 1000)}ms cross-fed, fb ${boomEchoSpec(3, false).feedback.toFixed(2)}, tail ${boomEchoSpec(3, false).tail.toFixed(1)}s`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'boom', { boost: 1.0, boomSize: 3, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'boom_l1',
    name: 'Boom — Level 5-10 (5..9 balls)',
    category: 'Boom Levels',
    situation: 'Medium boom (5 to 9 bonded balls destroyed)',
    getParamsText: () => {
      const p = getBoomProps(7);
      const loudest = p.vol >= getBoomProps(18).vol ? ' ◀ LOUDEST' : '';
      return `Boom size: 7 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s | Level vol: ${p.vol.toFixed(2)}${loudest} | Vol: boomVol (${Math.round(AudioStore.boomVol * 100)}%)\nEcho: ${Math.round(boomEchoSpec(7, false).left * 1000)}/${Math.round(boomEchoSpec(7, false).right * 1000)}ms cross-fed, fb ${boomEchoSpec(7, false).feedback.toFixed(2)}, tail ${boomEchoSpec(7, false).tail.toFixed(1)}s`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'boom', { boost: 1.0, boomSize: 7, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'boom_l2',
    name: 'Boom — Level 10-15 (10..14 balls)',
    category: 'Boom Levels',
    situation: 'Large boom (10 to 14 balls destroyed, with a heavy bass voice)',
    getParamsText: () => {
      const p = getBoomProps(12);
      const loudest = p.vol >= getBoomProps(18).vol ? ' ◀ LOUDEST' : '';
      return `Boom size: 12 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s | Level vol: ${p.vol.toFixed(2)}${loudest} | Vol: boomVol (${Math.round(AudioStore.boomVol * 100)}%)\nEcho: ${Math.round(boomEchoSpec(12, false).left * 1000)}/${Math.round(boomEchoSpec(12, false).right * 1000)}ms cross-fed, fb ${boomEchoSpec(12, false).feedback.toFixed(2)}, tail ${boomEchoSpec(12, false).tail.toFixed(1)}s`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'boom', { boost: 1.0, boomSize: 12, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'boom_l3',
    name: 'Boom — Level 15-20 (15..19 balls)',
    category: 'Boom Levels',
    situation: 'Massive boom (15 to 19 balls) with 808 sub-drop layer',
    getParamsText: () => {
      const p = getBoomProps(18);
      const loudest = p.vol >= getBoomProps(18).vol ? ' ◀ LOUDEST' : '';
      return `Boom size: 18 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s + 808 Sub-Drop | Level vol: ${p.vol.toFixed(2)}${loudest} | Vol: boomVol (${Math.round(AudioStore.boomVol * 100)}%)\nEcho: ${Math.round(boomEchoSpec(18, false).left * 1000)}/${Math.round(boomEchoSpec(18, false).right * 1000)}ms cross-fed, fb ${boomEchoSpec(18, false).feedback.toFixed(2)}, tail ${boomEchoSpec(18, false).tail.toFixed(1)}s`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'boom', { boost: 1.0, boomSize: 18, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'boom_l4',
    name: 'Boom — Level 20+ (20+ balls)',
    category: 'Boom Levels',
    situation: 'Epic mega boom (20+ balls) with thunderous sub-drop layer',
    getParamsText: () => {
      const p = getBoomProps(25);
      const loudest = p.vol >= getBoomProps(18).vol ? ' ◀ LOUDEST' : '';
      return `Boom size: 25 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s + 808 Sub-Drop | Level vol: ${p.vol.toFixed(2)}${loudest} | Vol: boomVol (${Math.round(AudioStore.boomVol * 100)}%)\nEcho: ${Math.round(boomEchoSpec(25, false).left * 1000)}/${Math.round(boomEchoSpec(25, false).right * 1000)}ms cross-fed, fb ${boomEchoSpec(25, false).feedback.toFixed(2)}, tail ${boomEchoSpec(25, false).tail.toFixed(1)}s`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'boom', { boost: 1.0, boomSize: 25, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'thud_hit',
    name: 'Ball Collision Knock',
    category: 'Game FX',
    situation: 'Physical impact collision between two unbonded balls or against table boundaries',
    getParamsText: () => `Tuned Wood Bar: each ball's colour note, 1 octave above its lock (modes × 1, 3, 6) + Noise Click | Dur: 0.12s | Vol: knocks (${Math.round(AudioStore.clickVol * 100)}%)`,
    play: () => {
      initAudio();
      playKnock(0, 0.6, 0, 2 / 6, { ignoreOptionsGuard: true });
    }
  },
  {
    id: 'thud_swoosh',
    name: 'Ball Launch Swoosh (Standard)',
    category: 'Game FX',
    situation: 'Player releases a normal color ball or black ball cue shot sweeping across table',
    getParamsText: () => `Pitch-Swept Sine Sub: 130Hz → 260Hz → 100Hz | Dur: 0.22s | Vol: knocks (${Math.round(AudioStore.clickVol * 100)}%)`,
    play: () => {
      initAudio();
      playSwoosh(0, 0.7, { ignoreOptionsGuard: true });
    }
  },
  {
    id: 'white_swoosh',
    name: 'White Ball Launch Swoosh (Metallic)',
    category: 'Game FX',
    situation: 'Player releases the white cue ball — a metal sheet swung past the ear, one resonator bank per side',
    getParamsText: () => `Binaural metal-bar banks (× 1, 2.76, 5.40, 8.93 at Q 11–20) swept 520Hz → 1250Hz → 610Hz, sides ${BEAT}Hz apart | + binaural sub | Dur: 0.34s | Vol: knocks (${Math.round(AudioStore.clickVol * 100)}%)`,
    play: () => {
      initAudio();
      playSwoosh(0, 0.7, { ignoreOptionsGuard: true, isWhite: true });
    }
  },
  {
    id: 'cd_tick',
    name: 'Countdown Tick',
    category: 'System & UI',
    situation: 'Clock counting down each second at match start or final 10 seconds of match',
    getParamsText: () => `High-Pitch Sine Beep: 1180 Hz | Dur: 0.09s | Fixed Vol: 22%`,
    play: () => {
      initAudio();
      playCountdownTick({ ignoreOptionsGuard: true });
    }
  },
  {
    id: 'cd_go',
    name: 'Countdown GO! / Finish',
    category: 'System & UI',
    situation: 'Match start moment ("Start!") or match final timer end ("0")',
    getParamsText: () => `High-Pitch Sine Beep: 1180 Hz | Dur: 0.16s | Fixed Vol: 30%`,
    play: () => {
      initAudio();
      playCountdownTick({ isGo: true, ignoreOptionsGuard: true });
    }
  },
  {
    id: 'ui_click',
    name: 'Binaural UI Click',
    category: 'System & UI',
    situation: 'Menu button presses, option toggles, or pausing the game',
    getParamsText: () => `Binaural Beat: 5Hz (259.1Hz L / 264.1Hz R) | Sub-Harmonic | Dur: 0.16s`,
    play: () => {
      initAudio();
      playBinauralClick(261.63, 0.16, 0, 'toggle', 1.0, true);
    }
  },
  {
    id: 'drone_toggle',
    name: 'Ambient Binaural Drone',
    category: 'System & UI',
    situation: 'Continuous background ambient drone playing binaural beats during gameplay',
    getParamsText: () => `Drone Oscs: 107.5Hz (L) & 112.5Hz (R) | Lowpass: 420Hz | Vol: drone (${Math.round(AudioStore.drone * 100)}%)`,
    play: () => {
      initAudio();
      applyGain();
      playBinauralClick(220, 0.4, 0, 'select', 1.0, true);
    }
  },
  ...WHITE_BLACK_LEVELS,
  ...BLACK_LOCK_LEVELS,
];

const paramElementsMap = new Map<string, HTMLElement>();
const cachedParamTexts = new Map<string, string>();

export function renderSoundTester(targetContainer: HTMLElement) {
  targetContainer.innerHTML = '';
  paramElementsMap.clear();
  cachedParamTexts.clear();

  const list = document.createElement('div');
  list.className = 'sound-tester-container';

  for (const sound of SOUND_CATALOG) {
    const card = document.createElement('div');
    card.className = 'sound-card';

    const catClass = sound.category === 'Game FX' ? 'game-fx'
      : sound.category === 'Boom Levels' ? 'boom-levels'
      : sound.category === 'Black & White Levels' ? 'bw-levels'
      : 'system-ui';

    const info = document.createElement('div');
    info.className = 'sound-info';

    const header = document.createElement('div');
    header.className = 'sound-header';

    const title = document.createElement('span');
    title.className = 'sound-title';
    title.textContent = sound.name;

    const badge = document.createElement('span');
    badge.className = `sound-badge ${catClass}`;
    badge.textContent = sound.category;

    header.appendChild(title);
    header.appendChild(badge);

    const desc = document.createElement('div');
    desc.className = 'sound-desc';
    desc.textContent = sound.situation;

    const paramsText = sound.getParamsText();
    const params = document.createElement('div');
    params.className = 'sound-params';
    params.id = `sound-param-${sound.id}`;
    params.textContent = paramsText;
    paramElementsMap.set(sound.id, params);
    cachedParamTexts.set(sound.id, paramsText);

    info.appendChild(header);
    info.appendChild(desc);
    info.appendChild(params);

    const btn = document.createElement('button');
    btn.className = 'sound-play-btn';
    btn.id = `sound-btn-${sound.id}`;
    btn.textContent = '► Play';
    btn.addEventListener('click', () => {
      sound.play();
    });

    card.appendChild(info);
    card.appendChild(btn);

    list.appendChild(card);
  }

  targetContainer.appendChild(list);
}

export function updateSoundTesterReadouts() {
  for (const sound of SOUND_CATALOG) {
    const paramEl = paramElementsMap.get(sound.id) || (typeof document !== 'undefined' ? document.getElementById(`sound-param-${sound.id}`) : null);
    if (paramEl) {
      const newText = sound.getParamsText();
      if (cachedParamTexts.get(sound.id) !== newText) {
        cachedParamTexts.set(sound.id, newText);
        paramEl.textContent = newText;
      }
    }
  }
}
