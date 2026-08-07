import { describe, it, expect } from 'vitest';
import { computePlaytimeIncreases, checkpointBaselineMinutes } from './playtimeTracking.js';

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

describe('checkpointBaselineMinutes', () => {
  it('falls back to initialMinutes for a game with no PlayLog entry at all', () => {
    expect(checkpointBaselineMinutes(undefined, 500)).toBe(500);
  });

  it('uses startPlaytimeMinutes for a still-open (Playing) entry, ignoring initialMinutes', () => {
    const entry = { finishedAt: null, startPlaytimeMinutes: 120, finishPlaytimeMinutes: null };
    expect(checkpointBaselineMinutes(entry, 500)).toBe(120);
  });

  it('uses finishPlaytimeMinutes for a closed entry, not its start value', () => {
    const entry = { finishedAt: new Date(), startPlaytimeMinutes: 60, finishPlaytimeMinutes: 300 };
    expect(checkpointBaselineMinutes(entry, 500)).toBe(300);
  });

  it('falls back to initialMinutes when the relevant field is null (entry predates playtime tracking)', () => {
    const openWithNoStart = { finishedAt: null, startPlaytimeMinutes: null, finishPlaytimeMinutes: null };
    expect(checkpointBaselineMinutes(openWithNoStart, 500)).toBe(500);

    const closedWithNoFinish = { finishedAt: new Date(), startPlaytimeMinutes: 60, finishPlaytimeMinutes: null };
    expect(checkpointBaselineMinutes(closedWithNoFinish, 500)).toBe(500);
  });
});
