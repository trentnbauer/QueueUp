import { describe, expect, it } from 'vitest';
import { parseConsent } from './analyticsConsent.js';

describe('parseConsent', () => {
  it('accepts only the two answers, anything else is "no answer"', () => {
    expect(parseConsent('granted')).toBe('granted');
    expect(parseConsent('denied')).toBe('denied');
    for (const v of [null, undefined, '', 'yes', true, 1, 'GRANTED']) expect(parseConsent(v)).toBeNull();
  });
});
