import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { REVIEW_CATEGORIES, type PublicUserProfile } from '@queueup/shared';
import { authApi } from '../api/auth';
import { publicProfileApi } from '../api/publicProfile';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { useFriendProfile, useFriends } from '../hooks/useFriends';
import { Dialog } from '../ui/Dialog';
import { applyFeedFilter, FeedGroups, FilterChips, type FeedFilter } from './feed';
import { useRooms } from '../hooks/useRooms';
import { useVersion } from '../hooks/useVersion';
import { REVIEW_EMOJI, reviewAverage } from '../lib/gameView';
import { Avatar, Btn, Cover, Wordmark, AppMark } from '../ui/primitives';
import { st } from '../ui/st';

const FEATURES: [string, string][] = [
  ['🎮', 'Track your backlog across every platform you own'],
  ['🗳️', "Vote with your squad on what's up next"],
  ['🎡', 'Spin the Wheel when nobody can decide'],
  ['💸', 'Watch prices and auto-sync Steam achievements'],
];

const PROVIDER_STYLE: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  google: { label: 'Sign in with Google', bg: 'var(--text)', fg: 'var(--onText)', border: 'none' },
  discord: { label: 'Sign in with Discord', bg: '#5865F2', fg: '#fff', border: 'none' },
  steam: { label: 'Sign in with Steam', bg: '#1b2838', fg: '#fff', border: 'none' },
  oidc: { label: 'Single sign-on', bg: 'transparent', fg: 'var(--text)', border: '1px solid var(--line)' },
  dev: { label: 'Sign in (development)', bg: 'var(--text)', fg: 'var(--onText)', border: 'none' },
};

/** Signed-out landing page: what QueueUp is, then one button per configured sign-in method. */
export function LoginPage({ providers }: { providers: string[] | null }) {
  const { version } = useVersion();
  const list = providers === null ? [] : providers.length > 0 ? providers : ['dev'];
  return (
    <div style={st('min-height:100vh;background:var(--bg);color:var(--text);display:flex;flex-direction:column;overflow-y:auto')}>
      <div style={st('flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:40px 24px 24px;max-width:440px;width:100%;margin:0 auto')}>
        <div style={st('display:flex;flex-direction:column;gap:12px')}>
          <div style={st('display:flex;align-items:center;gap:16px')}>
            <AppMark size={46} />
            <Wordmark size={46} />
          </div>
          <span style={st('font:500 18px var(--font-ui);color:var(--text2)')}>Pick a game, together.</span>
        </div>
        <div style={st('display:flex;flex-direction:column;gap:12px')}>
          {FEATURES.map(([e, t]) => (
            <div key={t} style={st('display:flex;align-items:center;gap:12px;font:400 14.5px/1.4 var(--font-ui);color:var(--text2)')}>
              <span style={st('width:36px;height:36px;flex-shrink:0;border-radius:12px;background:var(--surf);display:flex;align-items:center;justify-content:center;font-size:17px')}>{e}</span>
              {t}
            </div>
          ))}
        </div>
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          {list.map((p) => {
            const s = PROVIDER_STYLE[p] ?? { label: `Sign in with ${p}`, bg: 'transparent', fg: 'var(--text)', border: '1px solid var(--line)' };
            return (
              <a
                key={p}
                href={authApi.loginUrl(p)}
                style={st(`height:52px;border-radius:999px;border:${s.border};background:${s.bg};color:${s.fg};font:700 15px var(--font-ui);display:flex;align-items:center;justify-content:center;text-decoration:none`)}
              >
                {s.label}
              </a>
            );
          })}
        </div>
      </div>
      <div style={st('flex-shrink:0;padding:16px 24px 24px;text-align:center;font:400 12px var(--font-ui);color:var(--faint)')}>
        Self-hosted QueueUp{version ? ` · ${version}` : ''} ·{' '}
        <a href="https://github.com/trentnbauer/QueueUp" target="_blank" rel="noopener noreferrer" style={st('color:var(--muted)')}>
          Source
        </a>
      </div>
    </div>
  );
}

