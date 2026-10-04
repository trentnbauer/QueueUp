import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { GameStatus, JournalEntry, JournalEventKind } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { requireMembership } from '../services/roomAccess.js';
import { toUserDto } from '../util/dto.js';

const LIMIT = 300;
/** The play journal is status changes only (adds, votes, spins and reviews stay in the activity log). */
const JOURNAL_TYPES = ['status_changed'] as const;
/** Finishing a game only counts as a playthrough when it was being played first - a game marked
 * Beaten straight from the Backlog was finished before it was ever tracked here. */
const PLAYED = new Set<string>(['playing', 'paused', 'replay']);
const FINISHED = new Set<JournalEventKind>(['beaten', 'dropped', 'skipped']);

/** Labels as the status-change messages wrote them, for reading old entries back. */
const STATUS_BY_LABEL: Record<string, GameStatus> = {
  Backlog: 'backlog',
  'Play Next': 'play_next',
  Paused: 'paused',
  Playing: 'playing',
  Beaten: 'done',
  Dropped: 'dropped',
  Wishlist: 'wishlist',
  Replay: 'replay',
  "Won't Play": 'wont_play',
};

const KIND_BY_STATUS: Partial<Record<GameStatus, JournalEventKind>> = {
  playing: 'started',
  done: 'beaten',
  dropped: 'dropped',
  paused: 'paused',
  replay: 'replay',
  wont_play: 'skipped',
};

interface Payload {
  gameId?: string;
  title?: string;
  coverImageUrl?: string | null;
  status?: string;
  /** The status it changed from. */
  from?: string;
  score?: number | null;
}

/** The game an entry is about: from its payload, or (for an entry logged before payloads) read
 * back out of its sentence - `... "Title" ...` and, for a status change, `... as Label`. */
export function detailOf(
  type: string,
  message: string,
  raw: Prisma.JsonValue,
): { gameId: string | null; title: string | null; coverImageUrl: string | null; status: GameStatus | null; from: GameStatus | null; score: number | null } {
  const p = (raw ?? {}) as Payload;
  if (p.title) {
    return { gameId: p.gameId ?? null, title: p.title, coverImageUrl: p.coverImageUrl ?? null, status: (p.status as GameStatus) ?? null, from: (p.from as GameStatus) ?? null, score: p.score ?? null };
  }
  const title = /"(.+)"/.exec(message)?.[1] ?? null;
  const label = type === 'status_changed' ? / as (.+)$/.exec(message)?.[1] : undefined;
  return { gameId: null, title, coverImageUrl: null, status: label ? (STATUS_BY_LABEL[label] ?? null) : null, from: null, score: null };
}

export function kindOf(type: string, status: GameStatus | null): JournalEventKind {
  if (type === 'game_added') return 'added';
  if (type === 'spin_result') return 'spin';
  if (type === 'game_reviewed') return 'reviewed';
  return (status && KIND_BY_STATUS[status]) || 'moved';
}

/** Builds journal entries from the status changes on `where`, newest first: who started, beat,
 * dropped or moved which game. Beaten entries carry the playthrough's playtime, and
 * the viewer's all-time playtime from their Steam or Playnite snapshots where there is one. */
