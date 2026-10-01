import { describe, expect, it } from 'vitest';
import type { Game } from '@queueup/shared';
import { byScore, gameScore, isNewRelease, isUpcoming, reviewAverage, voteCount } from './gameView';

const DAY = 864e5;
const NOW = new Date('2026-09-30T12:00:00Z').getTime();

function game(over: Partial<Game>): Game {
  return { id: 'g', title: 'Game', votes: [], ...over } as Game;
}
const vote = (value: number) => ({ value }) as Game['votes'][number];

describe('gameScore', () => {
  it('is the sum of (vote - 2), so a Meh costs a point and a Must adds three', () => {
    expect(gameScore(game({ votes: [vote(5), vote(4), vote(1)] }))).toBe(3 + 2 - 1);
    expect(gameScore(game({ votes: [] }))).toBe(0);
    expect(voteCount(game({ votes: [vote(2), vote(3)] }))).toBe(2);
  });

  it('byScore ranks higher scores first, then title', () => {
    const a = game({ title: 'B', votes: [vote(5)] });
    const b = game({ title: 'A', votes: [vote(5)] });
    const c = game({ title: 'C', votes: [vote(3)] });
    expect([a, c, b].sort(byScore).map((g) => g.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('release windows', () => {
  it('new = released within the last 60 days', () => {
    expect(isNewRelease(game({ releaseDate: new Date(NOW - 10 * DAY).toISOString() }), NOW)).toBe(true);
    expect(isNewRelease(game({ releaseDate: new Date(NOW - 90 * DAY).toISOString() }), NOW)).toBe(false);
    expect(isNewRelease(game({ releaseDate: new Date(NOW + 10 * DAY).toISOString() }), NOW)).toBe(false);
    expect(isNewRelease(game({ releaseDate: null }), NOW)).toBe(false);
  });

  it('upcoming = release date in the future', () => {
    expect(isUpcoming(game({ releaseDate: new Date(NOW + DAY).toISOString() }), NOW)).toBe(true);
    expect(isUpcoming(game({ releaseDate: new Date(NOW - DAY).toISOString() }), NOW)).toBe(false);
    expect(isUpcoming(game({ releaseDate: null }), NOW)).toBe(false);
  });
});

describe('reviewAverage', () => {
  it('averages only the scored categories', () => {
    expect(reviewAverage({ art: 5, gameplay: 3, story: null, sound: null })).toBe(4);
    expect(reviewAverage({ art: null, gameplay: null, story: null, sound: null })).toBeNull();
  });
});
