import { randomUUID } from 'node:crypto';
import { prisma } from '../db/client.js';
import { redis } from './redisClient.js';
import { HttpError } from '../util/httpError.js';
import { normalizeGameTitleForComparison } from './igdbClient.js';
import { userAliasSource } from './playniteImport.js';

/** Undo for a merge ("Duplicate?", the duplicate finder, or re-matching onto a game that is already
 * there) and for a plain re-match. Taken just before the change, kept for a few minutes in Redis under a
 * token only the person who made the change gets back, and applied by `applyUndo`.
 *
 * A merge moves everything the removed card collected onto the survivor and deletes the card, so the
 * snapshot records the removed card, which of its rows moved (and which were dropped because the survivor
 * had the same one), what the survivor looked like, and the small side effects (match redirects, the
 * shelf's ownership and sync records, the shared merge vote). Undo recreates the card and puts all of it
 * back. Changes made to those rows in the few minutes since are not preserved. */

export const UNDO_TTL_SECONDS = 10 * 60;
const keyOf = (token: string) => `undo:game-change:${token}`;

type Row = Record<string, unknown>;

/** The tables whose rows hang off a game. `move` is how a moved row is found again afterwards; `collide` is
 * what makes two rows "the same one" (the survivor's copy wins and the removed card's copy is dropped). */
const GAME_TABLES = [
  { model: 'vote', move: 'userId', collide: 'userId' },
  { model: 'removalVote', move: 'userId', collide: 'userId' },
  { model: 'gameTag', move: 'tagId', collide: 'tagId' },
  { model: 'gameReview', move: 'id', collide: 'userId' },
  { model: 'playnitePlaytimeSnapshot', move: 'userId', collide: 'userId' },
  { model: 'playniteCompletionSuggestion', move: 'userId', collide: 'userId' },
  { model: 'playLog', move: 'id', collide: null },
  { model: 'notification', move: 'id', collide: null },
] as const;

interface TableSnapshot {
  model: string;
  move: string;
  /** The removed card's rows as they were. */
  rows: Row[];
  /** Keys of rows the survivor already had (so the removed card's copy was dropped, not moved). */
  collisions: unknown[];
}

interface RedirectSnapshot {
  userId: string;
  /** The `fromIgdbId`s a redirect change can touch: the removed game, the survivor, and anything that
   * pointed at the removed game. */
  touched: number[];
  rows: Row[];
}

export interface MergeUndo {
  kind: 'merge';
  userId: string;
  roomId: string | null;
  ownerId: string;
  source: Row;
  targetId: string;
  targetBefore: Row;
  tables: TableSnapshot[];
  activity: { id: string; payload: unknown }[];
  prerequisiteChildren: string[];
  baseChildren: string[];
  redirects: RedirectSnapshot | null;
  ownership: { igdbId: number; existed: boolean; platforms: string[] } | null;
  syncSources: { igdbId: number; before: string[] } | null;
  mergeVote: { low: number; high: number; existed: boolean; keep: number | null } | null;
}

export interface RematchUndo {
  kind: 'rematch';
  userId: string;
  roomId: string | null;
  ownerId: string;
  gameId: string;
  before: Row;
  redirects: RedirectSnapshot | null;
}

/** Picking a game for an imported title under Needs matching: what the pick added, so it can be taken
 * back and the title put back in the queue. */
export interface ResolveUndo {
  kind: 'resolve';
  userId: string;
  roomId: null;
  ownerId: string;
  /** The waiting title as it was. */
  pending: Row;
  igdbId: number;
  /** True when the pick created the card (so undo removes it); false when it was already on the shelf. */
  gameExisted: boolean;
  ownership: { existed: boolean; platforms: string[] };
  syncSources: string[];
  alias: { source: string; normalizedTitle: string; igdbId: number | null };
  suggestionExisted: boolean;
}

export type GameChangeUndo = MergeUndo | RematchUndo | ResolveUndo;

/** The redirect rows a change to `fromIgdbId` → `toIgdbId` can touch, as they are now. */
export async function captureRedirects(userId: string, fromIgdbId: number, toIgdbId: number): Promise<RedirectSnapshot> {
  const pointingAtFrom = await prisma.gameMatchRedirect.findMany({ where: { userId, toIgdbId: fromIgdbId }, select: { fromIgdbId: true } });
  const touched = [...new Set([fromIgdbId, toIgdbId, ...pointingAtFrom.map((r) => r.fromIgdbId)])];
  const rows = await prisma.gameMatchRedirect.findMany({ where: { userId, fromIgdbId: { in: touched } } });
  return { userId, touched, rows: rows as unknown as Row[] };
}

