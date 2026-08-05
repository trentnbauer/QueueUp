import { describe, it, expect } from 'vitest';
import { diffNewReleaseWatchCandidates, formatReleaseWatchMessage, type ReleaseWatchDiscovery } from './releaseWatch.js';

describe('diffNewReleaseWatchCandidates', () => {
  const candidates = [
    { igdbId: 1, title: 'Portal' },
    { igdbId: 2, title: 'Portal 2' },
    { igdbId: 3, title: 'Portal RTX' },
  ];

  it('returns every candidate when the user owns and has been notified about none of them', () => {
    const result = diffNewReleaseWatchCandidates(candidates, 'sequel', 'Portal', new Set(), new Set());
    expect(result.map((d) => d.igdbId)).toEqual([1, 2, 3]);
  });

  it('excludes a candidate already on the user\'s Personal Shelf in any status', () => {
    const result = diffNewReleaseWatchCandidates(candidates, 'sequel', 'Portal', new Set([2]), new Set());
    expect(result.map((d) => d.igdbId)).toEqual([1, 3]);
  });

  it('excludes a candidate already notified about in a past run', () => {
    const result = diffNewReleaseWatchCandidates(candidates, 'sequel', 'Portal', new Set(), new Set([3]));
    expect(result.map((d) => d.igdbId)).toEqual([1, 2]);
  });

  it('tags every result with the given kind and sourceTitle', () => {
    const result = diffNewReleaseWatchCandidates([candidates[0]], 'dlc', 'Half-Life 2', new Set(), new Set());
    expect(result).toEqual([{ igdbId: 1, title: 'Portal', kind: 'dlc', sourceTitle: 'Half-Life 2' }]);
  });

  it('returns nothing when every candidate is already owned or already notified', () => {
    const result = diffNewReleaseWatchCandidates(candidates, 'sequel', 'Portal', new Set([1]), new Set([2, 3]));
    expect(result).toEqual([]);
  });
});

describe('formatReleaseWatchMessage', () => {
  function discovery(overrides: Partial<ReleaseWatchDiscovery> = {}): ReleaseWatchDiscovery {
    return { igdbId: 1, title: 'Portal 2', kind: 'sequel', sourceTitle: 'Portal', ...overrides };
  }

  it('names the single title and its source game for one discovery', () => {
    expect(formatReleaseWatchMessage([discovery()])).toBe('A new release showed up for "Portal": "Portal 2"');
  });

  it('uses DLC-flavored wording for a single dlc discovery', () => {
    expect(formatReleaseWatchMessage([discovery({ kind: 'dlc', title: 'Episode One', sourceTitle: 'Half-Life 2' })])).toBe(
      'New DLC showed up for "Half-Life 2": "Episode One"',
    );
  });

  it('lists every title up to the cap for a handful of discoveries', () => {
    const discoveries = [discovery({ igdbId: 1, title: 'A' }), discovery({ igdbId: 2, title: 'B' }), discovery({ igdbId: 3, title: 'C' })];
    expect(formatReleaseWatchMessage(discoveries)).toBe('3 new releases showed up for games you\'ve beaten: "A", "B", "C"');
  });

  it('truncates with a "+N more" tail beyond the title cap', () => {
    const discoveries = [1, 2, 3, 4, 5].map((n) => discovery({ igdbId: n, title: `Game ${n}` }));
    expect(formatReleaseWatchMessage(discoveries)).toBe(
      '5 new releases showed up for games you\'ve beaten: "Game 1", "Game 2", "Game 3", and 2 more',
    );
  });
});
