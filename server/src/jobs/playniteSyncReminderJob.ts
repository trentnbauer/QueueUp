import { PLAYNITE_API_KEY_LABEL } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { notifyPlayniteSyncReminder } from '../services/notifications.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Same cadence as playtimeSnapshotJob - frequent enough that the 48h threshold below is caught
// promptly, cheap enough (one indexed query, no external API calls) not to matter.
export const PLAYNITE_SYNC_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Issue #570's own proposed threshold - a Playnite-linked user who hasn't synced in this long
// gets nudged to open Playnite and push again, since there's no automatic sync yet (see
// PlayniteImportModal's own "no automatic sync" wording).
export const PLAYNITE_SYNC_STALE_MS = 48 * 60 * 60 * 1000;

/** Reminds anyone with an active Playnite setup-code key who hasn't synced in 48+ hours (issue
 * #570). "Synced" is approximated by ApiKey.lastUsedAt - the same first-call signal
 * PlayniteImportModal's own linking step polls for - falling back to the key's createdAt for a
 * key that's never been used at all (never got as far as pasting the code into Playnite).
 * Revoked keys are excluded entirely - no key means no reminder to send. A user with more than one
 * active Playnite key (e.g. they regenerated a lost code) is only ever considered by their most
 * recently active one, so they get at most one reminder, not one per key. */
async function remindStaleSyncs(): Promise<void> {
  const keys = await prisma.apiKey.findMany({
    where: { label: PLAYNITE_API_KEY_LABEL, revokedAt: null },
    select: { userId: true, createdAt: true, lastUsedAt: true },
  });
  if (keys.length === 0) return;

  const mostRecentActivityByUser = new Map<string, number>();
  for (const key of keys) {
    const activity = (key.lastUsedAt ?? key.createdAt).getTime();
    const current = mostRecentActivityByUser.get(key.userId);
    if (current === undefined || activity > current) mostRecentActivityByUser.set(key.userId, activity);
  }

  const staleBefore = Date.now() - PLAYNITE_SYNC_STALE_MS;
  const staleUserIds = Array.from(mostRecentActivityByUser.entries())
    .filter(([, activity]) => activity < staleBefore)
    .map(([userId]) => userId);

  await Promise.all(staleUserIds.map((userId) => notifyPlayniteSyncReminder(userId)));
}

/** Registers the Playnite sync-staleness check to run on its own schedule (#570) - same
 * single-process reasoning as the other scheduled jobs (see releaseWatchJob.ts). Unconditional,
 * not gated behind an env flag like playtimeSnapshotJob - this is a cheap DB-only check against
 * data QueueUp already has (ApiKey.lastUsedAt), not an external polling loop with its own cost to
 * opt into. */
export function startPlayniteSyncReminderJob(): JobHandle {
  return scheduleJob({
    name: 'playnite-sync-reminder',
    intervalMs: PLAYNITE_SYNC_REMINDER_INTERVAL_MS,
    run: remindStaleSyncs,
  });
}
