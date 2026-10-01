import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { REVIEW_CATEGORIES, type PublicUserProfile } from '@queueup/shared';
import { authApi } from '../api/auth';
import { publicProfileApi } from '../api/publicProfile';
import { useUi } from '../context/UiContext';
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

/** `/u/:id`: the shareable, signed-out-friendly profile. */
export function PublicProfilePage({ userId, signedIn }: { userId: string; signedIn: boolean }) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const beatenRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef<HTMLDivElement>(null);
  const achRef = useRef<HTMLDivElement>(null);

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
            <div style={st('display:flex;flex-wrap:wrap;align-items:flex-end;gap:24px 40px;padding:36px 0 40px')}>
              <div style={st('flex:1 1 360px;display:flex;align-items:center;gap:22px;min-width:0')}>
                <Avatar name={profile.displayName} color={profile.avatarColor} avatarUrl={profile.avatarUrl} size={112} fontSize={46} style={{ boxShadow: '0 0 0 5px var(--bg)' }} />
                <span style={st('display:flex;flex-direction:column;gap:6px;min-width:0')}>
                  <span style={st('font:700 clamp(32px,6vw,52px)/1 var(--font-display);letter-spacing:-0.035em;overflow-wrap:anywhere')}>{profile.displayName}</span>
                  <span style={st('font:400 14.5px var(--font-ui);color:var(--muted)')}>
                    On QueueUp since {new Date(profile.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </span>
                  {profile.systems.length > 0 && (
                    <span style={st('display:flex;flex-wrap:wrap;gap:6px;margin-top:6px')}>
                      {profile.systems.map((s) => (
                        <span key={s} style={st('height:26px;padding:0 10px;border-radius:999px;background:var(--chip);color:var(--text2);font:600 12px var(--font-ui);display:flex;align-items:center')}>{s}</span>
                      ))}
                    </span>
                  )}
                </span>
              </div>
              <div style={st('display:flex;gap:10px;flex-wrap:wrap')}>
                {[
                  [profile.beatenGameCount, 'beaten', beatenRef],
                  [profile.currentlyPlaying.length, 'playing', playingRef],
                  [profile.badges.length, 'achievements', achRef],
                ].map(([v, l, ref]) => (
                  <button
                    key={String(l)}
                    type="button"
                    onClick={scrollTo(ref as React.RefObject<HTMLDivElement>)}
                    className="hv-surf2"
                    style={st('min-width:110px;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:16px 20px;border-radius:18px;border:1px solid transparent;background:var(--surf);color:var(--text);text-align:left')}
                  >
                    <span style={st('font:700 32px/1 var(--font-display)')}>{v as number}</span>
                    <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{l as string} ↓</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {state === 'loading' && <div style={st('padding:48px 24px;text-align:center;color:var(--muted)')}>Loading…</div>}
      {state === 'missing' && <div style={st('padding:48px 24px;text-align:center;color:var(--muted)')}>This profile isn't public, or doesn't exist.</div>}

      {state === 'ok' && profile && (
        <div style={st('max-width:1120px;margin:0 auto;padding:36px clamp(16px,4vw,40px) 56px;display:flex;flex-wrap:wrap;gap:40px;align-items:flex-start')}>
          <div ref={beatenRef} style={st('flex:2 1 520px;min-width:0;display:flex;flex-direction:column;gap:14px;scroll-margin-top:16px')}>
            <span style={st('display:flex;align-items:baseline;gap:10px')}>
              <span style={st('font:700 24px var(--font-display);letter-spacing:-0.02em')}>Beaten</span>
              <span style={st('font:500 12.5px var(--font-mono);color:var(--muted)')}>WITH REVIEWS</span>
            </span>
            {profile.beatenGames.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>Nothing beaten yet.</span>}
            <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px')}>
              {profile.beatenGames.map((g) => {
                const avg = g.review ? reviewAverage(g.review) : null;
                return (
                  <div key={g.id} style={st('display:flex;gap:14px;padding:12px;border-radius:18px;background:var(--surf)')}>
                    <Cover title={g.title} url={g.coverImageUrl} width={52} radius={10} />
                    <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
                      <div style={st('display:flex;align-items:flex-start;gap:10px')}>
                        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                          <span style={st('font:600 15px var(--font-ui)')}>{g.title}</span>
                          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{[g.genre?.split(',')[0], g.replaying ? 'Replaying' : null].filter(Boolean).join(' · ')}</span>
                        </span>
                        {avg !== null && (
                          <span style={st('flex-shrink:0;height:28px;padding:0 10px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:700 13px var(--font-display);display:flex;align-items:center')}>
                            {avg.toFixed(1)} / 5
                          </span>
                        )}
                      </div>
                      {g.review && (
                        <>
                          <div style={st('display:flex;flex-wrap:wrap;gap:4px 12px')}>
                            {REVIEW_CATEGORIES.filter((c) => g.review![c.key]).map((c) => (
                              <span key={c.key} style={st('display:flex;align-items:center;gap:4px;font:500 12px var(--font-ui);color:var(--muted)')}>
                                {c.label}
                                <span style={st('font-size:14px')}>{REVIEW_EMOJI[g.review![c.key] as number]?.e}</span>
                              </span>
                            ))}
                          </div>
                          {g.review.note && <span style={st('font:italic 400 13px/1.45 var(--font-ui);color:var(--text2);text-wrap:pretty')}>“{g.review.note}”</span>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={st('flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:32px')}>
            <div ref={playingRef} style={st('display:flex;flex-direction:column;gap:12px;scroll-margin-top:16px')}>
              <span style={st('font:700 18px var(--font-display)')}>Currently playing</span>
              {profile.currentlyPlaying.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>Nothing right now.</span>}
              <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,120px));gap:12px')}>
                {profile.currentlyPlaying.map((g) => (
                  <div key={g.id} style={st('min-width:0;display:flex;flex-direction:column;gap:6px')}>
                    <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={14} />
                    <span style={st('font:600 13px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <div ref={achRef} style={st('display:flex;flex-direction:column;gap:12px;scroll-margin-top:16px')}>
              <span style={st('font:700 18px var(--font-display)')}>Achievements</span>
              {profile.badges.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>No achievements unlocked yet.</span>}
              <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
                {profile.badges.map((b) => (
                  <span key={b.key} title={b.description} style={st('display:flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 10px;border-radius:999px;background:var(--surf);font:600 13px var(--font-ui)')}>
                    <span style={st('font-size:18px')}>{b.emoji}</span>
                    {b.name}
                  </span>
                ))}
              </div>
            </div>
            <div style={st('display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:22px;border-radius:22px;background:linear-gradient(140deg, var(--hero1), var(--surf))')}>
              <span style={st('font:700 20px var(--font-display)')}>Pick a game, together.</span>
              <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>Track your backlog and vote on what's next with friends.</span>
              <Link to="/" style={st('height:44px;padding:0 20px;border-radius:999px;background:var(--acc);color:var(--ink);font:700 14px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
                Get QueueUp
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
