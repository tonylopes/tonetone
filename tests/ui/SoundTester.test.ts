import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SOUND_CATALOG, renderSoundTester, updateSoundTesterReadouts } from '../../src/ui/SoundTester';
import { AudioStore } from '../../src/audio/SynthEngine';

describe('SoundTester module', () => {
  beforeEach(() => {
    // Lightweight DOM mock for node environment
    if (typeof global.document === 'undefined') {
      const elementsMap = new Map<string, any>();
      (global as any).document = {
        body: { appendChild: vi.fn() },
        createElement: (tag: string) => {
          const el: any = {
            tagName: tag.toUpperCase(),
            className: '',
            innerHTML: '',
            textContent: '',
            id: '',
            children: [],
            appendChild: (child: any) => {
              el.children.push(child);
              if (child.id) elementsMap.set(child.id, child);
            },
            querySelectorAll: (selector: string) => {
              if (selector === '.sound-card') return el.children[0]?.children || [];
              return [];
            },
            addEventListener: vi.fn((event: string, fn: Function) => { el['on' + event] = fn; }),
            click: () => { if (el.onclick) el.onclick(); }
          };
          return el;
        },
        getElementById: (id: string) => elementsMap.get(id) || null
      };
      (global as any).document._elementsMap = elementsMap;
    }
    if ((global as any).document._elementsMap) {
      (global as any).document._elementsMap.clear();
    }
    AudioStore.soundOn = true;
    AudioStore.volume = 0.9;
    AudioStore.lockVol = 0.5;
    AudioStore.breakVol = 1.7;
    AudioStore.burstVol = 1.0;
    AudioStore.clickVol = 0.5;
    AudioStore.drone = 1.0;
  });

  it('contains sound catalog entries for all game sounds and situations', () => {
    expect(SOUND_CATALOG.length).toBeGreaterThanOrEqual(15);

    const ids = SOUND_CATALOG.map(s => s.id);
    expect(ids).toContain('bond');
    expect(ids).toContain('black_attach');
    expect(ids).toContain('break');
    expect(ids).toContain('burst_l0');
    expect(ids).toContain('burst_l1');
    expect(ids).toContain('burst_l2');
    expect(ids).toContain('burst_l3');
    expect(ids).toContain('burst_l4');
    expect(ids).toContain('thud_hit');
    expect(ids).toContain('thud_swoosh');
    expect(ids).toContain('white_swoosh');
    expect(ids).toContain('cd_tick');
    expect(ids).toContain('cd_go');
    expect(ids).toContain('ui_click');
    expect(ids).toContain('drone_toggle');
  });

  it('renders interactive sound test cards into container with play buttons', () => {
    const container = document.createElement('div');
    container.id = 'sound-tester-container';
    document.body.appendChild(container);

    renderSoundTester(container);

    const cards = container.querySelectorAll('.sound-card');
    expect(cards.length).toBe(SOUND_CATALOG.length);

    const bondBtn = document.getElementById('sound-btn-bond');
    expect(bondBtn).not.toBeNull();
    expect(bondBtn?.textContent).toContain('Play');
  });

  it('updates parameter readouts dynamically when values change', () => {
    const container = document.createElement('div');
    container.id = 'sound-tester-container';
    document.body.appendChild(container);

    renderSoundTester(container);

    const paramEl = document.getElementById('sound-param-bond');
    expect(paramEl?.textContent).toContain('lockVol (50%)');

    AudioStore.lockVol = 1.2;
    updateSoundTesterReadouts();

    expect(paramEl?.textContent).toContain('lockVol (120%)');
  });

  it('triggers sound play function on button click without error', () => {
    const container = document.createElement('div');
    container.id = 'sound-tester-container';
    document.body.appendChild(container);

    renderSoundTester(container);

    const mockCtx = {
      currentTime: 1.0,
      createGain: vi.fn(() => ({
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      createBiquadFilter: vi.fn(() => ({
        type: '',
        Q: { setValueAtTime: vi.fn() },
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      createDynamicsCompressor: vi.fn(() => ({
        threshold: { setValueAtTime: vi.fn() },
        knee: { setValueAtTime: vi.fn() },
        ratio: { setValueAtTime: vi.fn() },
        attack: { setValueAtTime: vi.fn() },
        release: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
    };
    AudioStore.actx = mockCtx as any;
    AudioStore.master = {} as any;

    const btn = document.getElementById('sound-btn-burst_l2') as HTMLButtonElement;
    expect(() => btn.click()).not.toThrow();
  });
});