/** `/join/:code`: joins straight away; shows a spinner, or the error with a way back. */
export function JoinPage({ code }: { code: string }) {
  const navigate = useNavigate();
  const ui = useUi();
  const { joinRoom } = useRooms();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    joinRoom
      .mutateAsync({ inviteCode: code })
      .then(({ room }) => {
        navigate(`/room/${room.id}`, { replace: true });
        ui.notify(`Joined ${room.name}`);
      })
      .catch(() => setError(`Couldn't join with ${code}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div style={st('position:fixed;inset:0;z-index:20;background:var(--bg);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px 24px;text-align:center')}>
      {!error ? (
        <>
          <span style={st('width:44px;height:44px;border-radius:50%;border:4px solid var(--chip);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />
          <span style={st('margin-top:8px;font:600 12px var(--font-mono);letter-spacing:0.08em;color:var(--muted)')}>JOINING ROOM</span>
          <span style={st('font:700 30px/1.05 var(--font-display);letter-spacing:-0.02em')}>{code}</span>
          <span style={st('font:400 14px/1.45 var(--font-ui);color:var(--muted)')}>Hang tight, adding you to the room…</span>
        </>
      ) : (
        <>
          <div role="alert" style={st('width:100%;max-width:360px;display:flex;align-items:flex-start;gap:10px;padding:14px;border-radius:16px;background:var(--errBg);border:1px solid var(--errLine);text-align:left')}>
            <span style={st('flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--errBadge);color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px var(--font-ui);margin-top:1px')}>!</span>
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{error}</span>
              <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>This invite link is invalid or has expired. Ask whoever sent it for a fresh one.</span>
            </span>
          </div>
          <Btn height={48} padX={22} fontSize={14.5} onClick={() => navigate('/', { replace: true })}>
            Back to your shelf
          </Btn>
        </>
      )}
    </div>
  );
}

/** `/u/:id`: one profile page for everyone - the anonymous shareable view, and (when signed in) the
 * same page with a friend's activity and controls (it replaces the old separate /friends/:id page). */
export function PublicProfilePage({ userId, signedIn }: { userId: string; signedIn: boolean }) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [modal, setModal] = useState<'achievements' | 'library' | null>(null);
  const beatenRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    publicProfileApi
      .get(userId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setState('ok');
      })
      .catch(() => !cancelled && setState('missing'));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => () => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const tile = (value: number, label: string, onClick: () => void, arrow: string) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className="hv-surf2"
      style={st('min-width:104px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:14px 18px;border-radius:18px;border:1px solid transparent;background:var(--surf);color:var(--text);text-align:left')}
    >
      <span style={st('font:700 30px/1 var(--font-display)')}>{value}</span>
      <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
        {label} {arrow}
      </span>
    </button>
  );

  return (
    <div style={st('min-height:100vh;background:var(--bg);color:var(--text)')}>
      <div style={st('border-bottom:1px solid var(--chip);background:linear-gradient(170deg, var(--hero1), var(--bg) 85%)')}>
        <div style={st('max-width:1120px;margin:0 auto;padding:0 clamp(16px,4vw,40px)')}>
          <div style={st('display:flex;align-items:center;gap:10px;height:68px')}>
            <Link to="/" style={st('flex:1;display:flex;text-decoration:none')}>
              <Wordmark size={23} />
            </Link>
            <Link to="/" style={st('height:40px;padding:0 18px;border-radius:999px;border:1px solid var(--line);color:var(--text);font:600 13.5px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
              {signedIn ? 'Open QueueUp' : 'Sign in'}
            </Link>
          </div>
          {state === 'ok' && profile && (
            <div style={st('display:flex;flex-wrap:wrap;align-items:flex-end;gap:24px 40px;padding:30px 0 34px')}>
              <div style={st('flex:1 1 360px;display:flex;align-items:center;gap:22px;min-width:0')}>
                <Avatar name={profile.displayName} color={profile.avatarColor} avatarUrl={profile.avatarUrl} size={104} fontSize={42} style={{ boxShadow: '0 0 0 5px var(--bg)' }} />
                <span style={st('display:flex;flex-direction:column;gap:6px;min-width:0')}>
                  <span style={st('font:700 clamp(30px,6vw,48px)/1 var(--font-display);letter-spacing:-0.035em;overflow-wrap:anywhere')}>{profile.displayName}</span>
                  <span style={st('font:400 14.5px var(--font-ui);color:var(--muted)')}>
                    On QueueUp since {new Date(profile.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </span>
                  {profile.systems.length > 0 && (
                    <span style={st('display:flex;flex-wrap:wrap;gap:6px;margin-top:6px')}>
                      {profile.systems.map((s) => (
                        <span key={s} style={st('height:26px;padding:0 10px;border-radius:999px;background:var(--chip);color:var(--text2);font:600 12px var(--font-ui);display:flex;align-items:center')}>
                          {s}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </div>
              <div style={st('display:flex;gap:10px;flex-wrap:wrap')}>
                {tile(profile.currentlyPlaying.length, 'playing', scrollTo(playingRef), '↓')}
                {tile(profile.beatenGameCount, 'beaten', scrollTo(beatenRef), '↓')}
                {tile(profile.library.length, 'library', () => setModal('library'), '›')}
                {tile(profile.badges.length, 'achievements', () => setModal('achievements'), '›')}
              </div>
            </div>
          )}
        </div>
      </div>

      {state === 'loading' && <div style={st('padding:48px 24px;text-align:center;color:var(--muted)')}>Loading…</div>}
      {state === 'missing' && <div style={st('padding:48px 24px;text-align:center;color:var(--muted)')}>This profile isn't public, or doesn't exist.</div>}

      {state === 'ok' && profile && (
        <div style={st('max-width:1120px;margin:0 auto;padding:32px clamp(16px,4vw,40px) 56px;display:flex;flex-direction:column;gap:40px')}>
          <div ref={playingRef} style={st('display:flex;flex-direction:column;gap:14px;scroll-margin-top:16px')}>
            <span style={st('font:700 26px var(--font-display);letter-spacing:-0.02em')}>Currently playing</span>
            {profile.currentlyPlaying.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>Nothing right now.</span>}
            <div style={st('display:flex;flex-wrap:wrap;gap:20px')}>
              {profile.currentlyPlaying.map((g) => (
                <div key={g.id} style={st('width:min(100%,200px);display:flex;flex-direction:column;gap:8px')}>
                  <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={18} style={{ boxShadow: '0 20px 44px oklch(0 0 0 / 0.35)' }} />
                  <span style={st('font:700 16px var(--font-display)')}>{g.title}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{g.platform}</span>
                </div>
              ))}
            </div>
          </div>

          {profile.upNext.length > 0 && (
            <div style={st('display:flex;flex-direction:column;gap:12px')}>
              <span style={st('font:700 20px var(--font-display)')}>Up next</span>
              <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:14px')}>
                {profile.upNext.map((g, i) => (
                  <div key={g.id} style={st('min-width:0;display:flex;flex-direction:column;gap:6px')}>
                    <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={14} />
                    <span style={st('font:600 12.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                      <span style={st('font-family:var(--font-mono);color:var(--muted)')}>{i + 1}. </span>
                      {g.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={beatenRef} style={st('display:flex;flex-direction:column;gap:10px;scroll-margin-top:16px')}>
            <span style={st('display:flex;align-items:baseline;gap:10px')}>
              <span style={st('font:700 16px var(--font-display)')}>Beaten</span>
              <span style={st('font:500 11.5px var(--font-mono);color:var(--muted)')}>{profile.beatenGameCount}</span>
            </span>
            {profile.beatenGames.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>Nothing beaten yet.</span>}
            <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:6px')}>
              {profile.beatenGames.map((g) => {
                const avg = g.review ? reviewAverage(g.review) : null;
                return (
                  <div key={g.id} title={g.review?.note ?? undefined} style={st('display:flex;align-items:center;gap:10px;padding:6px 10px 6px 6px;border-radius:12px;background:var(--surf)')}>
                    <Cover title={g.title} url={g.coverImageUrl} width={30} radius={6} />
                    <span style={st('flex:1;min-width:0;font:600 13px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                    {avg !== null && <span style={st('flex-shrink:0;font:700 12px var(--font-display);color:var(--accText)')}>{avg.toFixed(1)}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {signedIn && profile.viewer === 'friend' && <FriendExtras profile={profile} />}

          {!signedIn && (
            <div style={st('display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:22px;border-radius:22px;background:linear-gradient(140deg, var(--hero1), var(--surf));max-width:420px')}>
              <span style={st('font:700 20px var(--font-display)')}>Pick a game, together.</span>
              <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>Track your backlog and vote on what's next with friends.</span>
              <Link to="/" style={st('height:44px;padding:0 20px;border-radius:999px;background:var(--acc);color:var(--ink);font:700 14px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
                Get QueueUp
              </Link>
            </div>
          )}
        </div>
      )}

      {modal === 'achievements' && profile && (
        <Dialog title="Achievements" onClose={() => setModal(null)} width={560}>
          {profile.badges.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>No achievements unlocked yet.</span>}
          {profile.badges.map((b) => (
            <div key={b.key} style={st('display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
              <span style={st('font-size:28px')}>{b.emoji}</span>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:700 14.5px var(--font-ui)')}>{b.name}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{b.description}</span>
              </span>
              <span style={st('flex-shrink:0;text-align:right;display:flex;flex-direction:column')}>
                <span style={st('font:700 15px var(--font-display);color:var(--accText)')}>{b.rarityPercent}%</span>
                <span style={st('font:400 11px var(--font-ui);color:var(--muted)')}>of players</span>
              </span>
            </div>
          ))}
        </Dialog>
      )}
      {modal === 'library' && profile && (
        <Dialog title={`Library · ${profile.library.length}`} onClose={() => setModal(null)} width={640}>
          {profile.library.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>No games marked as owned yet.</span>}
          <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px')}>
            {profile.library.map((g) => (
              <div key={g.id} style={st('min-width:0;display:flex;flex-direction:column;gap:5px')}>
                <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={12} />
                <span style={st('font:600 12px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** What only a friend sees on a profile: how long you've been friends, shared rooms, their feed. */
function FriendExtras({ profile }: { profile: PublicUserProfile }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const ui = useUi();
  const friends = useFriends();
  const { data } = useFriendProfile(profile.userId);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const entries = applyFeedFilter(data?.activity ?? [], filter);

  async function remove() {
    const ok = await confirm({
      title: `Remove ${profile.displayName}?`,
      message: "They won't see your activity and you won't see theirs. You can add each other again with a friend code.",
      confirmLabel: 'Remove friend',
      danger: true,
    });
    if (!ok) return;
    await friends.unfriend(profile.userId);
    ui.notify(`${profile.displayName} removed`);
    navigate('/activity');
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:12px')}>
      <span style={st('font:700 20px var(--font-display)')}>Activity</span>
      {data && (
        <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
          Friends since {new Date(data.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · {data.sharedRoomCount} shared room{data.sharedRoomCount === 1 ? '' : 's'}
        </span>
      )}
      <FilterChips value={filter} onChange={setFilter} />
      <FeedGroups entries={entries} me={user?.id} compact />
      {data && entries.length === 0 && <div style={st('padding:12px 0;color:var(--muted);font-size:14px')}>Nothing in this category yet.</div>}
      <button type="button" onClick={remove} style={st('align-self:flex-start;height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 14px var(--font-ui)')}>
        Remove friend
      </button>
    </div>
  );
}
