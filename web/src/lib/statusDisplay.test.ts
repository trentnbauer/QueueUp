import { describe, expect, it } from 'vitest';
import type { Game } from '@queueup/shared';
import { metaLine, releaseDateLabel, rowChip, STATUS_LABEL } from './gameView';
import { statusOutlineFor } from '../ui/primitives';

const game = (over: Partial<Game>): Game => ({ id: 'g', title: 'Game', status: 'backlog', votes: [], genre: null, releaseDate: null, releaseYear: null, ...over }) as Game;
const ctx = { tab: 'queue', searching: false, prereqTitle: null };

describe('metaLine', () => {
  it('puts the release year between the genre and the time to beat', () => {
    expect(metaLine(game({ genre: 'Shooter, Adventure', releaseYear: 2020 }))).toBe('Shooter · 2020');
  });

  it('leaves the year out when it is not known', () => {
    expect(metaLine(game({ genre: 'Puzzle', releaseYear: null }))).toBe('Puzzle');
  });
});

describe('releaseDateLabel', () => {
  const now = new Date('2026-10-02T00:00:00Z').getTime();

  it('says Released for a past date and Releases for an upcoming one, in UTC', () => {
    expect(releaseDateLabel({ releaseDate: '2020-03-12T00:00:00.000Z', releaseYear: 2020 }, now)).toMatch(/^Released .*2020/);
    expect(releaseDateLabel({ releaseDate: '2026-11-03T00:00:00.000Z', releaseYear: 2026 }, now)).toMatch(/^Releases .*2026/);
    // A midnight-UTC release must not slip to the previous day.
    expect(releaseDateLabel({ releaseDate: '2020-03-12T00:00:00.000Z', releaseYear: 2020 }, now)).toContain('12');
  });

  it('falls back to the year, then to nothing', () => {
    expect(releaseDateLabel({ releaseDate: null, releaseYear: 2019 }, now)).toBe('Released 2019');
    expect(releaseDateLabel({ releaseDate: null, releaseYear: null }, now)).toBe('');
  });
});

describe('rowChip status', () => {
  it('shows the status of every game in search results, since they span all statuses', () => {
    expect(rowChip(game({ status: 'backlog' }), { ...ctx, searching: true })).toBe(STATUS_LABEL.backlog);
    expect(rowChip(game({ status: 'wont_play' }), { ...ctx, searching: true })).toBe(STATUS_LABEL.wont_play);
  });

  it('shows no status chip for a plain backlog game outside search', () => {
    expect(rowChip(game({ status: 'backlog' }), ctx)).toBe('');
  });

  it('still labels paused, replay and wishlist games outside search', () => {
    expect(rowChip(game({ status: 'paused' }), { ...ctx, tab: 'playing' })).toBe(STATUS_LABEL.paused);
  });
});

describe('statusOutlineFor', () => {
  it('gives finished and on-hold statuses an emoji and colour, and nothing for the rest', () => {
    expect(statusOutlineFor('done')?.emoji).toBe('✅');
    expect(statusOutlineFor('dropped')?.emoji).toBe('👎');
    expect(statusOutlineFor('wont_play')?.emoji).toBe('🚫');
    expect(statusOutlineFor('paused')?.emoji).toBe('⏸️');
    expect(statusOutlineFor('replay')?.emoji).toBe('🔄');
    for (const s of ['backlog', 'wishlist', 'playing', 'play_next'] as const) expect(statusOutlineFor(s)).toBeNull();
  });
});
