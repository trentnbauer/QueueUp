import { describe, expect, it } from 'vitest';
import type { Game } from '@queueup/shared';
import { backlogComparator, parseBacklogSort, toggleBacklogSort } from './backlogSort';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 4);
let n = 0;
function game(over: Partial<Game>): Game {
  n += 1;
  return { id: `g${n}`, title: `Game ${n}`, votes: [], releaseDate: null, releaseYear: null, reviewScore: null, ...over } as Game;
}
const vote = (value: number) => ({ value }) as Game['votes'][number];
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const titles = (list: Game[]) => list.map((g) => g.title);

describe('backlogComparator size (#1046)', () => {
  it('puts the smallest install first and games with no size last', () => {
    const list = [game({ title: 'Big', downloadSizeMb: 90000 }), game({ title: 'None', downloadSizeMb: null }), game({ title: 'Small', downloadSizeMb: 2000 })];
    expect(titles(list.sort(backlogComparator(['size'], NOW)))).toEqual(['Small', 'Big', 'None']);
  });
});

describe('backlogComparator', () => {
  it('"want to play" keeps the original order: fresh releases first (newest first), then votes, then title', () => {
    const a = game({ title: 'B liked', votes: [vote(5)] });
    const b = game({ title: 'A liked', votes: [vote(5)] });
    const c = game({ title: 'Fresh', releaseDate: ago(3) });
    const d = game({ title: 'Fresher', releaseDate: ago(1) });
    const e = game({ title: 'Meh', votes: [vote(1)] });
    expect(titles([e, a, b, c, d].sort(backlogComparator(['want'], NOW)))).toEqual(['Fresher', 'Fresh', 'A liked', 'B liked', 'Meh']);
  });

  it('review score sorts highest first with unrated games last', () => {
    const list = [game({ title: 'None' }), game({ title: 'Low', reviewScore: 60 }), game({ title: 'High', reviewScore: 92 })];
    expect(titles(list.sort(backlogComparator(['review'], NOW)))).toEqual(['High', 'Low', 'None']);
  });

  it('release date sorts newest first, falls back to the year, undated last', () => {
    const list = [
      game({ title: 'Undated' }),
      game({ title: 'Year only', releaseYear: 2019 }),
      game({ title: '2024', releaseDate: '2024-03-01T00:00:00.000Z', releaseYear: 2024 }),
      game({ title: '2025', releaseDate: '2025-06-01T00:00:00.000Z', releaseYear: 2025 }),
    ];
    expect(titles(list.sort(backlogComparator(['release'], NOW)))).toEqual(['2025', '2024', 'Year only', 'Undated']);
  });

  it('later keys break ties in the earlier ones', () => {
    const list = [
      game({ title: 'Old 90', reviewScore: 90, releaseYear: 2010 }),
      game({ title: 'New 90', reviewScore: 90, releaseYear: 2022 }),
      game({ title: 'New 70', reviewScore: 70, releaseYear: 2023 }),
    ];
    expect(titles([...list].sort(backlogComparator(['review', 'release'], NOW)))).toEqual(['New 90', 'Old 90', 'New 70']);
    expect(titles([...list].sort(backlogComparator(['release', 'review'], NOW)))).toEqual(['New 70', 'New 90', 'Old 90']);
  });

  it('falls back to "want to play" with no keys', () => {
    const list = [game({ title: 'Low' }), game({ title: 'Voted', votes: [vote(5)] })];
    expect(titles(list.sort(backlogComparator([], NOW)))).toEqual(['Voted', 'Low']);
  });
});

describe('toggleBacklogSort', () => {
  it('appends in pick order, removes on unpick, never leaves nothing picked', () => {
    expect(toggleBacklogSort(['want'], 'release')).toEqual(['want', 'release']);
    expect(toggleBacklogSort(['want', 'release'], 'want')).toEqual(['release']);
    expect(toggleBacklogSort(['review'], 'review')).toEqual(['want']);
  });
});

describe('parseBacklogSort', () => {
  it('keeps known keys in order and defaults otherwise', () => {
    expect(parseBacklogSort('["release","bogus","review","release"]')).toEqual(['release', 'review']);
    expect(parseBacklogSort(null)).toEqual(['want']);
    expect(parseBacklogSort('not json')).toEqual(['want']);
    expect(parseBacklogSort('[]')).toEqual(['want']);
  });
});
