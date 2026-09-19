import { describe, it, expect, beforeEach, vi } from 'vitest';
import { playNote, playThud, playKnock, getBurstBassBoomProps, playBurstBassBoom, playMagneticElectricSound, BOND_VOICE } from '../../src/audio/Voices';
import { AudioStore } from '../../src/audio/SynthEngine';

describe('Voices module', () => {
  beforeEach(() => {
    AudioStore.soundOn = true;
    AudioStore.activeVoices = 0;
    AudioStore.thuds = 0;
    AudioStore.clickVol = 1.0;
    AudioStore.lockVol = 1.0;
    AudioStore.breakVol = 1.0;
    AudioStore.burstVol = 1.0;
  });

  describe('playMagneticElectricSound synthesis', () => {
    it('creates FM carrier/modulator nodes, lowpass filter sweep, and sub oscillator', () => {
      const mockGainNode = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockOscNode = {
        type: '',
        frequency: { value: 440, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as any,
      };
      const mockFilterNode = {
        type: '',
        Q: { value: 1 },
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      const mockCtx = {
        currentTime: 3.0,
        createGain: vi.fn(() => mockGainNode),
        createBiquadFilter: vi.fn(() => mockFilterNode),
        createOscillator: vi.fn(() => mockOscNode),
        createBufferSource: vi.fn(() => ({
          buffer: null,
          playbackRate: { value: 1 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
      };

      AudioStore.actx = mockCtx as any;
      AudioStore.master = {} as any;
      AudioStore.noiseBuf = {} as any;

      playMagneticElectricSound(0, true);

      expect(mockCtx.createGain).toHaveBeenCalled();
      expect(mockCtx.createBiquadFilter).toHaveBeenCalled();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 3.0);
    });
  });

  describe('playThud white ball launch swoosh', () => {
    it('sets higher playback rate and higher volume peak when isWhite is true', () => {
      const mockGainNode = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockBufferSource = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockFilterNode = {
        type: '',
        Q: { value: 1 },
        frequency: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      const mockOscNode = {
        type: '',
        frequency: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockCtx = {
        currentTime: 5.0,
        createGain: vi.fn(() => mockGainNode),
        createBufferSource: vi.fn(() => mockBufferSource),
        createBiquadFilter: vi.fn(() => mockFilterNode),
        createOscillator: vi.fn(() => mockOscNode),
      };

      AudioStore.actx = mockCtx as any;
      AudioStore.noiseBuf = {} as any;
      AudioStore.master = {} as any;

      playThud('swoosh', 0, 0.8, true, true);

      // Playback rate for white ball swoosh should be 1.75
      expect(mockBufferSource.playbackRate.value).toBe(1.75);
      // Filter frequency starting point for white ball swoosh should be 1100
      expect(mockFilterNode.frequency.value).toBe(1100);
    });
  });

  describe('getBurstBassBoomProps level scaling', () => {
    it('scales tone and duration monotonically across levels 0-5, 5-10, 10-15, 15-20, 20+', () => {
      const lvl0 = getBurstBassBoomProps(3);
      const lvl1 = getBurstBassBoomProps(7);
      const lvl2 = getBurstBassBoomProps(12);
      const lvl3 = getBurstBassBoomProps(18);
      const lvl4 = getBurstBassBoomProps(25);

      // Verify tone increases for each level
      expect(lvl1.tone).toBeGreaterThan(lvl0.tone);
      expect(lvl2.tone).toBeGreaterThan(lvl1.tone);
      expect(lvl3.tone).toBeGreaterThan(lvl2.tone);
      expect(lvl4.tone).toBeGreaterThan(lvl3.tone);

      // Verify duration increases for each level
      expect(lvl1.dur).toBeGreaterThan(lvl0.dur);
      expect(lvl2.dur).toBeGreaterThan(lvl1.dur);
      expect(lvl3.dur).toBeGreaterThan(lvl2.dur);
      expect(lvl4.dur).toBeGreaterThan(lvl3.dur);
    });
  });

  describe('playBurstBassBoom audio synthesis', () => {
    it('creates lowpass filter, gain envelope, sub-bass oscillator and binaural oscillators', () => {
      const mockGainNode = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockOscNode = {
        type: '',
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockFilterNode = {
        type: '',
        Q: { setValueAtTime: vi.fn() },
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      const mockCompNode = {
        threshold: { setValueAtTime: vi.fn() },
        knee: { setValueAtTime: vi.fn() },
        ratio: { setValueAtTime: vi.fn() },
        attack: { setValueAtTime: vi.fn() },
        release: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      const mockCtx = {
        currentTime: 2.0,
        createGain: vi.fn(() => mockGainNode),
        createBiquadFilter: vi.fn(() => mockFilterNode),
        createDynamicsCompressor: vi.fn(() => mockCompNode),
        createOscillator: vi.fn(() => mockOscNode),
      };

      AudioStore.actx = mockCtx as any;
      AudioStore.master = {} as any;

      playBurstBassBoom(12, 0);

      expect(mockCtx.createGain).toHaveBeenCalled();
      expect(mockCtx.createBiquadFilter).toHaveBeenCalled();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 2.0);
    });
  });

  describe('playThud micro-vibration filtering', () => {
    it('ignores tiny forces (normForce < 0.03) for hit thuds to prevent idle crackling', () => {
      // Mock AudioContext
      const mockGainNode = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockCtx = {
        currentTime: 10.0,
        createGain: vi.fn(() => mockGainNode),
        createBufferSource: vi.fn(() => ({
          buffer: null,
          playbackRate: { value: 1 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createBiquadFilter: vi.fn(() => ({
          type: '',
          Q: { value: 1 },
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        })),
        createOscillator: vi.fn(() => ({
          type: '',
          frequency: { value: 0, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
      };

      AudioStore.actx = mockCtx as any;
      AudioStore.noiseBuf = {} as any;
      AudioStore.master = {} as any;

      // Micro force (< 0.03)
      playKnock(0, 0.01, 0, 0.5);
      expect(mockCtx.createGain).not.toHaveBeenCalled();

      // Normal force (>= 0.03)
      playKnock(0, 0.2, 0, 0.5);
      expect(mockCtx.createGain).toHaveBeenCalled();
      // Gain node initialized at 0.0001 immediately
      expect(mockGainNode.gain.value).toBe(0.0001);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 10.0);
    });
  });

  describe('playKnock tuning', () => {
    it("rings each ball at its colour's lock note, one octave up", () => {
      const fundamentals: number[] = [];
      const mockCtx = {
        currentTime: 20.0,
        createGain: vi.fn(() => ({
          gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        })),
        createBufferSource: vi.fn(() => ({
          buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
        })),
        createBiquadFilter: vi.fn(() => ({
          type: '', Q: { value: 1 }, frequency: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn(),
        })),
        createOscillator: vi.fn(() => ({
          type: '',
          frequency: { value: 0, setValueAtTime: vi.fn((v: number) => { fundamentals.push(v); }) },
          connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
        })),
      };
      AudioStore.actx = mockCtx as any;
      AudioStore.noiseBuf = {} as any;
      AudioStore.master = {} as any;
      AudioStore.thudAt = -9;

      const relRed = 0, relBlue = 2 / 6;
      playKnock(0, 0.6, relRed, relBlue);

      const lockNote = (rel: number) => AudioStore.scale[Math.floor(rel * 10)] * BOND_VOICE.mul;
      expect(lockNote(relRed)).not.toBe(lockNote(relBlue));
      expect(fundamentals).toContain(lockNote(relRed) * 2);
      expect(fundamentals).toContain(lockNote(relBlue) * 2);
    });
  });

  describe('playNote gain initialization', () => {
    it('initializes gain nodes immediately to 0.0001 at currentTime', () => {
      const mockGainNode = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockCtx = {
        currentTime: 5.0,
        createGain: vi.fn(() => mockGainNode),
        createBufferSource: vi.fn(() => ({
          buffer: null,
          playbackRate: { value: 1 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createBiquadFilter: vi.fn(() => ({
          type: '',
          Q: { value: 1 },
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        })),
        createOscillator: vi.fn(() => ({
          type: '',
          frequency: { value: 440, exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
      };

      AudioStore.actx = mockCtx as any;
      AudioStore.noiseBuf = {} as any;
      AudioStore.master = {} as any;

      playNote(0.5, 0, 'bond');

      expect(mockCtx.createGain).toHaveBeenCalled();
      expect(mockGainNode.gain.value).toBe(0.0001);
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 5.0);
    });
  });
});

