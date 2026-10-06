import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  gameCount: vi.fn(),
  reviewFind: vi.fn(),
  friendFind: vi.fn(),
  keyFind: vi.fn(),
  mergeFind: vi.fn(),
  badgeCreate: vi.fn(),
  gameFirst: vi.fn(),
  userFind: vi.fn(),
  aiFind: vi.fn(),
  usedKeyFind: vi.fn(),
  roomFirst: vi.fn(),
  prefFirst: vi.fn(),
  specsFind: vi.fn(),
}));
vi.mock('../db/client.js', () => ({
  prisma: {
    game: { count: m.gameCount, findFirst: m.gameFirst },
    user: { findUnique: m.userFind },
    userAiSettings: { findUnique: m.aiFind },
    room: { findFirst: m.roomFirst },
    notificationPreference: { findFirst: m.prefFirst },
    userComputerSpecs: { findUnique: m.specsFind },
    gameReview: { findFirst: m.reviewFind },
    friendship: { findFirst: m.friendFind },
    apiKey: { findFirst: (args: { where: { lastUsedAt?: unknown } }) => (args.where.lastUsedAt ? m.usedKeyFind() : m.keyFind()) },
    duplicateMergeVote: { findFirst: m.mergeFind },
    userBadge: { create: m.badgeCreate, count: vi.fn().mockResolvedValue(0) },
  },
}));

import { activityBadgeKeys, featureBadgeKeys, unlockActivityBadges } from './badges.js';

/** shelf size, then Beaten count (the two game counts, in the order they are asked). */
function counts(shelf: number, beaten: number) {
  m.gameCount.mockImplementation(async (args: { where: { status?: string } }) => (args.where.status === 'done' ? beaten : shelf));
}

beforeEach(() => {
  vi.clearAllMocks();
  counts(0, 0);
  for (const f of [m.reviewFind, m.friendFind, m.keyFind, m.mergeFind]) f.mockResolvedValue(null);
  m.badgeCreate.mockResolvedValue({});
  for (const f of [m.gameFirst, m.aiFind, m.usedKeyFind, m.roomFirst, m.prefFirst, m.specsFind]) f.mockResolvedValue(null);
  m.userFind.mockResolvedValue({ profileSlug: null });
});

describe('activityBadgeKeys', () => {
  it('earns nothing on an empty account', async () => {
    expect(await activityBadgeKeys('u1')).toEqual([]);
  });

  it('earns shelf-size badges at 25, 100 and 500 games, cumulatively', async () => {
    counts(24, 0);
    expect(await activityBadgeKeys('u1')).toEqual([]);
    counts(25, 0);
    expect(await activityBadgeKeys('u1')).toEqual(['shelf_25']);
    counts(100, 0);
    expect(await activityBadgeKeys('u1')).toEqual(['shelf_25', 'shelf_100']);
    counts(500, 0);
    expect(await activityBadgeKeys('u1')).toEqual(['shelf_25', 'shelf_100', 'shelf_500']);
  });

  it('earns Beaten-count badges at 10, 50 and 100', async () => {
    counts(0, 9);
    expect(await activityBadgeKeys('u1')).toEqual([]);
    counts(0, 50);
    expect(await activityBadgeKeys('u1')).toEqual(['beaten_10', 'beaten_50']);
    counts(0, 100);
    expect(await activityBadgeKeys('u1')).toEqual(['beaten_10', 'beaten_50', 'beaten_100']);
  });

  it('earns the once-only badges from having a review, friend, API key and merge', async () => {
    m.reviewFind.mockResolvedValue({ gameId: 'g' });
    m.friendFind.mockResolvedValue({ id: 'f' });
    m.keyFind.mockResolvedValue({ id: 'k' });
    m.mergeFind.mockResolvedValue({ igdbIdLow: 1 });
    expect(await activityBadgeKeys('u1')).toEqual(['first_review', 'first_friend', 'first_api_key', 'first_merge']);
  });

  it('counts only a person\'s own, live Personal Shelf games', async () => {
    await activityBadgeKeys('u1');
    expect(m.gameCount).toHaveBeenCalledWith({ where: { roomId: null, addedBy: 'u1', archivedAt: null } });
    expect(m.gameCount).toHaveBeenCalledWith({ where: { roomId: null, addedBy: 'u1', status: 'done' } });
  });
});

describe('unlockActivityBadges', () => {
  it('returns the badges it newly unlocked', async () => {
    counts(30, 0);
    const out = await unlockActivityBadges('u1');
    expect(out.map((b) => b.key)).toEqual(['shelf_25']);
  });

  it('never throws, so a badge cannot break the action that triggered it', async () => {
    m.gameCount.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await unlockActivityBadges('u1')).toEqual([]);
  });
});

describe('featureBadgeKeys', () => {
  it('earns nothing for someone who has not used the advanced features', async () => {
    expect(await featureBadgeKeys('u1')).toEqual([]);
  });

  it('earns each badge from what is on file', async () => {
    m.gameFirst.mockResolvedValue({ id: 'g' });
    m.userFind.mockResolvedValue({ profileSlug: 'trent' });
    m.aiFind.mockResolvedValue({ fallbacksEncrypted: 'sealed' });
    m.usedKeyFind.mockResolvedValue({ id: 'k' });
    m.roomFirst.mockResolvedValue({ id: 'r' });
    m.prefFirst.mockResolvedValue({ type: 'price_drop' });
    m.specsFind.mockResolvedValue({ userId: 'u1' });
    expect(await featureBadgeKeys('u1')).toEqual([
      'first_hidden_game',
      'first_price_alert',
      'first_profile_link',
      'first_own_ai',
      'first_ai_backup',
      'first_api_key_used',
      'first_discord_webhook',
      'first_email_alert',
      'first_computer_specs',
    ]);
  });

  it('gives Bring Your Own AI without Safety Net when there is no backup', async () => {
    m.aiFind.mockResolvedValue({ fallbacksEncrypted: null });
    expect(await featureBadgeKeys('u1')).toEqual(['first_own_ai']);
  });

  it('only counts a key that has actually been used, and a Discord webhook on a room the person runs', async () => {
    await featureBadgeKeys('u1');
    expect(m.usedKeyFind).toHaveBeenCalled();
    expect(m.roomFirst.mock.calls[0][0].where).toMatchObject({ members: { some: { userId: 'u1', role: 'room_master' } } });
  });
});
