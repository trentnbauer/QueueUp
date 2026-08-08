import type { PlayniteImportProgress } from '@queueup/shared';

/** Turns a finished PlayniteImportProgress into the "sync complete" toast's summary line (issue
 * #583) - kept in its own module, free of any React/router imports, so it's testable without
 * jsdom, same reasoning as toastReducer.ts being split out from ToastContext.tsx. */
export function summarizePlayniteSyncCompletion(progress: PlayniteImportProgress): string {
  const parts: string[] = [];
  if (progress.matched > 0) parts.push(`${progress.matched} game${progress.matched === 1 ? '' : 's'} synced`);
  if (progress.unmatched > 0) parts.push(`${progress.unmatched} need review`);
  if (progress.errored > 0) parts.push(`${progress.errored} failed`);
  return parts.length > 0
    ? `Playnite sync complete: ${parts.join(', ')}.`
    : 'Playnite sync complete - your library is already up to date.';
}
