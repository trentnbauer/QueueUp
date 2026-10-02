import { describe, expect, it } from 'vitest';
import { reviewAverage } from './reviewAverage.js';

describe('reviewAverage', () => {
  it('averages the scored categories only', () => {
    expect(reviewAverage({ art: 5, gameplay: 4, story: null, sound: null })).toBe(4.5);
    expect(reviewAverage({ art: 4, gameplay: 4, story: 4, sound: 5 })).toBe(4.25);
  });

  it('is null when nothing is scored', () => {
    expect(reviewAverage({ art: null, gameplay: null, story: null, sound: null })).toBeNull();
  });
});
