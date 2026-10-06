import { describe, expect, it } from 'vitest';
import { memoryVerdict } from './SystemRequirements';

describe('memoryVerdict', () => {
  it('compares the person\'s memory with what the game lists', () => {
    expect(memoryVerdict(16, 8)).toBe('ok');
    expect(memoryVerdict(8, 8)).toBe('ok');
    expect(memoryVerdict(4, 8)).toBe('low');
  });

  it('says nothing when either side is unknown', () => {
    expect(memoryVerdict(null, 8)).toBeNull();
    expect(memoryVerdict(16, null)).toBeNull();
  });
});
