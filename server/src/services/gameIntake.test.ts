import { describe, it, expect } from 'vitest';
import { assertPlatformMatch } from './gameIntake.js';
import type { IgdbGameDetail } from './igdbClient.js';

function detail(platformFamilies: IgdbGameDetail['platformFamilies']): IgdbGameDetail {
  return {
    igdbId: 1,
    title: 'Some Game',
    platform: 'PC',
    platformFamilies,
    genre: null,
    coverImageUrl: null,
    steamAppId: null,
    maxCoopPlayers: null,
    releaseYear: null,
    timeToBeatHours: null,
    timeToBeatRushedHours: null,
    timeToBeatCompletionistHours: null,
    igdbCollectionId: null,
  };
}

describe('assertPlatformMatch', () => {
  it('does not throw when no platforms are given (room-less, no owned-systems opt-in)', () => {
    expect(() => assertPlatformMatch(detail(['pc']), undefined)).not.toThrow();
  });

  it('does not throw when an empty array is given (opted out / not opted in)', () => {
    expect(() => assertPlatformMatch(detail(['pc']), [])).not.toThrow();
  });

  it('does not throw when the game is on the single allowed (room) platform', () => {
    expect(() => assertPlatformMatch(detail(['xbox_one']), ['xbox_one'])).not.toThrow();
  });

  it('throws a room-flavored message when the game is not on the single allowed platform', () => {
    expect(() => assertPlatformMatch(detail(['xbox_one']), ['pc'])).toThrow(
      /isn't available on PC, and this room is limited to that platform/,
    );
  });

  it('does not throw when the game is on any of several owned platforms', () => {
    expect(() => assertPlatformMatch(detail(['switch']), ['pc', 'switch', 'xbox_one'])).not.toThrow();
  });

  it('throws an owned-systems-flavored message when the game is on none of several owned platforms', () => {
    expect(() => assertPlatformMatch(detail(['ps5']), ['pc', 'switch'])).toThrow(
      /isn't available on any of your owned systems \(PC, Switch\)/,
    );
  });

  it('matches on any overlap, not just an exact family-set match', () => {
    expect(() => assertPlatformMatch(detail(['pc', 'xbox_one']), ['xbox_one'])).not.toThrow();
  });
});
