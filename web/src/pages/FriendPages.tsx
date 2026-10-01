import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { useFriendActivity, useFriendProfile, useFriends } from '../hooks/useFriends';
import { Avatar, Btn, Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { PageShell, SectionTitle, StatTiles } from './PageShell';
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
      <FeedGroups entries={entries} me={user?.id} onOpen={(e) => navigate(`/friends/${e.user.id}`)} />
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

/** One friend: counts, what they're playing, and their activity. */
export function FriendProfilePage() {
  const { userId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const ui = useUi();
  const friends = useFriends();
  const { data, isLoading, error } = useFriendProfile(userId);
  const [filter, setFilter] = useState<FeedFilter>('all');

  if (isLoading) {
    return (
      <PageShell title="Friend" backLabel="Activity" to="/activity">
        <span style={st('color:var(--muted)')}>Loading…</span>
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell title="Friend" backLabel="Activity" to="/activity">
        <span style={st('color:var(--muted)')}>{error instanceof Error ? error.message : "Couldn't load that profile."}</span>
      </PageShell>
    );
  }

  const entries = applyFeedFilter(data.activity, filter);

  async function remove() {
    const ok = await confirm({
      title: `Remove ${data!.user.displayName}?`,
      message: "They won't see your activity and you won't see theirs. You can add each other again with a friend code.",
      confirmLabel: 'Remove friend',
      danger: true,
    });
    if (!ok) return;
    await friends.unfriend(userId);
    ui.notify(`${data!.user.displayName} removed`);
    navigate('/activity');
  }

  return (
    <PageShell
      title={data.user.displayName}
      hint={`Friends since ${new Date(data.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · ${data.sharedRoomCount} shared room${data.sharedRoomCount === 1 ? '' : 's'}`}
      backLabel="Activity"
      to="/activity"
    >
      <div style={st('display:flex;align-items:center;gap:14px')}>
        <Avatar name={data.user.displayName} color={data.user.avatarColor} avatarUrl={data.user.avatarUrl} size={64} fontSize={24} />
      </div>
      <StatTiles
        stats={[
          { v: data.beatenCount, l: 'beaten' },
          { v: data.playing.length, l: 'playing now' },
          { v: data.achievementCount, l: 'achievements' },
        ]}
      />
      {data.playing.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <SectionTitle>Playing now</SectionTitle>
          <div style={st('display:flex;gap:12px;overflow-x:auto;scrollbar-width:none')}>
            {data.playing.map((p) => (
              <div key={p.id} style={st('width:112px;flex-shrink:0;display:flex;flex-direction:column;gap:6px')}>
                <Cover title={p.title} url={p.coverImageUrl} width={112} radius={14} />
                <span style={st('font:600 13px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.title}</span>
                <span style={st('font:400 11.5px var(--font-ui);color:var(--muted)')}>since {new Date(p.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <FilterChips value={filter} onChange={setFilter} />
      <FeedGroups entries={entries} me={user?.id} compact />
      {entries.length === 0 && <div style={st('padding:12px 0;color:var(--muted);font-size:14px')}>Nothing in this category yet.</div>}
      <button type="button" onClick={remove} style={st('align-self:flex-start;height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 14px var(--font-ui)')}>
        Remove friend
      </button>
    </PageShell>
  );
}
