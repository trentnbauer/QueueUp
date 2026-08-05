import { prisma } from '../db/client.js';
import { unlockBadges } from '../services/badges.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// A one-year anniversary only needs to be caught within a day of it actually happening, and the
// query below is cheap regardless of cadence - once a day is plenty.
export const ANNIVERSARY_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Year One (issue: "what other achievements can you think of") - unlocks for every user whose
 * account has passed its one-year anniversary and doesn't have the badge yet. Scans the whole
 * User table each run rather than something scoped to "users who just crossed the line since the
 * last run" - unlockBadge's own P2002 idempotency already makes re-checking an already-badged user
 * a cheap no-op, and a plain scan is simpler than tracking "last run" state anywhere else. */
export async function checkAnniversaryBadges(): Promise<void> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const eligible = await prisma.user.findMany({
    where: { createdAt: { lte: oneYearAgo }, badges: { none: { badgeKey: 'first_anniversary' } } },
    select: { id: true },
  });
  if (eligible.length === 0) return;

  await Promise.all(eligible.map((user) => unlockBadges(user.id, ['first_anniversary'])));
}

/** Registers the anniversary check to run on its own schedule (#489) - see jobs/scheduler.ts for
 * why this is a plain in-process interval rather than a cron container. Same single-process
 * reasoning as priceAlertJob/priceRefreshJob: prod runs exactly one non-replicated server. */
export function startAnniversaryBadgeJob(): JobHandle {
  return scheduleJob({
    name: 'anniversary-badge-check',
    intervalMs: ANNIVERSARY_CHECK_INTERVAL_MS,
    run: checkAnniversaryBadges,
  });
}
