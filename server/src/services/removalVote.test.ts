import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    roomMember: {
      findMany: vi.fn(async () => [
        { roomId: 'r1', userId: 'a' },
        { roomId: 'r1', userId: 'b' },
        { roomId: 'r1', userId: 'c' },
      ]),
    },
  },
}));

import { getRemovalInfo, removalVotesNeeded } from './removalVote.js';

describe('removalVotesNeeded', () => {
  it('is more than half of the room', () => {
    expect(removalVotesNeeded(1)).toBe(1);
    expect(removalVotesNeeded(2)).toBe(2);
    expect(removalVotesNeeded(3)).toBe(2);
    expect(removalVotesNeeded(4)).toBe(3);
    expect(removalVotesNeeded(5)).toBe(3);
  });
});

describe('getRemovalInfo', () => {
  it('counts only votes from current members and gives the shelf 0/0', async () => {
    const info = await getRemovalInfo([
      { id: 'g1', roomId: 'r1', removalVotes: [{ userId: 'a' }, { userId: 'gone' }] },
      { id: 'g2', roomId: null, removalVotes: [] },
    ]);
    expect(info.get('g1')).toEqual({ votes: 1, needed: 2 });
    expect(info.get('g2')).toEqual({ votes: 0, needed: 0 });
  });
});
