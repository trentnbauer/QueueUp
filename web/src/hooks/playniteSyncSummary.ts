import type { PlayniteImportProgress } from '@queueup/shared';
import { t } from '../i18n';

/** Turns a finished PlayniteImportProgress into the "sync complete" toast's summary line (issue
 * #583) - kept in its own module, free of any React/router imports, so it's testable without
 * jsdom, same reasoning as toastReducer.ts being split out from ToastContext.tsx. */
export function summarizePlayniteSyncCompletion(progress: PlayniteImportProgress): string {
  const parts: string[] = [];
  // Each part is a whole phrase of its own, listed after the sentence's colon.
  if (progress.matched > 0) parts.push(t(progress.matched === 1 ? 'add.playnite.part.synced.one' : 'add.playnite.part.synced.other', { n: progress.matched }));
  if (progress.unmatched > 0) parts.push(t('add.playnite.part.needReview', { n: progress.unmatched }));
  if (progress.errored > 0) parts.push(t('add.playnite.part.failed', { n: progress.errored }));
  return parts.length > 0
    ? t('add.playnite.complete', { parts: parts.join(t('add.playnite.listSeparator')) })
    : t('add.playnite.upToDate');
}
