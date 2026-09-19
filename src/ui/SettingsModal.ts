import { Game } from '../game/GameState';
import { KNOBS, KnobContext } from '../sim/Knobs';
import { initAudio } from '../audio/SynthEngine';

/**
 * Binds the tuning-panel DOM inputs to the shared knob registry in
 * `sim/Knobs.ts`. This file owns only the DOM: reading `<input>` values, writing
 * `<output>` labels, and waking the AudioContext. What a knob actually *does*
 * lives in the registry, which the simulation harness drives by the same names.
 */
import { renderSoundTester, updateSoundTesterReadouts } from './SoundTester';

export function setupSettingsKnobs(
  getGame: () => Game,
  resizeFn: () => void,
  getHeight: () => number = () => window.innerHeight
) {
  // Render Sound FX Tester list in the options panel container if present
  const soundTesterContainer = document.getElementById('sound-tester-container');
  if (soundTesterContainer) {
    renderSoundTester(soundTesterContainer);
  }

  // Knobs that recompute scale-derived thresholds must see the height the
  // physics actually runs at — the stage, not the window, which is taller by
  // however much chrome the HUD and control strips occupy.
  const ctx = (): KnobContext => ({ game: getGame(), height: getHeight() });

  // The kickout readout also reports the derived chain percentage, so knobs that
  // move the burst thresholds have to refresh it as well as their own label.
  const refreshChainReadout = () => {
    const def = KNOBS.kickout;
    const el = document.getElementById('kickout') as HTMLInputElement | null;
    const out = document.getElementById('kickoutv');
    if (el && out) out.textContent = def.format(parseFloat(el.value), ctx());
  };

  for (const def of Object.values(KNOBS)) {
    const el = document.getElementById(def.id) as HTMLInputElement | HTMLSelectElement | null;
    const out = document.getElementById(def.id + 'v');
    if (!el) continue;

    const run = () => {
      const raw = el.type === 'range' ? parseFloat(el.value) : el.value;
      def.apply(raw, ctx());
      if (out) out.textContent = def.format(raw, ctx());
      if (def.group === 'chain') refreshChainReadout();
      if (def.group === 'audio' || def.wakesAudio) updateSoundTesterReadouts();
    };

    el.addEventListener('input', () => {
      if (def.wakesAudio) initAudio();
      run();
    });
    run();
  }
}
