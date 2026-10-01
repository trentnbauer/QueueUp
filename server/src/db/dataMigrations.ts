import { prisma } from './client.js';
import { PLAYNITE_SOURCE } from '../services/playniteImport.js';

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

/** One-time data fixes that run at boot, after the schema is in place. Each is idempotent. */
export async function runDataMigrations(logger: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  await migrateLegacyReviews(logger);
  await resetSharedPlayniteAliases(logger);
}
