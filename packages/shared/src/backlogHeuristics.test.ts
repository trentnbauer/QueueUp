import { describe, it, expect } from 'vitest';
import {
  NEGLECTED_BACKLOG_MONTHS,
  isNeglectedBacklogGame,
  NEGLECTED_WISHLIST_MONTHS,
  isStaleWishlistGame,
  collectionProgress,
} from './backlogHeuristics.js';

describe('isNeglectedBacklogGame', () => {
  const now = new Date('2026-08-04T00:00:00.000Z').getTime();

  it('is false for a non-backlog game regardless of age', () => {
    expect(isNeglectedBacklogGame({ status: 'wishlist', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });

  it(`is false for a backlog game added less than ${NEGLECTED_BACKLOG_MONTHS} months ago`, () => {
    expect(isNeglectedBacklogGame({ status: 'backlog', createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });

  it(`is true for a backlog game added ${NEGLECTED_BACKLOG_MONTHS}+ months ago with no updates or votes since`, () => {
    expect(isNeglectedBacklogGame({ status: 'backlog', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(
      true,
    );
  });

  it('is false when updatedAt is recent even if createdAt is old', () => {
    expect(isNeglectedBacklogGame({ status: 'backlog', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });

  it('is false when a vote landed recently, even with no other recent activity', () => {
    expect(
      isNeglectedBacklogGame(
        {
          status: 'backlog',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          votes: [{ createdAt: '2026-08-01T00:00:00.000Z' }],
        },
        now,
      ),
    ).toBe(false);
  });

  it('treats an omitted votes array the same as an empty one', () => {
    expect(isNeglectedBacklogGame({ status: 'backlog', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(
      true,
    );
  });
});

describe('isStaleWishlistGame', () => {
  const now = new Date('2026-08-04T00:00:00.000Z').getTime();

  it('is false for a non-wishlist game regardless of age', () => {
    expect(isStaleWishlistGame({ status: 'backlog', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });

  it(`is false for a wishlist game added less than ${NEGLECTED_WISHLIST_MONTHS} months ago`, () => {
    expect(isStaleWishlistGame({ status: 'wishlist', createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });

  it(`is true for a wishlist game added ${NEGLECTED_WISHLIST_MONTHS}+ months ago with no updates or votes since`, () => {
    expect(isStaleWishlistGame({ status: 'wishlist', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(
      true,
    );
  });

  it('is false when updatedAt is recent even if createdAt is old', () => {
    expect(isStaleWishlistGame({ status: 'wishlist', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }, now)).toBe(
      false,
    );
  });

  it('is false when a vote landed recently, even with no other recent activity', () => {
    expect(
      isStaleWishlistGame(
        {
          status: 'wishlist',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          votes: [{ createdAt: '2026-08-01T00:00:00.000Z' }],
        },
        now,
      ),
    ).toBe(false);
  });

  it('treats an omitted votes array the same as an empty one', () => {
    expect(isStaleWishlistGame({ status: 'wishlist', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(
      true,
    );
  });
});

describe('collectionProgress', () => {
  it('is null when the game has no igdbCollectionId', () => {
    expect(collectionProgress({ igdbCollectionId: null, status: 'backlog' }, [{ igdbCollectionId: null, status: 'backlog' }])).toBeNull();
  });

  it('is null when it is the only entry from its collection', () => {
    const solo = { igdbCollectionId: 5, status: 'backlog' as const };
    expect(collectionProgress(solo, [solo])).toBeNull();
  });

  it('counts beaten vs total across every entry sharing the same collection', () => {
    const games = [
      { igdbCollectionId: 5, status: 'done' as const },
      { igdbCollectionId: 5, status: 'backlog' as const },
      { igdbCollectionId: 5, status: 'wishlist' as const },
      { igdbCollectionId: 9, status: 'done' as const }, // different collection, ignored
    ];
    expect(collectionProgress(games[1], games)).toEqual({ beaten: 1, total: 3 });
  });
});