async function restoreRedirects(tx: Db, snap: RedirectSnapshot | null): Promise<void> {
  if (!snap) return;
  await tx.gameMatchRedirect.deleteMany({ where: { userId: snap.userId, fromIgdbId: { in: snap.touched } } });
  if (snap.rows.length > 0) await tx.gameMatchRedirect.createMany({ data: snap.rows as never });
}

type Db = typeof prisma;

/** Everything a merge of `sourceId` into `targetId` is about to change. Call just before merging. */
export async function captureMergeUndo(userId: string, sourceId: string, targetId: string): Promise<MergeUndo> {
  const [source, target] = await Promise.all([prisma.game.findUniqueOrThrow({ where: { id: sourceId } }), prisma.game.findUniqueOrThrow({ where: { id: targetId } })]);
  const db = prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Row[]> }>;

  const tables: TableSnapshot[] = [];
  for (const t of GAME_TABLES) {
    const rows = await db[t.model].findMany({ where: { gameId: sourceId } });
    let collisions: unknown[] = [];
    if (t.collide && rows.length > 0) {
      const existing = await db[t.model].findMany({ where: { gameId: targetId, [t.collide]: { in: rows.map((r) => r[t.collide]) } } });
      const taken = new Set(existing.map((r) => r[t.collide]));
      collisions = rows.filter((r) => taken.has(r[t.collide])).map((r) => r[t.move]);
    }
    tables.push({ model: t.model, move: t.move, rows, collisions });
  }

  const activity = (await prisma.$queryRaw<{ id: string; payload: unknown }[]>`SELECT id, payload FROM room_activity WHERE payload->>'gameId' = ${sourceId}`) ?? [];
  const [prereq, base] = await Promise.all([
    prisma.game.findMany({ where: { prerequisiteGameId: sourceId, id: { not: targetId } }, select: { id: true } }),
    prisma.game.findMany({ where: { baseGameId: sourceId, id: { not: targetId } }, select: { id: true } }),
  ]);

  const shelf = source.roomId === null && source.igdbId !== target.igdbId;
  let ownership: MergeUndo['ownership'] = null;
  let syncSources: MergeUndo['syncSources'] = null;
  let mergeVote: MergeUndo['mergeVote'] = null;
  if (shelf) {
    const own = await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId: source.addedBy, igdbId: target.igdbId } } });
    ownership = { igdbId: target.igdbId, existed: !!own, platforms: (own?.platforms as string[] | undefined) ?? [] };
    const syncs = await prisma.gameSyncSource.findMany({ where: { userId: source.addedBy, igdbId: target.igdbId }, select: { source: true } });
    syncSources = { igdbId: target.igdbId, before: syncs.map((s) => s.source as string) };
    const [low, high] = source.igdbId < target.igdbId ? [source.igdbId, target.igdbId] : [target.igdbId, source.igdbId];
    const vote = await prisma.duplicateMergeVote.findUnique({ where: { userId_igdbIdLow_igdbIdHigh: { userId: source.addedBy, igdbIdLow: low, igdbIdHigh: high } } });
    mergeVote = { low, high, existed: !!vote, keep: vote?.keepIgdbId ?? null };
  }

  return {
    kind: 'merge',
    userId,
    roomId: source.roomId,
    ownerId: source.addedBy,
    source: source as unknown as Row,
    targetId,
    targetBefore: target as unknown as Row,
    tables,
    activity,
    prerequisiteChildren: prereq.map((g) => g.id),
    baseChildren: base.map((g) => g.id),
    redirects: await captureRedirects(userId, source.igdbId, target.igdbId),
    ownership,
    syncSources,
    mergeVote,
  };
}

/** A plain re-match: the card as it is now, to put back. */
export async function captureRematchUndo(userId: string, gameId: string, newIgdbId: number): Promise<RematchUndo> {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  return {
    kind: 'rematch',
    userId,
    roomId: game.roomId,
    ownerId: game.addedBy,
    gameId,
    before: game as unknown as Row,
    redirects: await captureRedirects(userId, game.igdbId, newIgdbId),
  };
}

