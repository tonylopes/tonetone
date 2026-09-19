import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildScale, loadAt_, applyDrone, fadeDroneForResults, stopAllVoices, registerActiveNode, AudioStore, initAudio, wakeAudio } from '../../src/audio/SynthEngine';

describe('SynthEngine module', () => {
  describe('buildScale', () => {
    it('generates 10 frequency values across 2 octaves for scale', () => {
      const scale = buildScale('Minor pentatonic');
      expect(scale.length).toBe(10);
      expect(scale[0]).toBe(110); // A2 base pitch
      expect(scale[5]).toBe(220); // Octave
    });

    it('falls back to Minor pentatonic for unknown scale names', () => {
      const defaultScale = buildScale('Minor pentatonic');
      const unknownScale = buildScale('NonExistentScale');
      expect(unknownScale).toEqual(defaultScale);
    });
  });

  describe('loadAt_', () => {
    it('calculates exponential voice load decay based on elapsed time', () => {
      AudioStore.load = 2.0;
      AudioStore.loadAt = 10.0;

      // At same time
      expect(loadAt_(10.0)).toBe(2.0);

      // Decayed over time
      expect(loadAt_(11.0)).toBeLessThan(2.0);
    });
  });

  describe('applyDrone and fadeDroneForResults', () => {
    it('fades drone to 0 target when results screen is ducked', () => {
      const droneGainMock = { gain: { setTargetAtTime: vi.fn() } };
      AudioStore.actx = { currentTime: 15.0 } as any;
      AudioStore.droneGain = droneGainMock as any;
      AudioStore.drone = 0.8;

      fadeDroneForResults(true);
      // ducked: gain target should be 0
      expect(droneGainMock.gain.setTargetAtTime).toHaveBeenCalledWith(0, 15.0, 0.4);

      droneGainMock.gain.setTargetAtTime.mockClear();
      fadeDroneForResults(false);
      // restored: 0.026 * drone (0.8) = 0.0208
      expect(droneGainMock.gain.setTargetAtTime).toHaveBeenCalledWith(
        expect.closeTo(0.0208, 5), 15.0, 0.4
      );
    });
  });

  describe('stopAllVoices', () => {
    it('stops and disconnects all registered nodes and resets counters', () => {
      const nodeMock1 = { stop: vi.fn(), disconnect: vi.fn() };
      const nodeMock2 = { disconnect: vi.fn() };
      registerActiveNode(nodeMock1);
      registerActiveNode(nodeMock2);
      AudioStore.activeVoices = 5;
      AudioStore.thuds = 3;

      stopAllVoices();

      expect(nodeMock1.stop).toHaveBeenCalled();
      expect(nodeMock1.disconnect).toHaveBeenCalled();
      expect(nodeMock2.disconnect).toHaveBeenCalled();
      expect(AudioStore.activeVoices).toBe(0);
      expect(AudioStore.thuds).toBe(0);
    });
  });

  describe('waking a stopped context', () => {
    // Coming back to the game could leave the sound on but silent until the
    // player switched it off and on. These drive a fake context through the
    // states a browser leaves it in and check the return path recovers it.
    function fakeContext(state: string) {
      const ctx: any = { state, currentTime: 3 };
      ctx.resume = vi.fn(() => { ctx.state = 'running'; return Promise.resolve(); });
      return ctx;
    }
    const master = { gain: { setTargetAtTime: vi.fn() } };

    let saved: any;
    beforeEach(() => {
      saved = { actx: AudioStore.actx, master: AudioStore.master, droneGain: AudioStore.droneGain,
                soundOn: AudioStore.soundOn, volume: AudioStore.volume };
      AudioStore.master = master as any;
      AudioStore.droneGain = null;
      AudioStore.soundOn = true;
      AudioStore.volume = 0.9;
      master.gain.setTargetAtTime.mockClear();
    });
    afterEach(() => { Object.assign(AudioStore, saved); });

    for (const state of ['suspended', 'interrupted']) {
      it(`resumes a context left ${state}, then sets the output level again`, async () => {
        const ctx = fakeContext(state);
        AudioStore.actx = ctx;
        initAudio();
        expect(ctx.resume).toHaveBeenCalledTimes(1);
        await new Promise(r => setTimeout(r, 0));
        expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(0.9, 3, 0.08);
      });
    }

    it('leaves a running context alone', () => {
      const ctx = fakeContext('running');
      AudioStore.actx = ctx;
      initAudio();
      expect(ctx.resume).not.toHaveBeenCalled();
    });

    it('does not throw when the browser refuses the resume', async () => {
      const ctx = fakeContext('suspended');
      ctx.resume = vi.fn(() => Promise.reject(new Error('not allowed')));
      AudioStore.actx = ctx;
      expect(() => initAudio()).not.toThrow();
      await new Promise(r => setTimeout(r, 0));
    });

    it('wakeAudio does what the sound toggle does: resume, and set the level', () => {
      const ctx = fakeContext('running');
      AudioStore.actx = ctx;
      wakeAudio();
      // A running context can still have been left without its level; the
      // toggle re-applies it, so returning to the page must too.
      expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(0.9, 3, 0.08);
    });

    it('wakeAudio does nothing before audio has started', () => {
      AudioStore.actx = null;
      expect(() => wakeAudio()).not.toThrow();
      expect(master.gain.setTargetAtTime).not.toHaveBeenCalled();
    });
  });
});
