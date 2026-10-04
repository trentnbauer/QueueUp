import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { useFriendActivity, useFriends } from '../hooks/useFriends';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { PageShell } from './PageShell';
import { useT } from '../i18n';
import { applyFeedFilter, FeedGroups, FilterChips, type FeedFilter } from './feed';

/** Friends' recent activity, newest first. */
export function ActivityPage() {
  const { user } = useAuth();
  const t = useT();
  const ui = useUi();
  const navigate = useNavigate();
  const friends = useFriends();
  const activity = useFriendActivity();
  const isLoading = activity.isLoading;
  const [filter, setFilter] = useState<FeedFilter>('all');
  const entries = applyFeedFilter(activity.data?.pages.flatMap((p) => p.entries) ?? [], filter);

  return (
    <PageShell title={t('pages.activity.title')} hint={t('pages.activity.hint')} backLabel={t('pages.activity.back')} to="/">
      <FilterChips value={filter} onChange={setFilter} />
      {isLoading && <div style={st('padding:20px 0;color:var(--muted);font-size:14.5px')}>{t('common.loading')}</div>}
      <FeedGroups entries={entries} me={user?.id} onOpen={(e) => navigate(`/u/${e.user.id}`)} />
      {!isLoading && entries.length === 0 && (
        <div style={st('padding:20px 0;color:var(--muted);font-size:14.5px')}>
          {friends.friends.length === 0 ? t('pages.activity.noFriends') : t('pages.activity.empty')}
        </div>
      )}
      {activity.hasNextPage && (
        <Btn height={40} fontSize={13.5} style={{ alignSelf: 'flex-start' }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
          {activity.isFetchingNextPage ? t('common.loading') : t('pages.activity.loadMore')}
        </Btn>
      )}
      <Btn height={40} fontSize={13.5} style={{ alignSelf: 'flex-start' }} onClick={() => ui.openDialog('friends')}>
        {t('pages.activity.manageFriends')}
      </Btn>
    </PageShell>
  );
}
