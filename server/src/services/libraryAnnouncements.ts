import { prisma } from '../db/client.js';

/** Tells everyone about new ways to sync a library. Each source is announced once, to the people who
 * already had an account when it arrived (a person who signs up later sees the options in onboarding
 * instead). Runs at boot (see runDataMigrations): add a line to LIBRARY_ANNOUNCEMENTS when a new sync
 * ships, and the next boot sends one notification per person. Which sources have been announced is
 * kept in app_settings, so a restart never repeats one. On a brand-new server there is nobody to tell,
 * and the sources are simply marked as announced. */

export const LIBRARY_ANNOUNCEMENTS = [
  { id: 'xbox', label: 'Xbox' },
  { id: 'psn', label: 'PlayStation' },
  { id: 'exophase', label: 'Exophase' },
  { id: 'retroachievements', label: 'RetroAchievements' },
] as const;

const ANNOUNCED_KEY = 'announcement.librarySources';

/** The notification text for these sources, or null when there is nothing to say. */
export function announcementMessage(labels: string[]): string | null {
  if (labels.length === 0) return null;
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `New ways to sync your library: ${list}. Open Libraries to link ${labels.length === 1 ? 'it' : 'one'}.`;
}

export async function announceNewLibrarySources(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ANNOUNCED_KEY } });
    const announced = new Set<string>(row ? (JSON.parse(row.value) as string[]) : []);
    const fresh = LIBRARY_ANNOUNCEMENTS.filter((s) => !announced.has(s.id));
    if (fresh.length === 0) return;

    const message = announcementMessage(fresh.map((s) => s.label))!;
    const users = await prisma.user.findMany({ select: { id: true } });
    if (users.length > 0) {
      await prisma.notification.createMany({
        data: users.map((u) => ({ recipientId: u.id, roomName: 'Personal Shelf', type: 'library_sync_available' as const, message })),
      });
    }
    // Recorded only after the notifications are written, so a failure part-way is retried next boot.
    const value = JSON.stringify([...announced, ...fresh.map((s) => s.id)]);
    await prisma.appSetting.upsert({ where: { key: ANNOUNCED_KEY }, create: { key: ANNOUNCED_KEY, value }, update: { value } });
    if (users.length > 0) logger.info(`Told ${users.length} user(s) about new library syncs: ${fresh.map((s) => s.label).join(', ')}`);
  } catch (err) {
    logger.warn(`Could not announce new library syncs (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}
