import { useIsFetching } from '@tanstack/react-query';
import { useSteamImportContext } from '../context/SteamImportContext';
import { ACHIEVEMENTS_QUERY_KEY_PREFIX } from './useGameAchievements';

/** True while the app is doing background Steam work on the user's behalf - importing their
 * library, or fetching achievement counts for an open game's modal - so the Sidebar can show a
 * single "syncing" indicator regardless of which of those is actually running. Deliberately scoped
 * to *background* Steam syncs specifically, not general API activity (page loads, bulk edits,
 * price refresh, ...) - those already have their own inline busy states where they happen, and
 * folding every request in here would make the indicator spin so often it stops meaning anything. */
export function useSyncStatus(): boolean {
  const { busy: steamImportBusy } = useSteamImportContext();
  const achievementsFetching = useIsFetching({ queryKey: ACHIEVEMENTS_QUERY_KEY_PREFIX }) > 0;
  return steamImportBusy || achievementsFetching;
}
