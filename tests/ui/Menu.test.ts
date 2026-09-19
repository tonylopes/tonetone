import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initMenuScreen, showMenu, hideMenu, isMenuVisible, computeMenuLayout, playBinauralClick, resetBinauralAudioStateForTesting } from '../../src/ui/MenuScreen';
import { AudioStore } from '../../src/audio/SynthEngine';
import type { PlayMode } from '../../src/game/GameState';

class MockElement {
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  textContent: string = '';
  classList = {
    classes: new Set<string>(),
    add: (c: string) => { this.classList.classes.add(c); },
    remove: (c: string) => { this.classList.classes.delete(c); },
    contains: (c: string) => this.classList.classes.has(c),
  };

  setAttribute(name: string, val: string) {
    this.attributes[name] = val;
  }
  removeAttribute(name: string) {
    delete this.attributes[name];
  }
  hasAttribute(name: string): boolean {
    return name in this.attributes;
  }
  addEventListener(_type: string, _fn: any) {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1024, height: 768 };
  }
  getContext(_type: string) {
    return {
      resetTransform: () => {},
      scale: () => {},
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      measureText: () => ({ width: 100 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };
  }
}

describe('MenuScreen', () => {
  let menuContainer: MockElement;
  let canvasEl: MockElement;
  let audioBtnEl: MockElement;
  let fsBtnEl: MockElement;

  beforeEach(() => {
    menuContainer = new MockElement();
    canvasEl = new MockElement();
    audioBtnEl = new MockElement();
    fsBtnEl = new MockElement();

    (globalThis as any).document = {
      documentElement: {
        requestFullscreen: vi.fn(),
      },
      getElementById: (id: string) => {
        if (id === 'menu-screen') return menuContainer;
        if (id === 'gameMenu') return canvasEl;
        if (id === 'audioToggle') return audioBtnEl;
        if (id === 'fsToggle') return fsBtnEl;
        return null;
      },
      addEventListener: () => {},
    };

    (globalThis as any).window = {
      innerWidth: 1024,
      innerHeight: 768,
      devicePixelRatio: 1,
      addEventListener: () => {},
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    };
  });

  it('initializes and toggles menu visibility correctly', () => {
    let selectedMode: PlayMode | null = null;
    initMenuScreen((mode) => {
      selectedMode = mode;
    });

    showMenu();
    expect(isMenuVisible()).toBe(true);
    expect(menuContainer.hasAttribute('hidden')).toBe(false);

    hideMenu();
    expect(isMenuVisible()).toBe(false);
    expect(menuContainer.hasAttribute('hidden')).toBe(true);
  });

  it('refreshes the audio and full screen labels each time the menu is shown', () => {
    initMenuScreen(() => {});

    AudioStore.soundOn = false;
    showMenu();
    expect(audioBtnEl.textContent).toBe('Audio off');
    expect(fsBtnEl.textContent).toBe('Full screen');

    hideMenu();
    AudioStore.soundOn = true;
    showMenu();
    expect(audioBtnEl.textContent).toBe('Audio on');
    expect(fsBtnEl.textContent).toBe('Full screen');

    hideMenu();
  });

  it('hides full screen button if requestFullscreen is not supported', () => {
    (globalThis as any).document.documentElement = {};
    initMenuScreen(() => {});
    showMenu();
    expect(fsBtnEl.hasAttribute('hidden')).toBe(true);
    hideMenu();
  });

  it('accepts onOptions callback on initMenuScreen', () => {
    let optionsOpened = false;
    initMenuScreen(() => {}, () => {
      optionsOpened = true;
    });
    expect(optionsOpened).toBe(false);
  });

  it('computes 4 distinct button layout rectangles with non-overlapping Y bounds', () => {
    const layout = computeMenuLayout(1024, 768, canvasEl.getContext('2d') as any);
    expect(layout.buttons.length).toBe(4);
    expect(layout.buttons[0].text).toBe('Solo');
    expect(layout.buttons[1].text).toBe('1 player');
    expect(layout.buttons[2].text).toBe('2 players');
    expect(layout.buttons[3].text).toBe('Options');

    for (let i = 0; i < layout.buttons.length - 1; i++) {
      const current = layout.buttons[i];
      const next = layout.buttons[i + 1];
      expect(next.y).toBeGreaterThan(current.y + current.height);
    }
  });

  describe('playBinauralClick Audio Management', () => {
    let createdNodes: any[];
    let createdGains: any[];
    let createdOscillators: any[];
    let mockCtx: any;

    beforeEach(() => {
      resetBinauralAudioStateForTesting();
      createdNodes = [];
      createdGains = [];
      createdOscillators = [];
      AudioStore.soundOn = true;

      const trackNode = (n: any) => {
        createdNodes.push(n);
        return n;
      };

      mockCtx = {
        currentTime: 10.0,
        state: 'running',
        resume: vi.fn(),
        createBiquadFilter: vi.fn(() => trackNode({
          type: 'lowpass',
          frequency: { setValueAtTime: vi.fn() },
          Q: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        createGain: vi.fn(() => {
          const g = trackNode({
            gain: {
              value: 1,
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
          });
          createdGains.push(g);
          return g;
        }),
        createOscillator: vi.fn(() => {
          const osc = trackNode({
            type: 'sine',
            frequency: { value: 440, setValueAtTime: vi.fn() },
            start: vi.fn(),
            stop: vi.fn(),
            onended: null as any,
            connect: vi.fn(),
            disconnect: vi.fn(),
          });
          createdOscillators.push(osc);
          return osc;
        }),
        createStereoPanner: vi.fn(() => trackNode({
          pan: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        destination: {},
      };

      AudioStore.actx = mockCtx as any;
      AudioStore.master = mockCtx.destination as any;
    });

    it('does not create audio nodes when AudioStore.soundOn is false', () => {
      AudioStore.soundOn = false;
      playBinauralClick(261.63, 0.16, 0, 'select');
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });

    it('schedules smooth gain ramp up and zero-crossing decay to zero to prevent clicks', () => {
      playBinauralClick(261.63, 0.16, 0, 'select');

      expect(createdGains.length).toBeGreaterThan(0);
      createdGains.forEach(gNode => {
        expect(gNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, expect.any(Number));
        expect(gNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
      });
    });

    it('cleans up WebAudio nodes and invokes disconnect() on ended to prevent memory and audio leaks', () => {
      playBinauralClick(261.63, 0.16, 0, 'select');

      const masterNode = createdOscillators.find(n => typeof n.onended === 'function');
      expect(masterNode).toBeDefined();

      masterNode.onended();

      createdNodes.forEach(n => {
        expect(n.disconnect).toHaveBeenCalled();
      });
    });

    it('caps concurrent active binaural click voices to MAX_MENU_VOICES (6) to prevent WebAudio thread overload', () => {
      mockCtx.currentTime = 1.0;
      let timestampCounter = 100;

      const invokeClick = () => {
        timestampCounter += 100;
        vi.spyOn(performance, 'now').mockReturnValue(timestampCounter);
        playBinauralClick(261.63, 0.16, 0, 'select');
      };

      for (let i = 0; i < 10; i++) {
        invokeClick();
      }

      const masterNodes = createdOscillators.filter(n => typeof n.onended === 'function');
      expect(masterNodes.length).toBeLessThanOrEqual(6);
    });
  });
});
