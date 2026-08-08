import { describe, it, expect } from 'vitest';
import {
  computePlaytimeIncreases,
  checkpointBaselineMinutes,
  dedupeByOwnerAndSteamApp,
  suggestsPlayingFromPlaynitePlaytimeIncrease,
} from './playtimeTracking.js';

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

describe('dedupeByOwnerAndSteamApp', () => {
  it('keeps only the first row for a repeated (owner, steamAppid) pair', () => {
    const games = [
      { id: 'a', addedBy: 'u1', steamAppid: 100 },
      { id: 'b', addedBy: 'u1', steamAppid: 100 },
    ];
    expect(dedupeByOwnerAndSteamApp(games).map((g) => g.id)).toEqual(['a']);
  });

  it('keeps rows for the same steamAppid under different owners', () => {
    const games = [
      { id: 'a', addedBy: 'u1', steamAppid: 100 },
      { id: 'b', addedBy: 'u2', steamAppid: 100 },
    ];
    expect(dedupeByOwnerAndSteamApp(games).map((g) => g.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps rows for the same owner with different steamAppids', () => {
    const games = [
      { id: 'a', addedBy: 'u1', steamAppid: 100 },
      { id: 'b', addedBy: 'u1', steamAppid: 200 },
    ];
    expect(dedupeByOwnerAndSteamApp(games).map((g) => g.id).sort()).toEqual(['a', 'b']);
  });

  it('is a no-op on an already-unique list', () => {
    const games = [
      { id: 'a', addedBy: 'u1', steamAppid: 100 },
      { id: 'b', addedBy: 'u2', steamAppid: 200 },
    ];
    expect(dedupeByOwnerAndSteamApp(games)).toEqual(games);
  });
});

describe('suggestsPlayingFromPlaynitePlaytimeIncrease', () => {
  it('is true for a backlog game whose Playnite playtime rose since the last snapshot', () => {
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('backlog', 30, 90)).toBe(true);
  });

  it('is false for a game with no prior snapshot (first-ever sync)', () => {
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('backlog', undefined, 90)).toBe(false);
  });

  it('is false when the reported minutes did not actually increase', () => {
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('backlog', 90, 90)).toBe(false);
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('backlog', 90, 60)).toBe(false);
  });

  it('is false when already Playing, Done, Dropped, or Won\'t Play', () => {
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('playing', 30, 90)).toBe(false);
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('done', 30, 90)).toBe(false);
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('dropped', 30, 90)).toBe(false);
    expect(suggestsPlayingFromPlaynitePlaytimeIncrease('wont_play', 30, 90)).toBe(false);
  });
});
