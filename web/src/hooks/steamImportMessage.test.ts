import { describe, expect, it } from 'vitest';
import { steamImportMessage } from './steamImportMessage';

describe('steamImportMessage', () => {
  it('says nothing is new without any numbers', () => {
    expect(steamImportMessage('library', { imported: 0, skipped: 0 })).toBe('No new games in your library.');
    expect(steamImportMessage('wishlist', { imported: 0, skipped: 0, needsMatching: 0 })).toBe('No new games on your wishlist.');
  });

  it('says games were added', () => {
    expect(steamImportMessage('library', { imported: 3, skipped: 0 })).toBe('Steam sync successful - new games added to your library.');
    expect(steamImportMessage('wishlist', { imported: 1, skipped: 0 })).toBe('Steam sync successful - new games added to your wishlist.');
  });

  it('says there are new games to match when some have no automatic match', () => {
    expect(steamImportMessage('library', { imported: 0, skipped: 80, needsMatching: 80 })).toBe('Steam sync successful - new games to match.');
  });

  it('says both when some were added and some need matching', () => {
    expect(steamImportMessage('library', { imported: 2, skipped: 5, needsMatching: 5 })).toBe('Steam sync successful - new games added to your library. Some games need matching.');
  });

  it('mentions games that failed for another reason, apart from the ones to match', () => {
    expect(steamImportMessage('library', { imported: 0, skipped: 3, needsMatching: 0 })).toBe('No new games in your library. Some games could not be added.');
    expect(steamImportMessage('library', { imported: 0, skipped: 3, needsMatching: 3 })).not.toContain('could not');
  });
});