async function journal(userId: string, where: Prisma.RoomActivityWhereInput): Promise<JournalEntry[]> {
  const rows = await prisma.roomActivity.findMany({
    where: { AND: [where, { type: { in: [...JOURNAL_TYPES] } }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    // Read further back than is shown, so a finish can see the Playing that came before it.
    take: LIMIT * 2,
    include: { actor: true, room: { select: { name: true } } },
  });
  const all = rows.map((row) => ({ row, detail: detailOf(row.type, row.message, row.payload) })).filter((i) => i.detail.title);

  // Games still around: by id for entries with a payload, by title (in the same room or shelf) for
  // older ones. A removed game's entry stays, just without a link.
  const ids = [...new Set(all.map((i) => i.detail.gameId).filter((id): id is string => !!id))];
  const legacy = all.filter((i) => !i.detail.gameId && i.detail.title);
  const titles = [...new Set(legacy.map((i) => i.detail.title!))];
  const legacyRooms = [...new Set(legacy.map((i) => i.row.roomId).filter((id): id is string => !!id))];
  const games = !ids.length && !titles.length ? [] : await prisma.game.findMany({
    where: {
      OR: [
        ...(ids.length ? [{ id: { in: ids } }] : []),
        ...(titles.length
          ? [
              ...(legacyRooms.length ? [{ roomId: { in: legacyRooms }, title: { in: titles } }] : []),
              { roomId: null, addedBy: userId, title: { in: titles } },
            ]
          : []),
      ],
    },
    select: { id: true, title: true, roomId: true, coverImageUrl: true, steamAppid: true },
  });
  const byId = new Map(games.map((g) => [g.id, g]));
  const byTitle = new Map(games.map((g) => [`${g.roomId ?? 'shelf'}|${g.title}`, g]));
  const gameOf = (i: (typeof all)[number]) =>
    i.detail.gameId ? byId.get(i.detail.gameId) : i.detail.title ? byTitle.get(`${i.row.roomId ?? 'shelf'}|${i.detail.title}`) : undefined;

  // Drop finishes that weren't a playthrough: the status before (from the entry, or for an older
  // entry the previous change logged for that game) has to be Playing, Paused or Replay.
  const lastStatus = new Map<string, GameStatus | null>();
  const keep = new Set<(typeof all)[number]>();
  for (const i of [...all].reverse()) {
    const key = gameOf(i)?.id ?? `${i.row.roomId ?? i.row.recipientId}|${i.detail.title}`;
    const before = i.detail.from ?? lastStatus.get(key) ?? null;
    lastStatus.set(key, i.detail.status);
    if (FINISHED.has(kindOf(i.row.type, i.detail.status)) && !(before && PLAYED.has(before))) continue;
    keep.add(i);
  }
  const items = all.filter((i) => keep.has(i)).slice(0, LIMIT);

  const beatenIds = [...new Set(items.filter((i) => kindOf(i.row.type, i.detail.status) === 'beaten').map((i) => gameOf(i)?.id).filter((id): id is string => !!id))];
  const beatenGames = beatenIds.map((id) => byId.get(id)!).filter(Boolean);
  const appIds = [...new Set(beatenGames.map((g) => g.steamAppid).filter((id): id is number => id !== null))];
  const [logs, steam, playnite] = await Promise.all([
    beatenIds.length ? prisma.playLog.findMany({ where: { gameId: { in: beatenIds }, finishedAt: { not: null } } }) : [],
    appIds.length ? prisma.playtimeSnapshot.findMany({ where: { userId, steamAppId: { in: appIds } }, select: { steamAppId: true, playtimeMinutes: true } }) : [],
    beatenIds.length ? prisma.playnitePlaytimeSnapshot.findMany({ where: { userId, gameId: { in: beatenIds } }, select: { gameId: true, playtimeMinutes: true } }) : [],
  ]);
  const steamBy = new Map(steam.map((s) => [s.steamAppId, s.playtimeMinutes]));
  const playniteBy = new Map(playnite.map((s) => [s.gameId, s.playtimeMinutes]));

  return items.map(({ row, detail }) => {
    const kind = kindOf(row.type, detail.status);
    const game = gameOf({ row, detail });
    let minutesPlayed: number | null = null;
    let totalMinutes: number | null = null;
    if (kind === 'beaten' && game) {
      // The playthrough this Beaten closed: finished within a couple of minutes of the entry.
      const log = logs.find((l) => l.gameId === game.id && Math.abs(l.finishedAt!.getTime() - row.createdAt.getTime()) < 2 * 60_000);
      if (log?.startPlaytimeMinutes != null && log.finishPlaytimeMinutes != null) minutesPlayed = Math.max(0, log.finishPlaytimeMinutes - log.startPlaytimeMinutes);
      totalMinutes = (game.steamAppid !== null ? steamBy.get(game.steamAppid) : undefined) ?? playniteBy.get(game.id) ?? null;
    }
    return {
      id: row.id,
      kind,
      actor: row.actor ? toUserDto(row.actor) : null,
      gameId: game?.id ?? null,
      title: detail.title,
      coverImageUrl: detail.coverImageUrl ?? game?.coverImageUrl ?? null,
      status: detail.status,
      roomId: row.roomId,
      roomName: row.room?.name ?? null,
      at: row.createdAt.toISOString(),
      message: row.message,
      minutesPlayed,
      totalMinutes,
      score: detail.score,
    };
  });
}

/** Play journal (#802): what happened to which game, by whom - added, started, beaten, spun... */
export default async function journalRoutes(app: FastifyInstance) {
  // Everything the caller did: on their Personal Shelf plus their own actions in every room they're in.
  app.get('/api/me/journal', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    const rooms = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
    const entries = await journal(userId, { OR: [{ recipientId: userId }, { roomId: { in: rooms.map((r) => r.roomId) }, actorId: userId }] });
    return { entries };
  });

  // Everything that happened in one room, by anyone.
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/journal', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    await requireMembership(request.params.roomId, userId);
    return { entries: await journal(userId, { roomId: request.params.roomId }) };
  });
}
