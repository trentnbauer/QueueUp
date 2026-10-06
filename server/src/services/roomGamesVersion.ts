import { createHash } from 'node:crypto';
import { prisma } from '../db/client.js';

/** A cheap "has this room's games list changed?" answer (#1042). An open room used to re-read and
 * re-serialise every game every 15 seconds to show other members' changes; now it asks for this short
 * version first and only reads the list when the version has moved. The version covers what the list
 * shows that other people can change: the games themselves (status, price, archive, edits - their
 * `updated_at`), votes, removal votes, reviews, tags, who owns what, and who is in the room. It is a few
 * counts and newest-timestamps, so it never serialises a game. */
export async function roomGamesVersion(roomId: string): Promise<string> {
  const [row] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      (SELECT count(*) FROM games WHERE room_id = ${roomId}) AS games,
      (SELECT max(updated_at) FROM games WHERE room_id = ${roomId}) AS games_at,
      (SELECT count(*) || '/' || coalesce(max(v.updated_at)::text, '') FROM votes v JOIN games g ON g.id = v.game_id WHERE g.room_id = ${roomId}) AS votes,
      (SELECT count(*) || '/' || coalesce(max(r.created_at)::text, '') FROM removal_votes r JOIN games g ON g.id = r.game_id WHERE g.room_id = ${roomId}) AS removals,
      (SELECT count(*) || '/' || coalesce(max(r.reviewed_at)::text, '') FROM game_reviews r JOIN games g ON g.id = r.game_id WHERE g.room_id = ${roomId}) AS reviews,
      (SELECT count(*) || '/' || coalesce(max(t.created_at)::text, '') FROM game_tags t JOIN games g ON g.id = t.game_id WHERE g.room_id = ${roomId}) AS tags,
      (SELECT count(*) || '/' || coalesce(max(o.created_at)::text, '') FROM game_ownership o
         JOIN room_members m ON m.user_id = o.user_id AND m.room_id = ${roomId}
        WHERE o.igdb_id IN (SELECT igdb_id FROM games WHERE room_id = ${roomId})) AS owners,
      (SELECT count(*) || '/' || coalesce(max(joined_at)::text, '') FROM room_members WHERE room_id = ${roomId}) AS members
  `;
  // Hashed so the answer reveals nothing beyond "same" or "different".
  return createHash('sha1').update(JSON.stringify(Object.values(row ?? {}), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).digest('hex').slice(0, 16);
}