/** What picking `igdbId` for a waiting title is about to change. Call just before resolving it. */
export async function captureResolveUndo(userId: string, pending: { id: string; source: string; title: string }, igdbId: number): Promise<ResolveUndo> {
  const row = await prisma.pendingLibraryImport.findUniqueOrThrow({ where: { id: pending.id } });
  const aliasSource = userAliasSource(pending.source, userId);
  const normalizedTitle = normalizeGameTitleForComparison(pending.title);
  const [game, own, syncs, alias, suggestion] = await Promise.all([
    prisma.game.findFirst({ where: { roomId: null, addedBy: userId, igdbId }, select: { id: true } }),
    prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId } } }),
    prisma.gameSyncSource.findMany({ where: { userId, igdbId }, select: { source: true } }),
    prisma.titleMatchAlias.findUnique({ where: { source_normalizedTitle: { source: aliasSource, normalizedTitle } } }),
    prisma.titleMatchSuggestion.findUnique({ where: { source_normalizedTitle_igdbId_userId: { source: pending.source, normalizedTitle, igdbId, userId } } }),
  ]);
  return {
    kind: 'resolve',
    userId,
    roomId: null,
    ownerId: userId,
    pending: row as unknown as Row,
    igdbId,
    gameExisted: !!game,
    ownership: { existed: !!own, platforms: (own?.platforms as string[] | undefined) ?? [] },
    syncSources: syncs.map((s) => s.source as string),
    alias: { source: aliasSource, normalizedTitle, igdbId: alias?.igdbId ?? null },
    suggestionExisted: !!suggestion,
  };
}

/** Keeps a snapshot for a few minutes and returns the token that applies it. */
export async function saveUndo(undo: GameChangeUndo): Promise<string> {
  const token = randomUUID();
  await redis.set(keyOf(token), JSON.stringify(undo), 'EX', UNDO_TTL_SECONDS);
  return token;
}

/** The snapshot behind a token, if it is the person's own and has not expired. */
export async function takeUndo(userId: string, token: string): Promise<GameChangeUndo> {
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/.test(token)) throw new HttpError(400, 'That undo is not valid');
  const raw = await redis.get(keyOf(token));
  if (!raw) throw new HttpError(410, 'It is too late to undo that');
  const undo = JSON.parse(raw) as GameChangeUndo;
  if (undo.userId !== userId) throw new HttpError(403, 'That change was not yours');
  return undo;
}

/** Done with a token (the undo worked): it cannot be used again. */
export async function dropUndo(token: string): Promise<void> {
  await redis.del(keyOf(token));
}

