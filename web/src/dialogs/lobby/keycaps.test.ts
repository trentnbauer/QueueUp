import { describe, expect, it } from 'vitest';
import { keycapOf } from './keycaps';

describe('keycapOf', () => {
  it('prefers Space, then an arrow, then a letter', () => {
    expect(keycapOf([' ', 'ArrowUp', 'w'])).toBe('SPACE');
    expect(keycapOf(['ArrowDown', 's'])).toBe('↓');
    expect(keycapOf(['w', 'ArrowUp'])).toBe('↑');
    expect(keycapOf(['d'])).toBe('D');
  });

  it('copes with no keys', () => {
    expect(keycapOf([])).toBe('');
  });
});
