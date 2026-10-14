import { describe, expect, it } from 'vitest';
import { whenKey } from './scoreText';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('whenKey', () => {
  it('says how long ago a run was', () => {
    expect(whenKey(ago(10_000), NOW).key).toBe('games.when.now');
    expect(whenKey(ago(5 * 60_000), NOW)).toEqual({ key: 'games.when.minutes', values: { n: 5 } });
    expect(whenKey(ago(3 * 3_600_000), NOW)).toEqual({ key: 'games.when.hours', values: { n: 3 } });
    expect(whenKey(ago(30 * 3_600_000), NOW).key).toBe('games.when.yesterday');
    expect(whenKey(ago(4 * 86_400_000), NOW)).toEqual({ key: 'games.when.days', values: { n: 4 } });
  });
});
