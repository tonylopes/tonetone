import { AudioStore, initAudio, applyGain } from '../audio/SynthEngine';
import { playNote, playThud, playKnock, playCountdownTick, playBurstBassBoom, getBurstBassBoomProps, playMagneticElectricSound } from '../audio/Voices';
import { playBinauralClick } from './MenuScreen';

export interface SoundDef {
  id: string;
  name: string;
  category: 'Game FX' | 'Burst Levels' | 'System & UI';
  situation: string;
  getParamsText: () => string;
  play: () => void;
}

export const SOUND_CATALOG: SoundDef[] = [
  {
    id: 'bond',
    name: 'Bond Lock',
    category: 'Game FX',
    situation: 'Two balls of matching type collide and form a permanent energy bond line',
    getParamsText: () => `Voice: BOND_VOICE (2.5× Pitch) | Vol: lockVol (${Math.round(AudioStore.lockVol * 100)}%) | Master: ${Math.round(AudioStore.volume * 100)}%`,
    play: () => {
      initAudio();
      playNote(0.3, 0, 'bond', 1.0, undefined, true);
    }
  },
  {
    id: 'black_attach',
    name: 'Black Ball Magnet Lock',
    category: 'Game FX',
    situation: 'A ball or group attaches to the black ball with an electric arc zap and magnetic suction snap',
    getParamsText: () => `Electric Square Arc FM Zap + Bandpass Static Discharge + Magnetic Sub Snap | Controlled Vol (${Math.round(AudioStore.lockVol * 100)}%)`,
    play: () => {
      initAudio();
      playMagneticElectricSound(0, true);
    }
  },
  {
    id: 'break',
    name: 'Break Shatter',
    category: 'Game FX',
    situation: 'A bond line between balls is severed by high-speed impact or ghost ball detachment',
    getParamsText: () => `Voice: BREAK_VOICE (1.0× Pitch, 0.42s) | Vol: breakVol (${Math.round(AudioStore.breakVol * 100)}%) | Master: ${Math.round(AudioStore.volume * 100)}%`,
    play: () => {
      initAudio();
      playNote(0.5, 0, 'break', 1.0, undefined, true);
    }
  },
  {
    id: 'burst_l0',
    name: 'Burst Boom — Level 0-5 (0..4 balls)',
    category: 'Burst Levels',
    situation: 'Small cluster explosion (2 to 4 balls shattered by a high-power cue shot)',
    getParamsText: () => {
      const p = getBurstBassBoomProps(3);
      return `Chain: 3 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s | Vol: burstVol (${Math.round(AudioStore.burstVol * 100)}%)`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'burst', 1.0, 3, true);
    }
  },
  {
    id: 'burst_l1',
    name: 'Burst Boom — Level 5-10 (5..9 balls)',
    category: 'Burst Levels',
    situation: 'Medium cluster explosion (5 to 9 bonded balls explode)',
    getParamsText: () => {
      const p = getBurstBassBoomProps(7);
      return `Chain: 7 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s | Vol: burstVol (${Math.round(AudioStore.burstVol * 100)}%)`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'burst', 1.0, 7, true);
    }
  },
  {
    id: 'burst_l2',
    name: 'Burst Boom — Level 10-15 (10..14 balls)',
    category: 'Burst Levels',
    situation: 'Large cluster explosion (10 to 14 balls shatter into a heavy bass boom)',
    getParamsText: () => {
      const p = getBurstBassBoomProps(12);
      return `Chain: 12 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s | Vol: burstVol (${Math.round(AudioStore.burstVol * 100)}%)`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'burst', 1.0, 12, true);
    }
  },
  {
    id: 'burst_l3',
    name: 'Burst Boom — Level 15-20 (15..19 balls)',
    category: 'Burst Levels',
    situation: 'Massive cluster explosion (15 to 19 balls) with 808 sub-drop layer',
    getParamsText: () => {
      const p = getBurstBassBoomProps(18);
      return `Chain: 18 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s + 808 Sub-Drop | Vol: burstVol (${Math.round(AudioStore.burstVol * 100)}%)`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'burst', 1.0, 18, true);
    }
  },
  {
    id: 'burst_l4',
    name: 'Burst Boom — Level 20+ (20+ balls)',
    category: 'Burst Levels',
    situation: 'Epic mega cluster explosion (20+ balls) with thunderous sub-drop layer',
    getParamsText: () => {
      const p = getBurstBassBoomProps(25);
      return `Chain: 25 balls | Pitch Dive: ${Math.round(p.tone * 3.4)}Hz → ${Math.round(p.tone * 0.5)}Hz | Dur: ${p.dur.toFixed(2)}s + 808 Sub-Drop | Vol: burstVol (${Math.round(AudioStore.burstVol * 100)}%)`;
    },
    play: () => {
      initAudio();
      playNote(0.5, 0, 'burst', 1.0, 25, true);
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
      playKnock(0, 0.6, 0, 2 / 6, true);
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
      playThud('swoosh', 0, 0.7, true, false);
    }
  },
  {
    id: 'white_swoosh',
    name: 'White Ball Launch Swoosh (High Tone)',
    category: 'Game FX',
    situation: 'Player releases a powerful white cue ball launch (higher tone sweep + dual volume + shimmer overtone)',
    getParamsText: () => `High Noise Rate (1.75×) + Dual Sine Pitch (480Hz → 1150Hz) + Shimmer Sparkle | Dur: 0.28s | Soft Volume (${Math.round(AudioStore.clickVol * 89)}%)`,
    play: () => {
      initAudio();
      playThud('swoosh', 0, 0.7, true, true);
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
      playCountdownTick(false, true);
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
      playCountdownTick(true, true);
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
  }
];

let containerEl: HTMLElement | null = null;

const paramElementsMap = new Map<string, HTMLElement>();
const cachedParamTexts = new Map<string, string>();

export function renderSoundTester(targetContainer: HTMLElement) {
  containerEl = targetContainer;
  targetContainer.innerHTML = '';
  paramElementsMap.clear();
  cachedParamTexts.clear();

  const list = document.createElement('div');
  list.className = 'sound-tester-container';

  for (const sound of SOUND_CATALOG) {
    const card = document.createElement('div');
    card.className = 'sound-card';

    const catClass = sound.category === 'Game FX' ? 'game-fx' : sound.category === 'Burst Levels' ? 'burst-levels' : 'system-ui';

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
