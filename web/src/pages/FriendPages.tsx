import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { useFriendActivity, useFriends } from '../hooks/useFriends';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { PageShell } from './PageShell';
import { applyFeedFilter, FeedGroups, FilterChips, type FeedFilter } from './feed';

/** Friends' recent activity, newest first. */
export function ActivityPage() {
  const { user } = useAuth();
  const ui = useUi();
  const navigate = useNavigate();
  const friends = useFriends();
  const activity = useFriendActivity();
  const isLoading = activity.isLoading;
  const [filter, setFilter] = useState<FeedFilter>('all');
  const entries = applyFeedFilter(activity.data?.pages.flatMap((p) => p.entries) ?? [], filter);

  return (
    <PageShell title="Activity" hint="What your friends have been playing, beating and unlocking." backLabel="Shelf" to="/">
      <FilterChips value={filter} onChange={setFilter} />
      {isLoading && <div style={st('padding:20px 0;color:var(--muted);font-size:14.5px')}>Loading…</div>}
      <FeedGroups entries={entries} me={user?.id} onOpen={(e) => navigate(`/u/${e.user.id}`)} />
      {!isLoading && entries.length === 0 && (
        <div style={st('padding:20px 0;color:var(--muted);font-size:14.5px')}>
          {friends.friends.length === 0 ? 'Add a friend to see what they are playing.' : 'Nothing here yet.'}
        </div>
      )}
      {activity.hasNextPage && (
        <Btn height={40} fontSize={13.5} style={{ alignSelf: 'flex-start' }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
          {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Btn>
      )}
      <Btn height={40} fontSize={13.5} style={{ alignSelf: 'flex-start' }} onClick={() => ui.openDialog('friends')}>
        Manage friends
      </Btn>
    </PageShell>
  );
}
