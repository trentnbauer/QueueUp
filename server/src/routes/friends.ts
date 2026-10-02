import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  BADGE_DEFINITIONS,
  type BadgeKey,
  type FriendActivityEntry,
  type FriendActivityPage,
  type FriendEventKind,
  type FriendProfile,
  type FriendRequestDto,
  type FriendsResponse,
  type FriendSummary,
  type FriendUser,
  type GameReview,
  type SendFriendRequestRequest,
} from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { decodeActivityCursor, encodeActivityCursor } from '../services/roomActivity.js';
import { areFriends, friendIdsOf } from '../services/friendships.js';
import { env } from '../config/env.js';

const FEED_PAGE_SIZE = 30;

const userSelect = { id: true, displayName: true, avatarColor: true, avatarUrl: true } as const;

function toFriendUser(u: { id: string; displayName: string; avatarColor: string; avatarUrl: string | null }): FriendUser {
  return { id: u.id, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl };
}

/** Friend codes avoid look-alike characters (0/O, 1/I) since people type them in by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateFriendCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Accepts a request only if it's still pending, so one that was cancelled or declined in the
 * meantime isn't resurrected (or thrown on). Returns whether this call accepted it. */
async function acceptPending(id: string): Promise<boolean> {
  const { count } = await prisma.friendship.updateMany({ where: { id, status: 'pending' }, data: { status: 'accepted', respondedAt: new Date() } });
  return count > 0;
}

/** A friend code (and the link built from it) is only good for this long, then it's replaced. */
export const FRIEND_CODE_TTL_MS = 3 * 60 * 60 * 1000;

/** The user's current friend code, replaced with a fresh one when missing or older than the TTL
 * (codes issued before rotation existed have no issue time, so they rotate on first read). */
async function ensureFriendCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { friendCode: true, friendCodeIssuedAt: true } });
  if (existing.friendCode && existing.friendCodeIssuedAt && Date.now() - existing.friendCodeIssuedAt.getTime() < FRIEND_CODE_TTL_MS) {
    return { code: existing.friendCode, expiresAt: new Date(existing.friendCodeIssuedAt.getTime() + FRIEND_CODE_TTL_MS) };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateFriendCode();
    const issuedAt = new Date();
    try {
      await prisma.user.update({ where: { id: userId }, data: { friendCode: code, friendCodeIssuedAt: issuedAt } });
      return { code, expiresAt: new Date(issuedAt.getTime() + FRIEND_CODE_TTL_MS) };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }
  throw new HttpError(500, 'Could not generate a friend code');
}

async function sharedRoomCounts(userId: string, otherIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (otherIds.length === 0) return out;
  const mine = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
  const roomIds = mine.map((m) => m.roomId);
  if (roomIds.length === 0) return out;
  const rows = await prisma.roomMember.groupBy({
    by: ['userId'],
    where: { roomId: { in: roomIds }, userId: { in: otherIds } },
    _count: { roomId: true },
  });
  for (const r of rows) out.set(r.userId, r._count.roomId);
  return out;
}

interface ShelfPayload {
  gameId?: string;
  title?: string;
  coverImageUrl?: string | null;
  status?: string;
  review?: GameReview | null;
}

function kindFor(type: string, status: string | undefined): FriendEventKind | null {
  if (type === 'game_added') return status === 'wishlist' ? 'wishlist' : 'added';
  if (type === 'status_changed') {
    if (status === 'playing') return 'playing';
    if (status === 'done') return 'beaten';
    if (status === 'dropped') return 'dropped';
  }
  return null;
}

/** Builds feed entries for the given users - their non-hidden Personal Shelf game events plus
 * badges they've unlocked - newest first. `viewerId`'s own hidden games are still included, flagged
 * `onlyYou`. */
