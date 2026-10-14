import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LobbyGameSnapshot } from '@queueup/shared';
import { LobbyFx, type FxFrame } from './fx';
import { hueOf } from './draw';

afterEach(() => vi.unstubAllGlobals());

const frame: FxFrame = {
  me: 'me',
  colorOf: () => '#4a8fe8',
  anchor: () => ({ x: 0.2, y: 0.5 }),
  outText: 'OUT',
  youOutText: "YOU'RE OUT",
};

function snap(over: Partial<Record<string, unknown>> & { players?: { id: string; alive: boolean }[] } = {}): LobbyGameSnapshot {
  const players = (over.players ?? [{ id: 'me', alive: true }, { id: 'b', alive: true }]).map((p) => ({ id: p.id, alive: p.alive, wins: 0, meters: 0, x: 0.5, dir: 0 }));
  return { id: 'dodge', phase: 'playing', meters: 10, speed: 0.5, timerMs: 0, winnerId: null, run: 1, history: [], best: null, blocks: [], ...over, players } as unknown as LobbyGameSnapshot;
}

function reducedMotion(on: boolean) {
  const matchMedia = (q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { matchMedia });
}

describe('LobbyFx knock-outs', () => {
  it('bursts, shakes and flashes when you are knocked out, and only shakes (less) for others', () => {
    reducedMotion(false);
    const mine = new LobbyFx();
    mine.update(snap(), 1000, frame);
    mine.update(snap({ players: [{ id: 'me', alive: false }, { id: 'b', alive: true }] }), 1066, frame);
    // Both start at full strength and have already begun to fade by the end of the frame.
    expect(mine.shake).toBeGreaterThan(0.8);
    expect(mine.flash).toBeGreaterThan(0.8);

    const theirs = new LobbyFx();
    theirs.update(snap(), 1000, frame);
    theirs.update(snap({ players: [{ id: 'me', alive: true }, { id: 'b', alive: false }] }), 1066, frame);
    expect(theirs.shake).toBeGreaterThan(0.2);
    expect(theirs.shake).toBeLessThan(0.4);
    expect(theirs.flash).toBe(0);
  });

  it('does nothing for someone who was never in the run, or when nobody is knocked out', () => {
    reducedMotion(false);
    const fx = new LobbyFx();
    fx.update(snap({ players: [{ id: 'me', alive: true }, { id: 'b', alive: false }] }), 1000, frame);
    fx.update(snap({ players: [{ id: 'me', alive: true }, { id: 'b', alive: false }] }), 1066, frame);
    expect(fx.shake).toBe(0);
  });

  it('skips shake and flash for people who ask for reduced motion', () => {
    reducedMotion(true);
    const fx = new LobbyFx();
    expect(fx.reduced).toBe(true);
    fx.update(snap(), 1000, frame);
    fx.update(snap({ players: [{ id: 'me', alive: false }, { id: 'b', alive: true }] }), 1066, frame);
    expect(fx.shake).toBe(0);
    expect(fx.flash).toBe(0);
  });

  it('lets shake and flash fade out', () => {
    reducedMotion(false);
    const fx = new LobbyFx();
    fx.update(snap(), 1000, frame);
    fx.update(snap({ players: [{ id: 'me', alive: false }, { id: 'b', alive: true }] }), 1050, frame);
    let now = 1050;
    for (let i = 0; i < 40; i++) fx.update(snap({ players: [{ id: 'me', alive: false }, { id: 'b', alive: true }] }), (now += 50), frame);
    expect(fx.shake).toBe(0);
    expect(fx.flash).toBe(0);
  });
});

describe('LobbyFx confetti and scroll', () => {
  it('throws confetti once when a run is won, not on every frame, and not when reduced', () => {
    reducedMotion(false);
    const fx = new LobbyFx();
    const spy = vi.spyOn(fx as unknown as { confetti: (c: string) => void }, 'confetti');
    fx.update(snap(), 1000, frame);
    fx.update(snap({ phase: 'over', winnerId: 'b' }), 1066, frame);
    fx.update(snap({ phase: 'over', winnerId: 'b' }), 1132, frame);
    fx.update(snap({ phase: 'over', winnerId: 'b' }), 1198, frame);
    expect(spy).toHaveBeenCalledTimes(1);

    reducedMotion(true);
    const calm = new LobbyFx();
    const calmSpy = vi.spyOn(calm as unknown as { confetti: (c: string) => void }, 'confetti');
    calm.update(snap(), 1000, frame);
    calm.update(snap({ phase: 'over', winnerId: 'b' }), 1066, frame);
    expect(calmSpy).not.toHaveBeenCalled();
  });

  it('scrolls the background only while a run is on', () => {
    reducedMotion(false);
    const fx = new LobbyFx();
    fx.update(snap({ speed: 1 }), 1000, frame);
    fx.update(snap({ speed: 1 }), 1500, frame);
    const moved = fx.scroll;
    expect(moved).toBeGreaterThan(0);
    fx.update(snap({ phase: 'countdown', speed: 1 }), 2000, frame);
    expect(fx.scroll).toBe(moved);
  });

  it('starts fresh when the game changes', () => {
    reducedMotion(false);
    const fx = new LobbyFx();
    fx.update(snap(), 1000, frame);
    const other = { ...(snap({ players: [{ id: 'me', alive: false }, { id: 'b', alive: true }] }) as object), id: 'runner' } as unknown as LobbyGameSnapshot;
    fx.update(other, 1066, frame); // a different game: no knock-out burst from comparing the two
    expect(fx.shake).toBe(0);
  });

  it('measures how long ago a snapshot arrived, up to one snapshot interval', () => {
    reducedMotion(false);
    const fx = new LobbyFx();
    const s = snap();
    expect(fx.age(s, 1000)).toBe(0);
    expect(fx.age(s, 1050)).toBeCloseTo(0.05);
    expect(fx.age(s, 5000)).toBe(0.12);
  });
});

describe('hueOf', () => {
  it('gives the same hue for the same number, a valid one, and spreads neighbours apart', () => {
    expect(hueOf(7)).toBe(hueOf(7));
    for (let n = 0; n < 200; n++) {
      expect(hueOf(n)).toBeGreaterThanOrEqual(0);
      expect(hueOf(n)).toBeLessThan(360);
    }
    expect(Math.abs(hueOf(1) - hueOf(2))).toBeGreaterThan(30);
  });
});
