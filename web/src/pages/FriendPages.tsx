import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { useFriendActivity, useFriends } from '../hooks/useFriends';
import { BlockedPeople } from '../dialogs/BlockedPeople';
import { friendLink } from '../dialogs/SocialDialogs';
import { Avatar, Banner, Btn, Group, Kicker, Segmented, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { PageShell } from './PageShell';
import { rich, useT } from '../i18n';
import { applyFeedFilter, FeedGroups, FilterChips, type FeedFilter } from './feed';

export type FriendsTab = 'activity' | 'friends' | 'requests';
const FRIENDS_TABS: FriendsTab[] = ['activity', 'friends', 'requests'];
const isFriendsTab = (v: string | null): v is FriendsTab => FRIENDS_TABS.includes(v as FriendsTab);

const EMPTY = 'padding:20px 0;color:var(--muted);font-size:14.5px';

/** Friends (`/friends?tab=…`): what friends are doing, the friends list (with add by code), and
 * friend requests both ways. */
export function FriendsPage() {
  const t = useT();
  const ui = useUi();
  const friends = useFriends();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  // On a private instance everyone is already a friend, so there are no codes or requests to show.
  const tab: FriendsTab = isFriendsTab(raw) && !(friends.privateInstance && raw === 'requests') ? raw : 'activity';

  return (
    <PageShell
      title={t('pages.friends.title')}
      hint={t('pages.friends.hint')}
      back={false}
      action={
        friends.myCode && !friends.privateInstance ? (
          <Btn
            height={42}
            onClick={async () => {
              await navigator.clipboard.writeText(friendLink(friends.myCode));
              ui.notify(t('social.friends.linkCopied'));
            }}
          >
            {t('pages.friends.copyLink')}
          </Btn>
        ) : undefined
      }
    >
      <Segmented
        columns={friends.privateInstance ? 2 : 3}
        style={{ maxWidth: 520 }}
        value={tab}
        onChange={(v) => setParams(v === 'activity' ? {} : { tab: v }, { replace: true })}
        options={[
          { value: 'activity', label: t('pages.friends.tab.activity') },
          { value: 'friends', label: t('pages.friends.tab.friends') },
          ...(friends.privateInstance ? [] : [{ value: 'requests' as const, label: t('pages.friends.tab.requests'), badge: friends.incoming.length }]),
        ]}
      />
      {tab === 'activity' && <ActivityFeed />}
      {tab === 'friends' && <FriendsList />}
      {tab === 'requests' && <FriendRequests />}
    </PageShell>
  );
}

/** Friends' recent activity, newest first. */
function ActivityFeed() {
  const { user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const friends = useFriends();
  const activity = useFriendActivity();
  const isLoading = activity.isLoading;
  const [filter, setFilter] = useState<FeedFilter>('all');
  const entries = applyFeedFilter(activity.data?.pages.flatMap((p) => p.entries) ?? [], filter);

  return (
    <>
      <FilterChips value={filter} onChange={setFilter} />
      {isLoading && <div style={st(EMPTY)}>{t('common.loading')}</div>}
      <FeedGroups entries={entries} me={user?.id} onOpen={(e) => navigate(`/u/${e.user.id}`)} />
      {!isLoading && entries.length === 0 && (
        <div style={st(EMPTY)}>{friends.friends.length === 0 ? t('pages.activity.noFriends') : t('pages.activity.empty')}</div>
      )}
      {activity.hasNextPage && (
        <Btn height={40} fontSize={13.5} style={{ alignSelf: 'flex-start' }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
          {activity.isFetchingNextPage ? t('common.loading') : t('pages.activity.loadMore')}
        </Btn>
      )}
    </>
  );
}

/** The friends list (tap one for their profile), add by code or link, and blocked people. */
function FriendsList() {
  const ui = useUi();
  const navigate = useNavigate();
  const t = useT();
  const queryClient = useQueryClient();
  const friends = useFriends();
  const confirm = useConfirm();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function removeFriend(id: string, name: string) {
    const ok = await confirm({
      title: t('social.friends.removeTitle', { name }),
      message: t('social.friends.removeMessage'),
      confirmLabel: t('social.friends.removeFriend'),
      danger: true,
    });
    if (!ok) return;
    try {
      await friends.unfriend(id);
      ui.notify(t('social.friends.removed', { name }));
    } catch (e) {
      setError(friends.errorMessage(e, t('social.friends.removeError')));
    }
  }

  async function send() {
    // Accepts a pasted friend link as well as a bare code.
    const c = code.trim().match(/\/add\/([^/?#\s]+)/)?.[1] ?? code.trim();
    if (!c) return;
    setSending(true);
    setError(null);
    try {
      const res = await friends.sendRequest(c);
      setCode('');
      ui.notify(res.accepted ? t('social.friends.nowFriends', { name: res.user.displayName }) : t('social.friends.sent', { name: res.user.displayName }));
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      setError(friends.errorMessage(e, t('social.friends.sendError')));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {!friends.privateInstance && (
        <div style={st('display:flex;flex-direction:column;gap:8px;max-width:560px')}>
          <div style={st('display:flex;gap:8px')}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={t('social.friends.codePlaceholder')}
              aria-label={t('social.friends.codeAria')}
              style={st(inputPill, { flex: 1, minWidth: 0, border: '1px solid var(--line)' })}
            />
            <Btn kind="accent" height={44} padX={16} weight={700} disabled={!code.trim() || sending} onClick={send}>
              {t('social.friends.send')}
            </Btn>
          </div>
          {friends.myCode && (
            <span style={st('font:500 12.5px/1.45 var(--font-ui);color:var(--muted)')}>
              {rich(t('social.friends.shareHint'), { code: <span style={st('font-family:var(--font-mono);color:var(--text)')}>{friends.myCode}</span> })}
            </span>
          )}
        </div>
      )}
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('pages.friends.count', { n: friends.friends.length })}</Kicker>
        {friends.friends.length > 0 && (
          <Group>
            {friends.friends.map((f) => (
              <div key={f.id} style={st('display:flex;align-items:stretch;background:var(--surf)')}>
                <button
                  type="button"
                  className="hv-surf2"
                  onClick={() => {
                    ui.selectGame(null);
                    navigate(`/u/${f.id}`);
                  }}
                  style={st('display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 8px 10px 14px;border:none;background:var(--surf);color:var(--text);text-align:left;flex:1;min-width:0')}
                >
                  <Avatar name={f.displayName} color={f.avatarColor} avatarUrl={f.avatarUrl} size={36} fontSize={14} />
                  <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                    <span style={st('font:600 15px var(--font-ui)')}>{f.displayName}</span>
                    <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                      {f.profilePrivate ? t('social.friends.private') : t(f.sharedRoomCount === 1 ? 'social.friends.stats.one' : 'social.friends.stats.other', { beaten: f.beatenCount, n: f.sharedRoomCount })}
                    </span>
                  </span>
                  <span style={st('color:var(--muted);font-size:20px')}>›</span>
                </button>
                <button
                  type="button"
                  className="hv-surf2"
                  aria-label={t('social.friends.removeAria', { name: f.displayName })}
                  title={t('social.friends.removeFriend')}
                  onClick={() => void removeFriend(f.id, f.displayName)}
                  style={st('flex-shrink:0;width:48px;border:none;background:var(--surf);color:var(--danger);font:600 20px var(--font-ui)')}
                >
                  ×
                </button>
              </div>
            ))}
          </Group>
        )}
        {!friends.isLoading && friends.friends.length === 0 && <div style={st(EMPTY)}>{t('social.friends.empty')}</div>}
      </div>
      <BlockedPeople />
    </>
  );
}

/** Requests to you (accept or decline) and from you (cancel). */
function FriendRequests() {
  const ui = useUi();
  const t = useT();
  const friends = useFriends();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);

  async function resolve(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      ui.notify(done);
    } catch (e) {
      setError(friends.errorMessage(e, t('social.error.generic')));
    }
  }

  async function dropRequest(id: string, name: string, cancel: boolean) {
    const ok = await confirm(
      cancel
        ? { title: t('social.requests.cancelTitle', { name }), message: t('social.requests.cancelMessage'), confirmLabel: t('social.requests.cancelConfirm'), danger: true }
        : { title: t('social.requests.declineTitle', { name }), message: t('social.requests.declineMessage'), confirmLabel: t('social.requests.decline'), danger: true },
    );
    if (ok) await resolve(() => friends.removeRequest(id), cancel ? t('social.requests.cancelled') : t('social.requests.declined'));
  }

  const row = 'display:flex;align-items:center;gap:10px;min-height:60px;padding:10px 10px 10px 14px;background:var(--surf)';
  return (
    <>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {friends.incoming.length > 0 && (
        <Group>
          {friends.incoming.map((r) => (
            <div key={r.id} style={st(row)}>
              <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} profileUserId={r.user.id} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{r.user.displayName}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('social.friends.wantsToBeFriends')}</span>
              </span>
              <Btn kind="ghost" height={34} padX={8} fontSize={12.5} onClick={() => void dropRequest(r.id, r.user.displayName, false)}>
                {t('social.requests.decline')}
              </Btn>
              <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={() => resolve(() => friends.accept(r.id), t('social.friends.nowFriends', { name: r.user.displayName }))}>
                {t('social.requests.accept')}
              </Btn>
            </div>
          ))}
        </Group>
      )}
      {friends.outgoing.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <Kicker>{t('pages.friends.sent', { n: friends.outgoing.length })}</Kicker>
          <Group>
            {friends.outgoing.map((r) => (
              <div key={r.id} style={st(row)}>
                <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} profileUserId={r.user.id} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 15px var(--font-ui)')}>{r.user.displayName}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('social.friends.waiting')}</span>
                </span>
                <Btn kind="ghost" height={34} padX={10} fontSize={12.5} onClick={() => void dropRequest(r.id, r.user.displayName, true)}>
                  {t('common.cancel')}
                </Btn>
              </div>
            ))}
          </Group>
        </div>
      )}
      {!friends.isLoading && friends.incoming.length === 0 && friends.outgoing.length === 0 && <div style={st(EMPTY)}>{t('pages.friends.noRequests')}</div>}
    </>
  );
}
