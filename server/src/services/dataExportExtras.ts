import type { DataExportAiSettings, DataExportLibraryLink, DataExportMergedGame } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** The newer per-person data in "Download my data": linked libraries, AI settings, rooms using the
 * person's AI key, and merged games. Credentials never leave here: no Microsoft or PlayStation login,
 * no AI key, only whether one is saved. Kept apart from the export route so what is (and is not)
 * included can be tested. */
export async function loadExportExtras(userId: string): Promise<{
  libraryLinks: DataExportLibraryLink[];
  aiSettings: DataExportAiSettings | null;
  roomsUsingYourAiKey: string[];
  mergedGames: DataExportMergedGame[];
}> {
  const [xbox, psn, exophase, retro, ai, rooms, merged] = await Promise.all([
    prisma.userXboxConnection.findUnique({ where: { userId }, select: { gamertag: true, createdAt: true, lastSyncedAt: true } }),
    prisma.userPsnConnection.findUnique({ where: { userId }, select: { createdAt: true, lastSyncedAt: true, refreshExpiresAt: true } }),
    prisma.userExophaseConnection.findUnique({ where: { userId }, select: { playerId: true, createdAt: true, lastSyncedAt: true } }),
    prisma.userRetroAchievementsConnection.findUnique({ where: { userId }, select: { username: true, createdAt: true, lastSyncedAt: true } }),
    prisma.userAiSettings.findUnique({ where: { userId }, select: { provider: true, model: true, baseUrl: true, apiKeyEncrypted: true } }),
    prisma.room.findMany({ where: { aiKeyOwnerId: userId }, select: { name: true }, orderBy: { name: 'asc' } }),
    prisma.gameMatchRedirect.findMany({ where: { userId }, select: { fromTitle: true, toTitle: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
  ]);

  const libraryLinks: DataExportLibraryLink[] = [];
  if (xbox) libraryLinks.push({ library: 'xbox', account: xbox.gamertag, linkedAt: xbox.createdAt.toISOString(), lastSyncedAt: xbox.lastSyncedAt?.toISOString() ?? null, linkExpiresAt: null });
  if (psn) {
    libraryLinks.push({
      library: 'playstation',
      account: null,
      linkedAt: psn.createdAt.toISOString(),
      lastSyncedAt: psn.lastSyncedAt?.toISOString() ?? null,
      linkExpiresAt: psn.refreshExpiresAt?.toISOString() ?? null,
    });
  }
  if (exophase) libraryLinks.push({ library: 'exophase', account: exophase.playerId, linkedAt: exophase.createdAt.toISOString(), lastSyncedAt: exophase.lastSyncedAt?.toISOString() ?? null, linkExpiresAt: null });

  if (retro) libraryLinks.push({ library: 'retroachievements', account: retro.username, linkedAt: retro.createdAt.toISOString(), lastSyncedAt: retro.lastSyncedAt?.toISOString() ?? null, linkExpiresAt: null });

  return {
    libraryLinks,
    aiSettings: ai ? { provider: ai.provider, model: ai.model, baseUrl: ai.baseUrl, hasApiKey: !!ai.apiKeyEncrypted } : null,
    roomsUsingYourAiKey: rooms.map((r) => r.name),
    mergedGames: merged.map((m) => ({ fromTitle: m.fromTitle, toTitle: m.toTitle, mergedAt: m.createdAt.toISOString() })),
  };
}
