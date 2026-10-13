import { describe, expect, it } from 'vitest';
import {
  alertPresets,
  coopWarning,
  dlcPillTone,
  formatInstallSize,
  lowestAboveZero,
  mainPath,
  offPath,
  playersKind,
  priceModeOf,
  progressSegments,
  sessionsToFinish,
  starScore,
  statusBadge,
  verdictParts,
} from './cardLogic';

const price = (amount: string | null) => ({ amount, currency: 'USD', source: amount ? ('live' as const) : ('unavailable' as const), historicalLow: null, lastRefreshedAt: null });

describe('priceModeOf', () => {
  it('is live with a gg.deals price, manual with only a typed one, none otherwise', () => {
    expect(priceModeOf({ price: price('29.99'), manualPrice: null })).toBe('live');
    expect(priceModeOf({ price: price('29.99'), manualPrice: '10' })).toBe('live');
    expect(priceModeOf({ price: price(null), manualPrice: '24.99' })).toBe('manual');
    expect(priceModeOf({ price: price(null), manualPrice: null })).toBe('none');
  });
});

describe('starScore', () => {
  it('turns IGDB 0-100 into 0-10 to one decimal', () => {
    expect(starScore(87)).toBe('8.7');
    expect(starScore(100)).toBe('10.0');
    expect(starScore(null)).toBeNull();
  });
});

describe('formatInstallSize', () => {
  it('reads in GB from 1 GB up and in MB below, nothing when unknown', () => {
    expect(formatInstallSize(61440)).toBe('60 GB');
    expect(formatInstallSize(4608)).toBe('4.5 GB');
    expect(formatInstallSize(800)).toBe('800 MB');
    expect(formatInstallSize(null)).toBeNull();
    expect(formatInstallSize(0)).toBeNull();
  });
});

describe('playersKind', () => {
  it('prefers single-player, then the max, else nothing', () => {
    expect(playersKind({ singlePlayerOnly: true, maxCoopPlayers: 4 })).toEqual({ kind: 'solo' });
    expect(playersKind({ singlePlayerOnly: false, maxCoopPlayers: 4 })).toEqual({ kind: 'max', max: 4 });
    expect(playersKind({ singlePlayerOnly: null, maxCoopPlayers: null })).toBeNull();
  });
});

describe('sessionsToFinish', () => {
  it('rounds up and needs both numbers', () => {
    expect(sessionsToFinish(40, 5)).toEqual({ count: 8, hours: 5 });
    expect(sessionsToFinish(41, 2)).toEqual({ count: 21, hours: 2 });
    expect(sessionsToFinish(40, null)).toBeNull();
    expect(sessionsToFinish(null, 2)).toBeNull();
  });
});

describe('coopWarning', () => {
  it('warns on single-player in a group and on too many people, never on the shelf', () => {
    expect(coopWarning({ singlePlayerOnly: true, maxCoopPlayers: null }, 3, false)).toEqual({ kind: 'solo' });
    expect(coopWarning({ singlePlayerOnly: true, maxCoopPlayers: null }, 1, false)).toBeNull();
    expect(coopWarning({ singlePlayerOnly: false, maxCoopPlayers: 4 }, 5, false)).toEqual({ kind: 'over', max: 4, members: 5 });
    expect(coopWarning({ singlePlayerOnly: false, maxCoopPlayers: 4 }, 4, false)).toBeNull();
    expect(coopWarning({ singlePlayerOnly: true, maxCoopPlayers: 1 }, 5, true)).toBeNull();
  });
});

describe('verdictParts', () => {
  it('counts each value, strongest first', () => {
    expect(verdictParts([{ value: 5 }, { value: 3 }, { value: 5 }, { value: 4 }])).toEqual([
      { value: 5, count: 2 },
      { value: 4, count: 1 },
      { value: 3, count: 1 },
    ]);
    expect(verdictParts([])).toEqual([]);
  });
});

describe('status path', () => {
  it('has no Wishlist in rooms, and Won\'t Play off the path everywhere', () => {
    expect(mainPath(false)).toEqual(['backlog', 'play_next', 'playing', 'done']);
    expect(mainPath(true)[0]).toBe('wishlist');
    expect(offPath()).toEqual(['paused', 'replay', 'dropped', 'wont_play']);
  });

  it('numbers the step on the path and uses the emoji off it', () => {
    expect(statusBadge('playing', false)).toBe('3');
    expect(statusBadge('playing', true)).toBe('4');
    expect(statusBadge('dropped', false)).toBe('🛑');
  });

  it('fills the bar up to the current step, none off the path', () => {
    expect(progressSegments('play_next', false)).toEqual([true, true, false, false]);
    expect(progressSegments('paused', false)).toEqual([false, false, false, false]);
  });
});

describe('lowestAboveZero', () => {
  it('ignores free giveaways', () => {
    expect(lowestAboveZero([0, 7.49, 29.99])).toBe(7.49);
    expect(lowestAboveZero([0, 0], '12.5')).toBe(12.5);
    expect(lowestAboveZero([0, 0], '0')).toBeNull();
  });
});

describe('alertPresets', () => {
  it('offers the low, half price and anything under the current price', () => {
    expect(alertPresets(29.99, 7.49)).toEqual([
      { key: 'low', value: 7.49 },
      { key: 'half', value: 15 },
      { key: 'any', value: 29.98 },
    ]);
  });

  it('skips a low at or above the price', () => {
    expect(alertPresets(10, 10).map((p) => p.key)).toEqual(['half', 'any']);
    expect(alertPresets(10, null).map((p) => p.key)).toEqual(['half', 'any']);
  });
});

describe('dlcPillTone', () => {
  it('is mint when finished, accent while wanted or in play', () => {
    expect(dlcPillTone('done')).toBe('mint');
    expect(dlcPillTone('replay')).toBe('mint');
    expect(dlcPillTone('wishlist')).toBe('accent');
    expect(dlcPillTone('playing')).toBe('accent');
    expect(dlcPillTone('backlog')).toBe('neutral');
    expect(dlcPillTone(null)).toBe('none');
  });
});
