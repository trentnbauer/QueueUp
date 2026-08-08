import { describe, it, expect } from 'vitest';
import { isCompletionSuggestionEligible } from './playniteCompletionSuggestions.js';

describe('isCompletionSuggestionEligible', () => {
  it('is true for a game still worth suggesting Done for', () => {
    expect(isCompletionSuggestionEligible('backlog')).toBe(true);
    expect(isCompletionSuggestionEligible('playing')).toBe(true);
    expect(isCompletionSuggestionEligible('wishlist')).toBe(true);
    expect(isCompletionSuggestionEligible('play_next')).toBe(true);
  });

  it('is false once a call has already been made on the game (Done/Dropped/Replay/Won\'t Play)', () => {
    expect(isCompletionSuggestionEligible('done')).toBe(false);
    expect(isCompletionSuggestionEligible('dropped')).toBe(false);
    expect(isCompletionSuggestionEligible('replay')).toBe(false);
    expect(isCompletionSuggestionEligible('wont_play')).toBe(false);
  });
});
