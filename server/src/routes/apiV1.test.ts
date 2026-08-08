import { describe, it, expect } from 'vitest';
import { dedupeImportEntries } from './apiV1.js';
import type { LibraryImportEntry } from '@queueup/shared';

describe('dedupeImportEntries', () => {
  it('leaves distinct titles alone', () => {
    const result = dedupeImportEntries([
      { title: 'A Short Hike', platforms: ['switch'] },
      { title: 'A Way Out', platforms: ['pc'] },
    ]);
    expect(result).toEqual([
      { title: 'A Short Hike', platforms: ['switch'] },
      { title: 'A Way Out', platforms: ['pc'] },
    ]);
  });

  it('unions platforms for duplicate titles instead of dropping the union', () => {
    const result = dedupeImportEntries([
      { title: 'A Way Out', platforms: ['pc'] },
      { title: 'A Way Out', platforms: ['ps4'] },
    ]);
    expect(result).toEqual([{ title: 'A Way Out', platforms: ['pc', 'ps4'] }]);
  });

  it('dedupes a platform listed twice for the same title', () => {
    const result = dedupeImportEntries([
      { title: 'A Way Out', platforms: ['pc'] },
      { title: 'A Way Out', platforms: ['pc', 'ps4'] },
    ]);
    expect(result).toEqual([{ title: 'A Way Out', platforms: ['pc', 'ps4'] }]);
  });

  it('trims whitespace and treats the trimmed form as the dedup key', () => {
    const result = dedupeImportEntries([
      { title: 'A Way Out', platforms: ['pc'] },
      { title: '  A Way Out  ', platforms: ['ps4'] },
    ]);
    expect(result).toEqual([{ title: 'A Way Out', platforms: ['pc', 'ps4'] }]);
  });

  it('drops entries with a blank or whitespace-only title', () => {
    const result = dedupeImportEntries([
      { title: '', platforms: ['pc'] },
      { title: '   ', platforms: ['pc'] },
      { title: 'Real Game', platforms: ['pc'] },
    ]);
    expect(result).toEqual([{ title: 'Real Game', platforms: ['pc'] }]);
  });

  it('treats a missing platforms array as empty rather than throwing', () => {
    const result = dedupeImportEntries([{ title: 'No Platforms Given' } as LibraryImportEntry]);
    expect(result).toEqual([{ title: 'No Platforms Given', platforms: [] }]);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeImportEntries([])).toEqual([]);
  });

  it('carries an entry\'s playtimeMinutes/isCompleted through untouched (issue #577)', () => {
    const result = dedupeImportEntries([{ title: 'Hades', platforms: ['pc'], playtimeMinutes: 120, isCompleted: true }]);
    expect(result).toEqual([{ title: 'Hades', platforms: ['pc'], playtimeMinutes: 120, isCompleted: true }]);
  });

  it('omits playtimeMinutes/isCompleted entirely when no duplicate reported either (issue #577)', () => {
    const result = dedupeImportEntries([{ title: 'Hades', platforms: ['pc'] }]);
    expect(result).toEqual([{ title: 'Hades', platforms: ['pc'] }]);
    expect(result[0]).not.toHaveProperty('playtimeMinutes');
    expect(result[0]).not.toHaveProperty('isCompleted');
  });

  it('takes the higher playtimeMinutes across duplicate titles (issue #577)', () => {
    const result = dedupeImportEntries([
      { title: 'Hades', platforms: ['pc'], playtimeMinutes: 60 },
      { title: 'Hades', platforms: ['switch'], playtimeMinutes: 180 },
    ]);
    expect(result).toEqual([{ title: 'Hades', platforms: ['pc', 'switch'], playtimeMinutes: 180 }]);
  });

  it('OR-combines isCompleted across duplicate titles rather than letting a false overwrite a true (issue #577)', () => {
    const result = dedupeImportEntries([
      { title: 'Hades', platforms: ['pc'], isCompleted: true },
      { title: 'Hades', platforms: ['switch'], isCompleted: false },
    ]);
    expect(result).toEqual([{ title: 'Hades', platforms: ['pc', 'switch'], isCompleted: true }]);
  });
});
