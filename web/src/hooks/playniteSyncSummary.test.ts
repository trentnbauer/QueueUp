import { describe, it, expect } from 'vitest';
import { summarizePlayniteSyncCompletion } from './playniteSyncSummary';
import type { PlayniteImportProgress } from '@queueup/shared';

function makeProgress(overrides: Partial<PlayniteImportProgress> = {}): PlayniteImportProgress {
  return {
    startedAt: '2026-08-08T00:00:00.000Z',
    consideredCount: 0,
    matched: 0,
    unmatched: 0,
    errored: 0,
    done: true,
    ...overrides,
  };
}

describe('summarizePlayniteSyncCompletion', () => {
  it('reports nothing new when every count is zero', () => {
    expect(summarizePlayniteSyncCompletion(makeProgress())).toBe(
      'Playnite sync complete - your library is already up to date.',
    );
  });

  it('pluralizes a single synced game', () => {
    expect(summarizePlayniteSyncCompletion(makeProgress({ matched: 1 }))).toBe('Playnite sync complete: 1 game synced.');
  });

  it('reports matched counts plural', () => {
    expect(summarizePlayniteSyncCompletion(makeProgress({ matched: 12 }))).toBe('Playnite sync complete: 12 games synced.');
  });

  it('combines matched, unmatched, and errored counts', () => {
    expect(summarizePlayniteSyncCompletion(makeProgress({ matched: 5, unmatched: 2, errored: 1 }))).toBe(
      'Playnite sync complete: 5 games synced, 2 need review, 1 failed.',
    );
  });

  it('reports unmatched-only as needing review', () => {
    expect(summarizePlayniteSyncCompletion(makeProgress({ unmatched: 3 }))).toBe('Playnite sync complete: 3 need review.');
  });
});