/** Puts things back as the snapshot says, in one transaction. Returns the id of the card to show. */
export async function applyUndo(undo: GameChangeUndo): Promise<string> {
  if (undo.kind === 'rematch') {
    await prisma.$transaction(async (tx) => {
      const { id: _id, ...data } = undo.before;
      const current = await tx.game.findUnique({ where: { id: undo.gameId }, select: { id: true } });
      if (!current) throw new HttpError(409, 'That game is no longer there');
      try {
        await tx.game.update({ where: { id: undo.gameId }, data: data as never });
      } catch {
        throw new HttpError(409, 'The old match is already on this list now, so this cannot be undone');
      }
      await restoreRedirects(tx as unknown as Db, undo.redirects);
    });
    return undo.gameId;
  }

  if (undo.kind === 'resolve') {
    const { ownerId: userId, igdbId } = undo;
    await prisma.$transaction(async (tx) => {
      if (!undo.gameExisted) await tx.game.deleteMany({ where: { roomId: null, addedBy: userId, igdbId } });
      if (undo.ownership.existed) {
        await tx.gameOwnership.updateMany({ where: { userId, igdbId }, data: { platforms: undo.ownership.platforms as never } });
      } else {
        await tx.gameOwnership.deleteMany({ where: { userId, igdbId } });
      }
      await tx.gameSyncSource.deleteMany({ where: { userId, igdbId, source: { notIn: undo.syncSources as never } } });
      const { source, normalizedTitle, igdbId: oldAlias } = undo.alias;
      if (oldAlias === null) await tx.titleMatchAlias.deleteMany({ where: { source, normalizedTitle } });
      else await tx.titleMatchAlias.update({ where: { source_normalizedTitle: { source, normalizedTitle } }, data: { igdbId: oldAlias } });
      if (!undo.suggestionExisted) {
        await tx.titleMatchSuggestion.deleteMany({ where: { source: String(undo.pending.source), normalizedTitle, igdbId, userId } });
      }
      // Back in the queue, as it was (a copy a newer sync made in the meantime is replaced).
      await tx.pendingLibraryImport.deleteMany({ where: { userId, source: String(undo.pending.source), title: String(undo.pending.title) } });
      await tx.pendingLibraryImport.create({ data: undo.pending as never });
    });
    return '';
  }

  const sourceId = String(undo.source.id);
  await prisma.$transaction(async (tx) => {
    const db = tx as unknown as Record<string, {
      createMany: (a: unknown) => Promise<unknown>;
      updateMany: (a: unknown) => Promise<unknown>;
    }>;
    const target = await tx.game.findUnique({ where: { id: undo.targetId }, select: { id: true } });
    if (!target) throw new HttpError(409, 'The game it was merged into is no longer there');
    if (await tx.game.findUnique({ where: { id: sourceId }, select: { id: true } })) throw new HttpError(409, 'That game is already back');

    // The removed card, first, so its rows can point at it again.
    try {
      await tx.game.create({ data: undo.source as never });
    } catch {
      throw new HttpError(409, 'The merged game cannot be restored any more');
    }

    for (const t of undo.tables) {
      const collided = new Set(t.collisions);
      const moved = t.rows.filter((r) => !collided.has(r[t.move]));
      const dropped = t.rows.filter((r) => collided.has(r[t.move]));
      if (moved.length > 0) {
        await db[t.model].updateMany({ where: { gameId: undo.targetId, [t.move]: { in: moved.map((r) => r[t.move]) } }, data: { gameId: sourceId } });
      }
      if (dropped.length > 0) await db[t.model].createMany({ data: dropped, skipDuplicates: true });
    }

    for (const a of undo.activity) {
      await tx.$executeRaw`UPDATE room_activity SET payload = ${JSON.stringify(a.payload)}::jsonb WHERE id = ${a.id}`;
    }
    if (undo.prerequisiteChildren.length > 0) await tx.game.updateMany({ where: { id: { in: undo.prerequisiteChildren } }, data: { prerequisiteGameId: sourceId } });
    if (undo.baseChildren.length > 0) await tx.game.updateMany({ where: { id: { in: undo.baseChildren } }, data: { baseGameId: sourceId } });

    const before = undo.targetBefore;
    await tx.game.update({
      where: { id: undo.targetId },
      data: {
        status: before.status as never,
        replayedAt: before.replayedAt as never,
        targetPrice: before.targetPrice as never,
        manualPrice: before.manualPrice as never,
        steamFullyCompleted: before.steamFullyCompleted as never,
        prerequisiteGameId: before.prerequisiteGameId as never,
        prerequisiteSource: before.prerequisiteSource as never,
        baseGameId: before.baseGameId as never,
      },
    });

    await restoreRedirects(tx as unknown as Db, undo.redirects);

    if (undo.ownership) {
      const { igdbId, existed, platforms } = undo.ownership;
      if (existed) {
        await tx.gameOwnership.update({ where: { userId_igdbId: { userId: undo.ownerId, igdbId } }, data: { platforms: platforms as never } });
      } else {
        await tx.gameOwnership.deleteMany({ where: { userId: undo.ownerId, igdbId } });
      }
    }
    if (undo.syncSources) {
      await tx.gameSyncSource.deleteMany({ where: { userId: undo.ownerId, igdbId: undo.syncSources.igdbId, source: { notIn: undo.syncSources.before as never } } });
    }
    if (undo.mergeVote) {
      const { low, high, existed, keep } = undo.mergeVote;
      const where = { userId_igdbIdLow_igdbIdHigh: { userId: undo.ownerId, igdbIdLow: low, igdbIdHigh: high } };
      if (!existed) await tx.duplicateMergeVote.deleteMany({ where: { userId: undo.ownerId, igdbIdLow: low, igdbIdHigh: high } });
      else if (keep !== null) await tx.duplicateMergeVote.update({ where, data: { keepIgdbId: keep } });
    }
  });
  return sourceId;
}
