import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeRaw = vi.fn();
const updateMany = vi.fn(async () => ({ count: 0 }));
const games: Record<string, object> = {
  src: { id: 'src', status: 'backlog', replayedAt: null, targetPrice: null, manualPrice: null, steamFullyCompleted: false, prerequisiteGameId: null, baseGameId: null, title: 'Witcher 3', coverImageUrl: null },
  tgt: { id: 'tgt', status: 'backlog', replayedAt: null, targetPrice: null, manualPrice: null, steamFullyCompleted: false, prerequisiteGameId: null, baseGameId: null, title: 'Witcher 3 Remaster', coverImageUrl: 'cover.jpg' },
};

// Every table the merge touches answers "nothing there, nothing changed"; the games are real.
function fakeTx() {
  const table = new Proxy({}, {
    get: (_t, method: string) =>
      method === 'findMany' ? async () => [] : method === 'updateMany' ? updateMany : async () => ({}),
  });
  return new Proxy({ $executeRaw: executeRaw }, {
    get: (target, name: string) => {
      if (name === '$executeRaw') return target.$executeRaw;
      if (name === 'game') {
        return { ...table, findUniqueOrThrow: async ({ where }: { where: { id: string } }) => games[where.id], updateMany, update: async () => ({}), delete: async () => ({}) };
      }
      return table;
    },
  });
}

vi.mock('../db/client.js', () => ({
  prisma: {
    game: { findFirst: async () => games.tgt },
    $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(fakeTx()),
  },
}));
vi.mock('./matchRedirects.js', () => ({ recordMatchRedirect: async () => undefined }));
vi.mock('./mergeUndo.js', () => ({ captureMergeUndo: async () => ({}), captureRematchUndo: async () => ({}), saveUndo: async () => 'undo-token' }));

import { mergeGameInto } from './gameIntake.js';

describe('merging a duplicate card (issue #850)', () => {
  beforeEach(() => executeRaw.mockClear());

  it('points the duplicate\'s play journal entries at the surviving card', async () => {
    const source = { id: 'src', roomId: null, addedBy: 'u1', igdbId: 1, title: 'Witcher 3', coverImageUrl: null };
    const result = await mergeGameInto('u1', source, 'tgt');
    expect(result).toEqual({ gameId: 'tgt', mergedFromId: 'src', undoToken: 'undo-token' });

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('UPDATE room_activity');
    expect(JSON.parse(values[0] as string)).toEqual({ gameId: 'tgt', title: 'Witcher 3 Remaster', coverImageUrl: 'cover.jpg' });
    expect(values[1]).toBe('src');
  });
});
