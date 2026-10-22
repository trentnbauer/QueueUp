import { LOBBY_GAME_IDS } from '@queueup/shared';
import { describe, expect, it } from 'vitest';
import { CONTROLS, drawControls } from './controls';

/** A canvas context that does nothing but remember what it was asked to do: enough to check that a frame is drawn without
 * errors, balanced (every `save` has its `restore`), with real numbers, and that it draws something. */
function recorder() {
  const calls = new Map<string, number>();
  const bad: string[] = [];
  const store: Record<string, unknown> = {};
  const ctx = new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.set(prop, (calls.get(prop) ?? 0) + 1);
        // A coordinate or size that is not a real number would draw nothing, or something wild.
        args.forEach((a, i) => {
          if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${prop} argument ${i} is ${a}`);
        });
        if (prop === 'measureText') return { width: String(args[0]).length * 6 };
        if (prop.startsWith('create')) return { addColorStop() {} };
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const count = (...names: string[]) => names.reduce((n, name) => n + (calls.get(name) ?? 0), 0);
  return { ctx, calls, bad, count };
}

describe('the countdown picture', () => {
  it('has a picture for every game, and draws it within the arena', () => {
    for (const id of LOBBY_GAME_IDS) {
      expect(CONTROLS[id], id).toBeTruthy();
      const rec = recorder();
      const theme = { acc: '#fa0', accText: '#fc6', mint: '#4c8', star: '#fd4' };
      drawControls({ ctx: rec.ctx, S: 440, now: 500, snapshot: { id }, fx: { reduced: false }, theme } as never, 440 * 0.215, 440 * 0.085);
      expect(rec.bad, id).toEqual([]);
      expect(rec.count('save'), id).toBe(rec.count('restore'));
      expect(rec.count('fill', 'stroke'), `${id} draws its picture`).toBeGreaterThan(0);
    }
  });

  it('shows Words the three marks with a letter on each', () => {
    const rec = recorder();
    const theme = { acc: '#fa0', accText: '#fc6', mint: '#4c8', star: '#fd4' };
    drawControls({ ctx: rec.ctx, S: 440, now: 0, snapshot: { id: 'words' }, fx: { reduced: true }, theme } as never, 94, 37);
    expect(rec.count('fillText')).toBe(3);
  });
});
