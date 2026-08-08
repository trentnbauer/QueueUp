import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import type { GameStatus } from '@queueup/shared';
import { suggestsPlayingFromMinutes } from '@queueup/shared';
import { getOwnedSteamGames, resolveSteamId64, type OwnedSteamGame } from './steamLibrary.js';

/** A Steam app whose playtime went up since the last snapshot for this user - the raw signal
 * later pieces of issue #548 (the "mark as Playing" nudge, playthrough-duration tracking) will
 * consume. Not emitted for a user/app's first-ever snapshot (nothing to compare against yet), so
 * onboarding a new Steam-linked user doesn't look like every game in their library was just
 * played. */
export interface PlaytimeIncrease {
  userId: string;
  steamAppId: number;
  previousMinutes: number;
  currentMinutes: number;
}

/** Pure comparison step, pulled out of snapshotAllPlaytimes so it's testable without a DB or
 * Steam's API (issue #330 set this precedent - extract the actual decision logic out of the
 * I/O-shaped function around it). `previousByAppId` has no entry for an app never snapshotted
 * before, which is deliberately not treated as an increase - see PlaytimeIncrease's doc comment. */
export function computePlaytimeIncreases(
  userId: string,
  owned: OwnedSteamGame[],
  previousByAppId: Map<number, number>,
): PlaytimeIncrease[] {
  const increases: PlaytimeIncrease[] = [];
  for (const game of owned) {
    const previousMinutes = previousByAppId.get(game.appId);
    if (previousMinutes !== undefined && game.playtimeForeverMinutes > previousMinutes) {
      increases.push({
        userId,
        steamAppId: game.appId,
        previousMinutes,
        currentMinutes: game.playtimeForeverMinutes,
      });
    }
  }
  return increases;
}

/** Bug fix (issue #562): collapses multiple Game rows that resolve to the same (owner, Steam app)
 * pair down to one, before notifying - a person can end up with two Personal Shelf rows for the
 * same Steam game (removed and re-added it, a stray duplicate from some other path), and without
 * this, playtimeSnapshotJob's per-game notifyPlaytimeMarkPlaying dedup (keyed on gameId, not on
 * what the game actually *is*) would fire once per row for what reads as one game to the person
 * getting notified. Keeps whichever row `findMany` happened to return first for a given pair - no
 * ordering guarantee needed here, since all that matters is picking exactly one. */
