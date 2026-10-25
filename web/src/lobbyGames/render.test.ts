import { LOBBY_GAME_IDS, createLobbyGame, type LobbyGameId, type LobbyGameSnapshot } from '@queueup/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../i18n';
import { LOBBY_GAME_VIEWS } from './index';
import { LobbyFx } from './kit';

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

function reducedMotion(on: boolean) {
  const matchMedia = (q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { matchMedia });
}

beforeEach(() => reducedMotion(false));
afterEach(() => vi.unstubAllGlobals());

const STEP = 33;
type Phase = LobbyGameSnapshot['phase'];

/** One game played alone from the start, and a snapshot from each phase it gets through: waiting, the countdown, play and the result. */
function phasesOf(id: LobbyGameId): Map<Phase, LobbyGameSnapshot> {
  const game = createLobbyGame(id);
  const seen = new Map<Phase, LobbyGameSnapshot>();
  const take = (replace = false) => {
    const snapshot = game.snapshot('a');
    if (replace || !seen.has(snapshot.phase)) seen.set(snapshot.phase, JSON.parse(JSON.stringify(snapshot)) as LobbyGameSnapshot);
  };
  take(); // waiting for someone, before anyone joins
  game.join('a');
  let playing = 0;
  for (let i = 0; i < 4000 && !seen.has('over'); i++) {
    game.tick(STEP);
    if (game.snapshot('a').phase === 'playing') playing++;
    // The first frame of each phase, and then one from a little way into play (it replaces the first).
    take(playing === 60);
  }
  return seen;
}

function frame(id: LobbyGameId, snapshot: LobbyGameSnapshot, held = { dx: 1, dy: 0 }) {
  const rec = recorder();
  const view = LOBBY_GAME_VIEWS[id];
  const fx = new LobbyFx();
  view.draw({
    ctx: rec.ctx,
    size: 440,
    snapshot,
    me: 'a',
    users: new Map(),
    ease: (_key, x, y) => ({ x, y }),
    color: (_name, fallback) => fallback,
    t: (key, params) => translate('en', key, params),
    fx,
    held,
  } as never);
  return rec;
}

describe('every mini game draws a frame in every phase', () => {
  for (const id of LOBBY_GAME_IDS) {
    it(id, () => {
      const phases = phasesOf(id);
      // At least the waiting room, the countdown and play are reached.
      for (const phase of ['lobby', 'countdown', 'playing'] as const) expect(phases.has(phase), `${id} reached ${phase}`).toBe(true);
      for (const [phase, snapshot] of phases) {
        const rec = frame(id, snapshot);
        const where = `${id} in ${phase}`;
        expect(rec.bad, where).toEqual([]);
        expect(rec.count('save'), `${where}: save and restore balance`).toBe(rec.count('restore'));
        expect(rec.count('fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'drawImage'), `${where}: draws something`).toBeGreaterThan(0);
      }
    });
  }

  it('also draws with reduced motion on, and with no direction held', () => {
    reducedMotion(true);
    for (const id of LOBBY_GAME_IDS) {
      const snapshot = phasesOf(id).get('playing')!;
      const rec = frame(id, snapshot, { dx: 0, dy: 0 });
      expect(rec.bad, id).toEqual([]);
    }
  });
});

describe('games with stages draw every stage', () => {
  // Each is played for a while by two players who tap and press at random, and a frame is drawn every so often (the choices, the shapes on show, a turn, a result...).
  for (const id of ['simon', 'counting', 'maths', 'chain', 'pendulum', 'pit'] as const) {
    it(id, () => {
      const game = createLobbyGame(id);
      game.join('a');
      game.join('b');
      const stages = new Set<string>();
      for (let i = 0; i < 1500; i++) {
        game.tick(STEP);
        if (i % 7 === 0) {
          game.tap?.('a', i % 4);
          game.action('a', id === 'pendulum' ? 'drop' : 'dash');
          game.input('b', i % 3 === 0 ? 1 : -1, 0);
        }
        if (i % 9 !== 0) continue;
        const snapshot = JSON.parse(JSON.stringify(game.snapshot('a'))) as LobbyGameSnapshot;
        if ('stage' in snapshot) stages.add(snapshot.stage);
        const rec = frame(id, snapshot);
        expect(rec.bad, `${id} frame ${i}`).toEqual([]);
        expect(rec.count('save'), `${id} frame ${i}: save and restore balance`).toBe(rec.count('restore'));
      }
      if (id !== 'pit') expect(stages.size, `${id} stages drawn`).toBeGreaterThanOrEqual(2);
    });
  }
});
