import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { buildRecapFacts, generateRecapText, type RecapEvent } from './ai/aiRoomRecap.js';
import { postRoomDiscord } from './roomActivity.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECAP_WINDOW_DAYS = 7;
/** A new recap is due once the last one is at least this old (a little under a week, so a daily job never slips a day). */
const DUE_AFTER_MS = (RECAP_WINDOW_DAYS - 0.25) * DAY_MS;
const KEEP_RECAPS = 8;
const MAX_EVENTS = 500;

/** Writes and saves this room's recap for the last 7 days. Throws a 400 when there is no AI to use or
 * too little happened (callers that run on a schedule treat that as "skip"). Never reads private
 * notes: only the activity feed, with hidden people and hidden games filtered out first. */
export async function generateRoomRecap(roomId: string, now: Date = new Date()): Promise<{ id: string; text: string }> {
  const windowStart = new Date(now.getTime() - RECAP_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.roomActivity.findMany({
    where: { roomId, createdAt: { gte: windowStart, lte: now } },
    orderBy: { createdAt: 'asc' },
    take: MAX_EVENTS,
    select: { type: true, actorId: true, message: true, payload: true, createdAt: true, actor: { select: { displayName: true, activityHidden: true } } },
  });
  const hiddenActorIds = new Set(rows.filter((r) => r.actorId && r.actor?.activityHidden).map((r) => r.actorId!));
  const gameIds = [...new Set(rows.map((r) => (r.payload as { gameId?: unknown } | null)?.gameId).filter((g): g is string => typeof g === 'string'))];
  const hiddenGames = gameIds.length ? await prisma.game.findMany({ where: { id: { in: gameIds }, hiddenFromOthers: true }, select: { id: true } }) : [];

  const events: RecapEvent[] = rows.map((r) => ({ type: r.type, actorId: r.actorId, actorName: r.actor?.displayName ?? null, payload: r.payload, message: r.message, createdAt: r.createdAt }));
  const facts = buildRecapFacts(events, hiddenActorIds, new Set(hiddenGames.map((g) => g.id)), windowStart, now);
  const text = await generateRecapText(roomId, facts);

  const saved = await prisma.roomRecap.create({ data: { roomId, text, windowStart }, select: { id: true } });
  const old = await prisma.roomRecap.findMany({ where: { roomId }, orderBy: { createdAt: 'desc' }, skip: KEEP_RECAPS, select: { id: true } });
  if (old.length) await prisma.roomRecap.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { name: true, weeklyRecapDiscord: true } });
  if (room?.weeklyRecapDiscord) void postRoomDiscord(roomId, `This week in ${room.name} (written by AI):\n${text}`, undefined);
  return { id: saved.id, text };
}

/** The scheduled run: every room with the weekly recap on and no recap in the last week gets one.
 * A room with no AI available, or with too little going on, is skipped quietly and tried again at
 * the next run; any other failure is logged and does not stop the other rooms. */
export async function runWeeklyRecaps(now: Date = new Date()): Promise<{ created: number; skipped: number }> {
  const rooms = await prisma.room.findMany({ where: { weeklyRecapEnabled: true, deletedAt: null }, select: { id: true } });
  let created = 0;
  let skipped = 0;
  for (const { id } of rooms) {
    try {
      const latest = await prisma.roomRecap.findFirst({ where: { roomId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (latest && now.getTime() - latest.createdAt.getTime() < DUE_AFTER_MS) continue;
      await generateRoomRecap(id, now);
      created++;
    } catch (err) {
      if (err instanceof HttpError && err.statusCode < 500) skipped++;
      else console.error('[weeklyRecap] failed for a room', { roomId: id, err });
    }
  }
  return { created, skipped };
}
