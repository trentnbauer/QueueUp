import { describe, it, expect } from 'vitest';
import { computePlaytimeIncreases } from './playtimeTracking.js';

function owned(appId: number, minutes: number) {
  return { appId, playtimeForeverMinutes: minutes, name: `Game ${appId}` };
}

describe('computePlaytimeIncreases', () => {
  it('reports an app whose playtime rose since the last snapshot', () => {
    const result = computePlaytimeIncreases('u1', [owned(10, 120)], new Map([[10, 60]]));
    expect(result).toEqual([{ userId: 'u1', steamAppId: 10, previousMinutes: 60, currentMinutes: 120 }]);
  });

  it('does not report an app with no prior snapshot (first-ever capture)', () => {
    const result = computePlaytimeIncreases('u1', [owned(10, 120)], new Map());
    expect(result).toEqual([]);
  });

  it('does not report an app whose playtime is unchanged', () => {
    const result = computePlaytimeIncreases('u1', [owned(10, 60)], new Map([[10, 60]]));
    expect(result).toEqual([]);
  });

  it('does not report an app whose playtime went down (e.g. a Steam stat reset)', () => {
    const result = computePlaytimeIncreases('u1', [owned(10, 30)], new Map([[10, 60]]));
    expect(result).toEqual([]);
  });

  it('only reports the apps that actually increased out of a mixed library', () => {
    const result = computePlaytimeIncreases(
      'u1',
      [owned(10, 120), owned(20, 60), owned(30, 90)],
      new Map([
        [10, 60],
        [20, 60],
        [30, 45],
      ]),
    );
    expect(result.map((r) => r.steamAppId).sort()).toEqual([10, 30]);
  });
});
