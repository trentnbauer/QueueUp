import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/basePath', () => ({ getBasePath: () => '' }));

describe('sound', () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  });

  it('is on until turned off, and remembers the choice', async () => {
    vi.stubGlobal('window', {});
    const { setSoundOn, soundOn } = await import('./sound');
    expect(soundOn()).toBe(true);
    setSoundOn(false);
    expect(soundOn()).toBe(false);
    setSoundOn(true);
    expect(soundOn()).toBe(true);
  });

  it('makes no audio context while muted, and never throws without one', async () => {
    const Ctor = vi.fn();
    vi.stubGlobal('window', { AudioContext: Ctor });
    const { playSound, setSoundOn } = await import('./sound');
    setSoundOn(false);
    playSound('click');
    expect(Ctor).not.toHaveBeenCalled();
    setSoundOn(true);
    vi.stubGlobal('window', {});
    expect(() => playSound('click')).not.toThrow();
  });
});