export function dedupeByOwnerAndSteamApp<T extends { addedBy: string; steamAppid: number | null }>(games: T[]): T[] {
  const seen = new Set<string>();
  return games.filter((g) => {
    const key = `${g.addedBy}:${g.steamAppid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Refreshes every Steam-linked user's playtime snapshot and reports which apps increased since
 * last time (issue #548). Runs one user at a time rather than in parallel - Steam's Web API has
 * no documented per-key rate limit, but there's no upside to bursting it across every linked user
 * at once, and a slow/failing account here shouldn't affect the others (one user's fetch failure
 * is logged and skipped, same as any other job in this codebase - see priceAlertJob.ts). No-op
 * (returns []) if Steam isn't configured on this server at all. */
export async function snapshotAllPlaytimes(): Promise<PlaytimeIncrease[]> {
  if (!env.STEAM_API_KEY) return [];

  const users = await prisma.user.findMany({
    where: { OR: [{ oidcSub: { startsWith: 'steam:' } }, { steamId64: { not: null } }] },
    select: { id: true, oidcSub: true, steamId64: true },
  });

  const increases: PlaytimeIncrease[] = [];

  for (const user of users) {
    const steamId64 = resolveSteamId64(user);
    if (!steamId64) continue;

    let owned;
    try {
      owned = await getOwnedSteamGames(steamId64, env.STEAM_API_KEY);
    } catch (err) {
      console.error(`playtime-snapshot: could not fetch Steam library for user ${user.id}`, err);
      continue;
    }
    if (owned.length === 0) continue;

    const existing = await prisma.playtimeSnapshot.findMany({
      where: { userId: user.id, steamAppId: { in: owned.map((g) => g.appId) } },
    });
    const previousByAppId = new Map(existing.map((row) => [row.steamAppId, row.playtimeMinutes]));
    increases.push(...computePlaytimeIncreases(user.id, owned, previousByAppId));

    await Promise.all(
      owned.map((game) =>
        prisma.playtimeSnapshot.upsert({
          where: { userId_steamAppId: { userId: user.id, steamAppId: game.appId } },
          create: {
            userId: user.id,
            steamAppId: game.appId,
            playtimeMinutes: game.playtimeForeverMinutes,
            initialMinutes: game.playtimeForeverMinutes,
          },
          update: { playtimeMinutes: game.playtimeForeverMinutes },
        }),
      ),
    );
  }

  return increases;
}

// --- Playnite-sourced playtime (issue #577) ---
//
// Steam's playtime pipeline above is entirely poll-driven (snapshotAllPlaytimes runs on its own
// schedule and compares against the last snapshot). Playnite instead pushes one playtime figure
// per game per import (see routes/apiV1.ts's runPlayniteImportLoop), so there's no equivalent job
// here - just a single record-and-compare step called once per matched import entry.

/** Pure decision step (same "extract the actual decision logic" precedent as
 * computePlaytimeIncreases above) for whether a freshly-recorded Playnite playtime figure should
 * trigger the same "Mark Playing?" nudge Steam's own snapshot job sends via suggestsPlaying
 * FromMinutes. `previousMinutes` is undefined for a game's first-ever Playnite snapshot, which
 * deliberately never nudges - same reasoning as computePlaytimeIncreases skipping a first capture,
 * so a user's very first Playnite sync doesn't read as "every game in your library was just
 * played." */
export function suggestsPlayingFromPlaynitePlaytimeIncrease(
  status: GameStatus,
  previousMinutes: number | undefined,
  currentMinutes: number,
): boolean {
  if (previousMinutes === undefined || currentMinutes <= previousMinutes) return false;
  // Personal Shelf only (roomId hardcoded null) - every game a Playnite import touches lives on
  // the Personal Shelf (see routes/apiV1.ts), never a room, so there's no roomId to thread through.
  return suggestsPlayingFromMinutes(status, null, currentMinutes);
}

/** Upserts one Playnite-reported playtime figure for a non-Steam-sourced Personal Shelf game
 * (issue #577) - the write side of PlaynitePlaytimeSnapshot, the Playnite-sourced counterpart to
 * PlaytimeSnapshot. Returns whether this update should trigger the "Mark Playing?" notification
 * (see suggestsPlayingFromPlaynitePlaytimeIncrease above) - the caller (runPlayniteImportLoop)
 * sends it, not this function, so this stays a plain data write with no notification side effect
 * baked in. No-op (returns false) when playtime tracking is off, same gating as the rest of #548. */
export async function recordPlaynitePlaytime(
  userId: string,
  gameId: string,
  status: GameStatus,
  minutes: number,
): Promise<boolean> {
  if (!env.PLAYTIME_TRACKING_ENABLED) return false;

  const previous = await prisma.playnitePlaytimeSnapshot.findUnique({ where: { userId_gameId: { userId, gameId } } });
  await prisma.playnitePlaytimeSnapshot.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, playtimeMinutes: minutes, initialMinutes: minutes },
    update: { playtimeMinutes: minutes },
  });

  return suggestsPlayingFromPlaynitePlaytimeIncrease(status, previous?.playtimeMinutes, minutes);
}

/** The most recently snapshotted Steam playtime for the given game, if there is one - used to
 * stamp a PlayLog entry's start/finish playtime (issue #548's playthrough-duration piece) at the
 * moment a status transition opens or closes it. Attributed to whoever added the game (a room
 * game's addedBy, or a shelf game's own owner) - the only person a room game's playtime can
 * unambiguously be pinned to, since other members may or may not own/play their own copy. Null
 * whenever there's nothing to attribute: playtime tracking is off, the game has no Steam match, or
 * its adder has never had a snapshot taken (not Steam-linked, or the job hasn't run yet). */
export async function currentPlaytimeMinutesForGame(gameId: string): Promise<number | null> {
  if (!env.PLAYTIME_TRACKING_ENABLED) return null;

  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { addedBy: true, steamAppid: true } });
  if (!game) return null;

  if (game.steamAppid) {
    const snapshot = await prisma.playtimeSnapshot.findUnique({
      where: { userId_steamAppId: { userId: game.addedBy, steamAppId: game.steamAppid } },
    });
    return snapshot?.playtimeMinutes ?? null;
  }

  // No Steam app id - fall back to a Playnite-sourced snapshot for this exact game (issue #577),
  // if one exists. See PlaynitePlaytimeSnapshot's schema doc for why this is keyed by gameId
  // rather than mirroring PlaytimeSnapshot's (userId, steamAppId) key.
  const playniteSnapshot = await prisma.playnitePlaytimeSnapshot.findUnique({
    where: { userId_gameId: { userId: game.addedBy, gameId } },
  });
  return playniteSnapshot?.playtimeMinutes ?? null;
}

/** Batched version of currentPlaytimeMinutesForGame (issue #562 bug fix) - for a caller about to
 * stamp PlayLog entries for many games at once (the bulk status-change route), one call here plus
 * two queries replaces what would otherwise be up to 2 * N sequential/concurrent single-game
 * lookups fired via recordStatusTransition's own internal call, on a route explicitly built to
 * avoid per-game round trips for exactly this (100s of shelf games) reason. Same
 * Personal-Shelf/Steam-matched-only semantics as the single-game version; a game missing from the
 * returned map (never had a snapshot) should be treated as null, same as that version's return. */
export async function getCurrentPlaytimeMinutesForGames(
  games: { id: string; addedBy: string; steamAppid: number | null }[],
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (!env.PLAYTIME_TRACKING_ENABLED) return result;

  const steamCandidates = games.filter((g): g is typeof g & { steamAppid: number } => g.steamAppid !== null);
  // Playnite-sourced counterpart to steamCandidates (issue #577) - see currentPlaytimeMinutesForGame's
  // doc comment for why this falls back to a gameId-keyed lookup instead.
  const playniteCandidates = games.filter((g) => g.steamAppid === null);

  if (steamCandidates.length > 0) {
    const snapshots = await prisma.playtimeSnapshot.findMany({
      where: { OR: steamCandidates.map((g) => ({ userId: g.addedBy, steamAppId: g.steamAppid })) },
    });
    const snapshotByKey = new Map(snapshots.map((s) => [`${s.userId}:${s.steamAppId}`, s.playtimeMinutes]));
    for (const game of steamCandidates) result.set(game.id, snapshotByKey.get(`${game.addedBy}:${game.steamAppid}`) ?? null);
  }

  if (playniteCandidates.length > 0) {
    const playniteSnapshots = await prisma.playnitePlaytimeSnapshot.findMany({
      where: { gameId: { in: playniteCandidates.map((g) => g.id) } },
    });
    const snapshotByGameId = new Map(playniteSnapshots.map((s) => [s.gameId, s.playtimeMinutes]));
    for (const game of playniteCandidates) result.set(game.id, snapshotByGameId.get(game.id) ?? null);
  }

  return result;
}

interface CheckpointEntry {
  finishedAt: Date | null;
  startPlaytimeMinutes: number | null;
  finishPlaytimeMinutes: number | null;
}

/** Pure step (same reasoning as computePlaytimeIncreases above) - the playtime baseline a game's
 * "since last checkpoint" figure counts up from. An open entry (still Playing) checkpoints at its
 * own start; a closed one checkpoints at its finish, since that's the more recent of the two times
 * this game's playtime was looked at. Falls back to `initialMinutes` - the playtime this app had
 * the very first time it was ever snapshotted - both when there's no PlayLog entry at all (never
 * tracked through a status change) and when the relevant entry field is null (predates playtime
 * tracking). Using 0 for either case would misread every hour logged before tracking started as
 * "just played" the moment a never-before-tracked game's first snapshot lands. */
export function checkpointBaselineMinutes(lastEntry: CheckpointEntry | undefined, initialMinutes: number): number {
  if (!lastEntry) return initialMinutes;
  const value = lastEntry.finishedAt ? lastEntry.finishPlaytimeMinutes : lastEntry.startPlaytimeMinutes;
  return value ?? initialMinutes;
}

export interface GamePlaytimeInfo {
  /** Minutes played since this game's last tracked checkpoint - see checkpointBaselineMinutes. */
  sinceCheckpointMinutes: number;
  /** Raw, always-increasing total minutes from the latest snapshot - unlike sinceCheckpointMinutes,
   * never resets on a status change. Issue #548's batch "review your played games" prompt tracks
   * its own per-game high-watermark against this (see usePlaytimeReview.ts on the frontend) rather
   * than sinceCheckpointMinutes, precisely because it needs a figure that keeps climbing instead of
   * one that zeroes out the moment a nudge gets acted on. */
  currentMinutes: number;
}

/** Batched per-game playtime info for a set of games (issue #548) - backs both the individual
 * "mark as Playing"/"mark as Beaten" nudges (sinceCheckpointMinutes) and the batch playtime-review
 * prompt (currentMinutes). Personal-Shelf-only (roomId null): a room game has no single
 * unambiguous player to attribute playtime to, unlike its adder-scoped PlayLog stamps above, which
 * are internal bookkeeping rather than something shown back to every member. Two batch queries
 * total regardless of game count, same shape as getSteamPrices/getOwnershipInfo elsewhere in
 * gameSerializer.ts - not one query per game. */
function playtimeInfoFromSnapshot(
  snapshot: { current: number; initial: number } | undefined,
  lastEntry: CheckpointEntry | undefined,
): GamePlaytimeInfo | undefined {
  if (snapshot === undefined) return undefined;
  const baseline = checkpointBaselineMinutes(lastEntry, snapshot.initial);
  return { sinceCheckpointMinutes: Math.max(0, snapshot.current - baseline), currentMinutes: snapshot.current };
}

export async function getPlaytimeSinceCheckpoint(
  games: { id: string; roomId: string | null; addedBy: string; steamAppid: number | null }[],
): Promise<Map<string, GamePlaytimeInfo>> {
  const result = new Map<string, GamePlaytimeInfo>();
  if (!env.PLAYTIME_TRACKING_ENABLED) return result;

  const steamCandidates = games.filter(
    (g): g is typeof g & { steamAppid: number } => g.roomId === null && g.steamAppid !== null,
  );
  // Playnite-sourced counterpart to steamCandidates (issue #577) - a Personal Shelf game Playnite
  // reported playtime for that has no Steam app id of its own, so it can't be looked up via
  // PlaytimeSnapshot's (userId, steamAppId) key - see PlaynitePlaytimeSnapshot's schema doc.
  const playniteCandidates = games.filter((g) => g.roomId === null && g.steamAppid === null);
  if (steamCandidates.length === 0 && playniteCandidates.length === 0) return result;

  const [snapshots, playniteSnapshots, entries] = await Promise.all([
    steamCandidates.length > 0
      ? prisma.playtimeSnapshot.findMany({
          where: { OR: steamCandidates.map((g) => ({ userId: g.addedBy, steamAppId: g.steamAppid })) },
        })
      : Promise.resolve([]),
    playniteCandidates.length > 0
      ? prisma.playnitePlaytimeSnapshot.findMany({ where: { gameId: { in: playniteCandidates.map((g) => g.id) } } })
      : Promise.resolve([]),
    // Bug fix: this used to have no `take`, fetching every PlayLog row ever created for these
    // games (a long-lived account's entire play-journal history, on every Personal Shelf render)
    // just to pick the single most recent entry per game in JS below. `distinct` + `orderBy` asks
    // Postgres for exactly that - one (the newest) row per gameId - instead.
    prisma.playLog.findMany({
      where: { gameId: { in: [...steamCandidates, ...playniteCandidates].map((g) => g.id) } },
      orderBy: { createdAt: 'desc' },
      distinct: ['gameId'],
    }),
  ]);

  const snapshotByKey = new Map(
    snapshots.map((s) => [`${s.userId}:${s.steamAppId}`, { current: s.playtimeMinutes, initial: s.initialMinutes }]),
  );
  const playniteSnapshotByGameId = new Map(
    playniteSnapshots.map((s) => [s.gameId, { current: s.playtimeMinutes, initial: s.initialMinutes }]),
  );
  // `entries` is already exactly one (the newest) row per gameId, courtesy of `distinct` above.
  const lastEntryByGame = new Map<string, CheckpointEntry>(entries.map((entry) => [entry.gameId, entry]));

  for (const game of steamCandidates) {
    const info = playtimeInfoFromSnapshot(snapshotByKey.get(`${game.addedBy}:${game.steamAppid}`), lastEntryByGame.get(game.id));
    if (info) result.set(game.id, info);
  }
  for (const game of playniteCandidates) {
    const info = playtimeInfoFromSnapshot(playniteSnapshotByGameId.get(game.id), lastEntryByGame.get(game.id));
    if (info) result.set(game.id, info);
  }

  return result;
}