/** Fills in each entry's reaction summaries (one query for the whole page). */
async function attachReactions(entries: FriendActivityEntry[], viewerId: string): Promise<void> {
  if (entries.length === 0) return;
  const rows = await prisma.feedReaction.findMany({
    where: { entryId: { in: entries.map((e) => e.id) } },
    select: { entryId: true, userId: true, emoji: true, user: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  // Name only the reactors the viewer is friends with; everyone else is just part of the count.
  const friendIds = new Set(await friendIdsOf(viewerId));
  for (const e of entries) {
    const byEmoji = new Map<string, { count: number; mine: boolean; names: string[] }>();
    for (const r of rows) {
      if (r.entryId !== e.id) continue;
      const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false, names: [] };
      cur.count += 1;
      if (r.userId === viewerId) cur.mine = true;
      else if (friendIds.has(r.userId)) cur.names.push(r.user.displayName);
      byEmoji.set(r.emoji, cur);
    }
    e.reactions = [...byEmoji].map(([emoji, v]) => ({ emoji, ...v })).sort((a, b) => b.count - a.count);
  }
}

async function buildFeed(
  viewerId: string,
  userIds: string[],
  options: { before?: { createdAt: Date; id: string }; take: number; kinds?: FriendEventKind[] },
): Promise<FriendActivityEntry[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: userSelect });
  const userById = new Map(users.map((u) => [u.id, toFriendUser(u)]));

  const { before } = options;
  const rows = await prisma.roomActivity.findMany({
    where: {
      recipientId: { in: userIds },
      type: { in: ['game_added', 'status_changed'] },
      payload: { not: Prisma.DbNull },
      ...(before
        ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.take * 2,
  });

  const gameIds = [...new Set(rows.map((r) => (r.payload as ShelfPayload | null)?.gameId).filter((id): id is string => !!id))];
  // A feed row's payload is a snapshot, not a link to the game - once the game is deleted there is
  // no hiddenFromOthers flag left to check, so a removed game counts as hidden (otherwise deleting a
  // hidden game would publish it to friends).
  const visibleIds = new Set(
    (await prisma.game.findMany({ where: { id: { in: gameIds }, hiddenFromOthers: false }, select: { id: true } })).map((g) => g.id),
  );

  const entries: FriendActivityEntry[] = [];
  for (const r of rows) {
    const payload = r.payload as ShelfPayload | null;
    const user = r.recipientId ? userById.get(r.recipientId) : undefined;
    if (!payload || !user || !payload.title) continue;
    const kind = kindFor(r.type, payload.status);
    if (!kind) continue;
    const hidden = !!payload.gameId && !visibleIds.has(payload.gameId);
    if (hidden && user.id !== viewerId) continue;
    entries.push({
      id: r.id,
      user,
      kind,
      title: payload.title,
      emoji: null,
      coverImageUrl: payload.coverImageUrl ?? null,
      at: r.createdAt.toISOString(),
      review: kind === 'beaten' ? (payload.review ?? null) : null,
      onlyYou: hidden,
      reactions: [],
    });
  }

  // Badges have no hidden-game tie - they show for everyone.
  const badgeRows = await prisma.userBadge.findMany({
    where: {
      userId: { in: userIds },
      ...(before ? { createdAt: { lt: before.createdAt } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.take,
  });
  for (const b of badgeRows) {
    const def = BADGE_DEFINITIONS[b.badgeKey as BadgeKey];
    const user = userById.get(b.userId);
    if (!def || !user) continue;
    entries.push({
      // No underscores: the paging cursor (`${iso}_${id}`) splits on the last one.
      id: `badge:${b.userId}:${b.badgeKey.replace(/_/g, '-')}`,
      user,
      kind: 'ach',
      title: def.name,
      emoji: def.emoji,
      coverImageUrl: null,
      at: b.createdAt.toISOString(),
      review: null,
      onlyYou: false,
      reactions: [],
    });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  const filtered = options.kinds && options.kinds.length ? entries.filter((e) => options.kinds!.includes(e.kind)) : entries;
  const page = filtered.slice(0, options.take);
  await attachReactions(page, viewerId);
  return page;
}

export default async function friendRoutes(app: FastifyInstance) {
  app.get('/api/friends', async (request) => {
    const userId = await request.requireAuth();
    const { code: myCode, expiresAt: myCodeExpiresAt } = await ensureFriendCode(userId);

    const rows = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
    });

    // On a private instance everyone is a friend: list every other user (since = account creation)
    // and ignore requests entirely.
    const privateUsers = env.PRIVATE_INSTANCE
      ? await prisma.user.findMany({ where: { id: { not: userId } }, select: { ...userSelect, createdAt: true } })
      : [];
    const accepted = env.PRIVATE_INSTANCE ? [] : rows.filter((r) => r.status === 'accepted');
    const friendIds = env.PRIVATE_INSTANCE
      ? privateUsers.map((u) => u.id)
      : accepted.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
    const incomingRows = env.PRIVATE_INSTANCE ? [] : rows.filter((r) => r.status === 'pending' && r.addresseeId === userId);
    const outgoingRows = env.PRIVATE_INSTANCE ? [] : rows.filter((r) => r.status === 'pending' && r.requesterId === userId);
    const shared = await sharedRoomCounts(userId, [...friendIds, ...incomingRows.map((r) => r.requesterId)]);

    const [beatenGroups, badgeGroups, feed] = await Promise.all([
      prisma.game.groupBy({
        by: ['addedBy'],
        where: { roomId: null, addedBy: { in: friendIds }, status: { in: ['done', 'replay'] }, hiddenFromOthers: false },
        _count: { _all: true },
      }),
      prisma.userBadge.groupBy({ by: ['userId'], where: { userId: { in: friendIds } }, _count: { _all: true } }),
      friendIds.length ? buildFeed(userId, friendIds, { take: 200 }) : Promise.resolve([] as FriendActivityEntry[]),
    ]);
    const beatenBy = new Map(beatenGroups.map((g) => [g.addedBy, g._count._all]));
    const badgesBy = new Map(badgeGroups.map((g) => [g.userId, g._count._all]));
    const lastBy = new Map<string, FriendActivityEntry>();
    for (const e of feed) if (!lastBy.has(e.user.id)) lastBy.set(e.user.id, e);

    const summarize = (other: { id: string; displayName: string; avatarColor: string; avatarUrl: string | null }, since: Date): FriendSummary => {
      const last = lastBy.get(other.id);
      return {
        ...toFriendUser(other),
        since: since.toISOString(),
        beatenCount: beatenBy.get(other.id) ?? 0,
        achievementCount: badgesBy.get(other.id) ?? 0,
        sharedRoomCount: shared.get(other.id) ?? 0,
        lastEvent: last ? { kind: last.kind, title: last.title, at: last.at } : null,
      };
    };
    const friends: FriendSummary[] = env.PRIVATE_INSTANCE
      ? privateUsers.map((u) => summarize(u, u.createdAt))
      : accepted.map((r) => summarize(r.requesterId === userId ? r.addressee : r.requester, r.respondedAt ?? r.createdAt));
    friends.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const toRequest = (r: (typeof rows)[number], other: typeof r.requester): FriendRequestDto => ({
      id: r.id,
      user: toFriendUser(other),
      createdAt: r.createdAt.toISOString(),
      sharedRoomCount: shared.get(other.id) ?? 0,
    });

    const response: FriendsResponse = {
      myCode,
      myCodeExpiresAt: myCodeExpiresAt.toISOString(),
      privateInstance: env.PRIVATE_INSTANCE,
      friends,
      incoming: incomingRows.map((r) => toRequest(r, r.requester)),
      outgoing: outgoingRows.map((r) => toRequest(r, r.addressee)),
    };
    return response;
  });

  app.post<{ Body: SendFriendRequestRequest }>(
    '/api/friends/requests',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request) => {
      const userId = await request.requireAuth();
      if (env.PRIVATE_INSTANCE) throw new HttpError(409, 'Everyone on this server is already a friend');
      let target;
      let viaCode = false;
      if (request.body?.userId) {
        // From a room's member list or a profile page. User ids are unguessable, and the endpoint
        // is rate limited, so anyone you can reach this way can be sent a request.
        const targetId = request.body.userId;
        if (typeof targetId !== 'string') throw new HttpError(400, 'A user id is required');
        target = await prisma.user.findUnique({ where: { id: targetId }, select: userSelect });
        if (!target) throw new HttpError(404, 'User not found');
      } else {
        const code = String(request.body?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 8) throw new HttpError(400, 'That friend code does not look right');
        const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
        const owner = await prisma.user.findUnique({ where: { friendCode: formatted }, select: { ...userSelect, friendCodeIssuedAt: true } });
        if (!owner) throw new HttpError(404, 'No one has that friend code');
        if (!owner.friendCodeIssuedAt || Date.now() - owner.friendCodeIssuedAt.getTime() >= FRIEND_CODE_TTL_MS) {
          throw new HttpError(410, 'That friend code has expired - ask for a new one');
        }
        target = owner;
        // Using someone's current code (or link) is their say-so: you become friends straight away.
        viaCode = true;
      }
      if (target.id === userId) throw new HttpError(400, "That's your own friend code");

      const existing = await prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: userId, addresseeId: target.id },
            { requesterId: target.id, addresseeId: userId },
          ],
        },
      });
      if (existing) {
        if (existing.status === 'accepted') throw new HttpError(409, `You and ${target.displayName} are already friends`);
        // Using their current code is their say-so, so it settles a request we'd already sent.
        if (existing.requesterId === userId && !viaCode) throw new HttpError(409, 'Request already sent');
        // They already asked us (or we asked and now hold their code) - same as accepting.
        await acceptPending(existing.id);
        return { accepted: true, user: toFriendUser(target) };
      }
      try {
        await prisma.friendship.create({
          data: { requesterId: userId, addresseeId: target.id, ...(viaCode && { status: 'accepted' as const, respondedAt: new Date() }) },
        });
      } catch (err) {
        // The same request landed twice at once (double-click, two tabs): the unique pair already
        // exists, so settle it instead of surfacing a 500.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        const raced = await prisma.friendship.findFirst({ where: { requesterId: userId, addresseeId: target.id } });
        if (viaCode && raced) await acceptPending(raced.id);
        else if (!raced) throw err;
        else throw new HttpError(409, 'Request already sent');
        return { accepted: true, user: toFriendUser(target) };
      }
      if (viaCode) return { accepted: true, user: toFriendUser(target) };
      // We and they may have asked each other at the same moment, leaving a request in each
      // direction. If theirs is there, take it and drop ours so we end up friends, not stuck.
      const theirs = await prisma.friendship.findFirst({ where: { requesterId: target.id, addresseeId: userId, status: 'pending' } });
      if (theirs) {
        await acceptPending(theirs.id);
        await prisma.friendship.deleteMany({ where: { requesterId: userId, addresseeId: target.id, status: 'pending' } });
        return { accepted: true, user: toFriendUser(target) };
      }
      return { accepted: false, user: toFriendUser(target) };
    },
  );

  app.post<{ Params: { id: string } }>('/api/friends/requests/:id/accept', async (request) => {
    const userId = await request.requireAuth();
    const req = await prisma.friendship.findUnique({ where: { id: request.params.id } });
    if (!req || req.addresseeId !== userId || req.status !== 'pending') throw new HttpError(404, 'Request not found');
    if (!(await acceptPending(req.id))) throw new HttpError(404, 'Request not found');
    return { ok: true };
  });

  // Decline (as the addressee) and cancel (as the requester) are the same operation.
  app.delete<{ Params: { id: string } }>('/api/friends/requests/:id', async (request) => {
    const userId = await request.requireAuth();
    const req = await prisma.friendship.findUnique({ where: { id: request.params.id } });
    if (!req || req.status !== 'pending' || (req.requesterId !== userId && req.addresseeId !== userId)) {
      throw new HttpError(404, 'Request not found');
    }
    await prisma.friendship.delete({ where: { id: req.id } });
    return { ok: true };
  });

  app.delete<{ Params: { userId: string } }>('/api/friends/:userId', async (request) => {
    const userId = await request.requireAuth();
    const otherId = request.params.userId;
    await prisma.friendship.deleteMany({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
    });
    return { ok: true };
  });

  app.get<{ Querystring: { before?: string } }>(
    '/api/friends/activity',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const friendIds = await friendIdsOf(userId);
      const before = request.query.before ? decodeActivityCursor(request.query.before) : undefined;
      const entries = await buildFeed(userId, [userId, ...friendIds], { before, take: FEED_PAGE_SIZE + 1 });
      const hasMore = entries.length > FEED_PAGE_SIZE;
      const page = hasMore ? entries.slice(0, FEED_PAGE_SIZE) : entries;
      const last = page[page.length - 1];
      const response: FriendActivityPage = {
        entries: page,
        nextBefore: hasMore && last ? encodeActivityCursor({ createdAt: new Date(last.at), id: last.id }) : null,
      };
      return response;
    },
  );

  app.get<{ Params: { userId: string } }>('/api/friends/:userId/profile', async (request) => {
    const userId = await request.requireAuth();
    const otherId = request.params.userId;
    if (!(await areFriends(userId, otherId))) throw new HttpError(404, 'Not friends with that user');
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: otherId }, select: { ...userSelect, createdAt: true } });
    const [beatenCount, achievementCount, playingRows, activity, shared] = await Promise.all([
      prisma.game.count({
        where: { roomId: null, addedBy: otherId, status: { in: ['done', 'replay'] }, hiddenFromOthers: false },
      }),
      prisma.userBadge.count({ where: { userId: otherId } }),
      prisma.game.findMany({
        where: { roomId: null, addedBy: otherId, status: 'playing', hiddenFromOthers: false },
        select: { id: true, title: true, coverImageUrl: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      buildFeed(userId, [otherId], { take: 100 }),
      sharedRoomCounts(userId, [otherId]),
    ]);

    const profile: FriendProfile = {
      user: toFriendUser(user),
      since: (friendship?.respondedAt ?? friendship?.createdAt ?? user.createdAt).toISOString(),
      sharedRoomCount: shared.get(otherId) ?? 0,
      beatenCount,
      achievementCount,
      playing: playingRows.map((g) => ({ id: g.id, title: g.title, coverImageUrl: g.coverImageUrl, since: g.updatedAt.toISOString() })),
      activity,
    };
    return profile;
  });
}
