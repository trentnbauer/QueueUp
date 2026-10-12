import { gamesApi } from '../api/games';
import { useT } from '../i18n';
import { ActivityLog } from './ActivityLog';

/** The shelf's History tab: everything that happened to the games on it, newest first. */
export function ShelfHistory() {
  const t = useT();
  return <ActivityLog queryKey={['shelf-activity']} fetchPage={(before) => gamesApi.activity(before)} emptyText={t('settings.shelf.activityEmpty')} />;
}
