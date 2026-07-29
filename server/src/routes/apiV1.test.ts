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
});
