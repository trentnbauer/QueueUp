import { describe, expect, it } from 'vitest';
import type { YearInReview } from '@queueup/shared';
import { personalStoryFacts, roomStoryFacts } from './yearStoryFacts';

const year: YearInReview = {
  windowStart: '2025-10-01T00:00:00.000Z',
  windowEnd: '2026-10-01T00:00:00.000Z',
  doneCount: 3,
  steamAutoDetectedCount: 0,
  estimatedHours: 40,
  topVoted: [{ id: 'a', title: 'Hades', coverImageUrl: null, voteScore: 9 }],
  genreSpread: [
    { genre: 'Roguelike', count: 2 },
    { genre: 'Puzzle', count: 1 },
  ],
  mostTimeConsuming: [{ id: 'b', title: 'Disco Elysium', hours: 24 }],
  completedByGroup: [
    { roomId: null, roomName: null, memberNames: [], games: [{ id: 'c', title: 'Celeste' }] },
    { roomId: 'r1', roomName: 'Friday crew', memberNames: ['Alice', 'Bob'], games: [{ id: 'd', title: 'Overcooked' }, { id: 'e', title: 'Hades' }] },
  ],
  achievementsUnlocked: 4,
  rarestAchievements: [{ gameTitle: 'Celeste', achievementName: 'Farewell', globalUnlockPercent: 3, unlockedAt: '2026-01-01T00:00:00Z' }],
};

describe('personalStoryFacts', () => {
  const f = personalStoryFacts(year);

  it('carries the numbers and titles the page already shows', () => {
    expect(f.finishedCount).toBe(3);
    expect(f.estimatedHours).toBe(40);
    expect(f.finishedTitles).toEqual(['Celeste', 'Overcooked', 'Hades']);
    expect(f.longestGames).toEqual([{ title: 'Disco Elysium', hours: 24 }]);
    expect(f.rarestAchievements).toEqual([{ game: 'Celeste', name: 'Farewell' }]);
  });

  it('names rooms but never the people in them', () => {
    expect(f.rooms).toEqual([{ name: 'Friday crew', games: ['Overcooked', 'Hades'] }]);
    expect(JSON.stringify(f)).not.toMatch(/Alice|Bob/);
  });

  it('leaves hours null when nothing has a length', () => {
    expect(personalStoryFacts({ ...year, estimatedHours: 0 }).estimatedHours).toBeNull();
  });
});

describe('roomStoryFacts', () => {
  it('uses the room recap and the group size', () => {
    const f = roomStoryFacts(
      {
        windowStart: 'a',
        windowEnd: 'b',
        completedGames: [{ id: '1', title: 'Overcooked', coverImageUrl: null }],
        genreSpread: [{ genre: 'Party', count: 1 }],
        topVoted: { id: '2', title: 'Jackbox', coverImageUrl: null, voteScore: 12 },
      },
      4,
    );
    expect(f).toMatchObject({ finishedCount: 1, finishedTitles: ['Overcooked'], mostVoted: ['Jackbox'], memberCount: 4, rooms: [], longestGames: [] });
  });

  it('handles a room with no votes', () => {
    expect(roomStoryFacts({ windowStart: 'a', windowEnd: 'b', completedGames: [], genreSpread: [], topVoted: null }, 2).mostVoted).toEqual([]);
  });
});
