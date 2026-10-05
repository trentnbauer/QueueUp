import { prisma } from './client.js';
import { PLAYNITE_SOURCE } from '../services/playniteImport.js';
import { encryptPlaintextConfig } from '../services/configResolver.js';
import { announceNewLibrarySources } from '../services/libraryAnnouncements.js';

/** Reviews moved from columns on the Game row (one review per game, which the last room member to
 * save one overwrote) to the GameReview table (one per person per game). Copies any review still
 * on a Game row into GameReview and clears the old columns, in one transaction. Idempotent: once
 * the columns are cleared there's nothing left to copy, so it's a cheap no-op on every later boot.
 *
 * Shelf reviews belong to the shelf's owner (Game.addedBy). The old room-game columns never
 * recorded who wrote them, so those are credited to whoever added the game - the best available
 * guess. Logged and swallowed on failure, like ensureDbConstraints: it must not stop the app. */
export async function migrateLegacyReviews(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  try {
    const moved = await prisma.$transaction(async (tx) => {
      const copied = await tx.$executeRaw`
        INSERT INTO game_reviews (id, game_id, user_id, art, gameplay, story, sound, note, reviewed_at)
        SELECT gen_random_uuid(), id, added_by, review_art, review_gameplay, review_story, review_sound, review_note, reviewed_at
        FROM games
        WHERE reviewed_at IS NOT NULL
        ON CONFLICT (game_id, user_id) DO NOTHING
      `;
      await tx.$executeRaw`
        UPDATE games
        SET review_art = NULL, review_gameplay = NULL, review_story = NULL, review_sound = NULL, review_note = NULL, reviewed_at = NULL
        WHERE reviewed_at IS NOT NULL
      `;
      return copied;
    });
    if (moved > 0) logger.info(`Moved ${moved} review(s) to per-person reviews (game_reviews)`);
  } catch (err) {
    logger.warn(`Could not move legacy reviews (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

const SHARED_ALIAS_RESET_KEY = 'migration.sharedPlayniteAliasesReset';

/** Shared Playnite title matches (TitleMatchAlias rows with source 'playnite') used to include
 * manual picks any user made, so one person could decide which game a title became in everyone
 * else's import. Manual picks are per-user now (see userAliasSource in playniteImport.ts), but
 * rows written before that change can't be told apart from genuine exact-title matches, so they
 * are all cleared once. Exact matches come back by themselves on the next sync; a title someone
 * matched by hand goes back to Needs matching for them to pick again. Per-user rows are untouched.
 * Runs once - recorded in app_settings, because later syncs legitimately re-create shared rows. */
export async function resetSharedPlayniteAliases(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  try {
    if (await prisma.appSetting.findUnique({ where: { key: SHARED_ALIAS_RESET_KEY } })) return;
    const { count } = await prisma.titleMatchAlias.deleteMany({ where: { source: PLAYNITE_SOURCE } });
    await prisma.appSetting.create({ data: { key: SHARED_ALIAS_RESET_KEY, value: new Date().toISOString() } });
    if (count > 0) logger.info(`Cleared ${count} shared Playnite title match(es); exact matches rebuild on the next sync`);
  } catch (err) {
    logger.warn(`Could not reset shared Playnite title matches (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

const PROFILE_VISIBILITY_KEY = 'migration.profileVisibilityFromPublicFlag';

/** Profile visibility went from an on/off switch (publicProfileEnabled) to public / friends /
 * private. The new column starts as public for everyone, so each person who had switched it off is
 * moved to friends - the people who could still see their profile then. Runs once (recorded in
 * app_settings), so a later change to the new setting is never overwritten. */
export async function migrateProfileVisibility(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  try {
    if (await prisma.appSetting.findUnique({ where: { key: PROFILE_VISIBILITY_KEY } })) return;
    const { count } = await prisma.user.updateMany({ where: { publicProfileEnabled: false }, data: { profileVisibility: 'friends' } });
    await prisma.appSetting.create({ data: { key: PROFILE_VISIBILITY_KEY, value: new Date().toISOString() } });
    if (count > 0) logger.info(`Set ${count} profile(s) with the public switch off to friends-only`);
  } catch (err) {
    logger.warn(`Could not migrate profile visibility (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

const SPIN_MODES_KEY = 'migration_spin_modes_v1';

/** Before spin modes existed, every room's spin theme (default "slot") still drew the reel. Moves
 * every room to "reel" once, so nobody's spin changes until a Room Master picks a mode. Runs once
 * (recorded in app_settings), so a mode chosen later is never overwritten. */
export async function migrateSpinModes(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  try {
    if (await prisma.appSetting.findUnique({ where: { key: SPIN_MODES_KEY } })) return;
    const { count } = await prisma.room.updateMany({ where: { spinWheelTheme: { not: 'reel' } }, data: { spinWheelTheme: 'reel' } });
    await prisma.appSetting.create({ data: { key: SPIN_MODES_KEY, value: new Date().toISOString() } });
    if (count > 0) logger.info(`Set ${count} room(s) to the reel spin`);
  } catch (err) {
    logger.warn(`Could not migrate room spin themes (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Email alerts only include notifications created after `emailEnabledAt`, which is set when email
 * is switched on. Preferences saved before that column existed have it empty, and the email job
 * falls back to `updatedAt` for them - but `updatedAt` moves on *any* edit (toggling the in-app flag),
 * so such a row could still silently skip unread alerts. Fixes the cut-off at the last-edited time
 * once, for every email-on row that has none. Idempotent: afterwards no email-on row is missing one
 * (the preferences route sets it whenever email is switched on), so it is a cheap no-op on every
 * later boot. */
export async function backfillEmailEnabledAt(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  try {
    const count = await prisma.$executeRaw`
      UPDATE notification_preferences
      SET email_enabled_at = updated_at
      WHERE email = true AND email_enabled_at IS NULL
    `;
    if (count > 0) logger.info(`Fixed the email-alert cut-off for ${count} older preference(s)`);
  } catch (err) {
    logger.warn(`Could not backfill email alert cut-offs (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** One-time data fixes that run at boot, after the schema is in place. Each is idempotent. */
export async function runDataMigrations(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  await migrateLegacyReviews(logger);
  await backfillEmailEnabledAt(logger);
  await resetSharedPlayniteAliases(logger);
  await migrateProfileVisibility(logger);
  await migrateSpinModes(logger);
  await announceNewLibrarySources(logger);
  try {
    const count = await encryptPlaintextConfig();
    if (count > 0) logger.info(`Encrypted ${count} integration key(s) stored in Administrator settings`);
  } catch (err) {
    logger.warn(`Could not encrypt stored integration keys (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}
