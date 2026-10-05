import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { REVIEW_CATEGORIES, type PublicProfileBeatenGame, type PublicProfileGame, type PublicUserProfile } from '@queueup/shared';
import { apiGet } from '../api/client';
import { authApi } from '../api/auth';
import { gamesApi } from '../api/games';
import { playTogetherApi } from '../api/playTogether';
import { publicProfileApi } from '../api/publicProfile';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { useFriendProfile, useFriends } from '../hooks/useFriends';
import { FriendStatus } from '../dialogs/RoomDialogs';
import { Dialog } from '../ui/Dialog';
import { UiToast } from '../ui/ToastView';
import { applyFeedFilter, FeedGroups, FilterChips, type FeedFilter } from './feed';
import { useRooms } from '../hooks/useRooms';
import { useVersion } from '../hooks/useVersion';
import { REVIEW_EMOJI, reviewAverage } from '../lib/gameView';
import { AiBadge, Avatar, Btn, Cover, Wordmark, AppMark, inputPill } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { rich, t as tr, translate, useCyclingLanguage, useI18n, useT } from '../i18n';
import { reviewCategoryLabel } from '../i18n/labels';
import type { MessageKey } from '../i18n';
import { st } from '../ui/st';

const FEATURES: [string, MessageKey][] = [
  ['🎮', 'core.login.feature.backlog'],
  ['🗳️', 'core.login.feature.vote'],
  ['🎡', 'core.login.feature.spin'],
  ['💸', 'core.login.feature.prices'],
];

const PROVIDER_STYLE: Record<string, { label: (t: ReturnType<typeof useI18n>['t']) => string; bg: string; fg: string; border: string }> = {
  google: { label: (t) => t('core.login.signInWith', { provider: 'Google' }), bg: 'var(--text)', fg: 'var(--onText)', border: 'none' },
  discord: { label: (t) => t('core.login.signInWith', { provider: 'Discord' }), bg: '#5865F2', fg: '#fff', border: 'none' },
  steam: { label: (t) => t('core.login.signInWith', { provider: 'Steam' }), bg: '#1b2838', fg: '#fff', border: 'none' },
  xbox: { label: (t) => t('core.login.signInWith', { provider: 'Xbox' }), bg: '#107c10', fg: '#fff', border: 'none' },
  oidc: { label: (t) => t('core.login.sso'), bg: 'transparent', fg: 'var(--text)', border: '1px solid var(--line)' },
  dev: { label: (t) => t('core.login.dev'), bg: 'var(--text)', fg: 'var(--onText)', border: 'none' },
};

/** Cloudflare's widget script, loaded once on first use. */
let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  turnstileScript ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      turnstileScript = null;
      reject(new Error('Could not load the captcha'));
    };
    document.head.appendChild(el);
  });
  return turnstileScript;
}

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

type CaptchaStatus = 'checking' | 'interactive' | 'verified' | 'error';

/** The Turnstile captcha (issue #665). Runs invisibly for most visitors (Cloudflare only shows its
 * box when it needs a click), so in its place there's a one-line status that matches the page.
 * Reports a token when solved and null when it expires or errors; it refreshes itself on expiry. */
function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  const [status, setStatus] = useState<CaptchaStatus>('checking');
  const [loadError, setLoadError] = useState(false);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
        if (cancelled || !api || !ref.current) return;
        widgetId = api.render(ref.current, {
          sitekey: siteKey,
          theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
          size: 'flexible',
          appearance: 'interaction-only',
          'refresh-expired': 'auto',
          callback: (token: string) => {
            setStatus('verified');
            onTokenRef.current(token);
          },
          'expired-callback': () => {
            setStatus('checking');
            onTokenRef.current(null);
          },
          'error-callback': () => {
            setStatus('error');
            onTokenRef.current(null);
          },
          'before-interactive-callback': () => setStatus('interactive'),
          'after-interactive-callback': () => setStatus('checking'),
        });
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (widgetId && api) api.remove(widgetId);
    };
  }, [siteKey]);

  const failed = loadError || status === 'error';
  return (
    <div style={st('display:flex;flex-direction:column;gap:8px')}>
      {/* Cloudflare's box, only visible when it needs the visitor to click. */}
      <div ref={ref} style={st(`width:100%;${status === 'interactive' ? '' : 'height:0;overflow:hidden'}`)} />
      <span
        role={failed ? 'alert' : 'status'}
        style={st(
          `display:flex;align-items:center;justify-content:center;gap:8px;min-height:20px;font:500 13px var(--font-ui);text-align:center;color:${failed ? 'var(--danger)' : status === 'verified' ? 'var(--mint)' : 'var(--muted)'}`,
        )}
      >
        {failed ? (
          loadError ? t('pages.captcha.loadError') : t('pages.captcha.failed')
        ) : status === 'verified' ? (
          t('pages.captcha.verified')
        ) : status === 'interactive' ? (
          t('pages.captcha.interactive')
        ) : (
          <>
            <span aria-hidden style={st('width:12px;height:12px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--muted);animation:qu-spin 0.8s linear infinite')} />
            {t('pages.captcha.checking')}
          </>
        )}
      </span>
    </div>
  );
}

/** Signed-out landing page: what QueueUp is, then one button per configured sign-in method. */
export function LoginPage({ providers, turnstileSiteKey = null }: { providers: string[] | null; turnstileSiteKey?: string | null }) {
  const { version } = useVersion();
  const { t } = useI18n();
  // The intro steps through every language QueueUp speaks (#776), so visitors see theirs.
  const shown = useCyclingLanguage();
  const list = providers === null ? [] : providers.length > 0 ? providers : ['dev'];
  // Issue #665: with the captcha on, the sign-in buttons wait for a solved Turnstile token, which
  // rides along on the login URL for the server to verify.
  const [captcha, setCaptcha] = useState<string | null>(null);
  const needsCaptcha = !!turnstileSiteKey && list[0] !== 'dev';
  const ready = !needsCaptcha || !!captcha;
  // The server sends a failed captcha back here with ?signin=captcha.
  const [captchaFailed] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('signin') !== 'captcha') return false;
    params.delete('signin');
    const qs = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    return true;
  });
  return (
    <div style={st('min-height:100vh;background:var(--bg);color:var(--text);display:flex;flex-direction:column;overflow-y:auto')}>
      <div style={st('flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:40px 24px 24px;max-width:440px;width:100%;margin:0 auto')}>
        <div style={st('display:flex;flex-direction:column;gap:12px')}>
          <div style={st('display:flex;align-items:center;gap:16px')}>
            <AppMark size={46} />
            <Wordmark size={46} />
          </div>
          <span key={`tag-${shown}`} lang={shown} style={st('font:500 18px var(--font-ui);color:var(--text2);animation:qu-fade .4s ease both')}>
            {translate(shown, 'core.login.tagline')}
          </span>
        </div>
        <div key={`features-${shown}`} lang={shown} style={st('display:flex;flex-direction:column;gap:12px;animation:qu-fade .4s ease both')}>
          {FEATURES.map(([e, key]) => (
            <div key={key} style={st('display:flex;align-items:center;gap:12px;font:400 14.5px/1.4 var(--font-ui);color:var(--text2)')}>
              <span style={st('width:36px;height:36px;flex-shrink:0;border-radius:12px;background:var(--surf);display:flex;align-items:center;justify-content:center;font-size:17px')}>{e}</span>
              {translate(shown, key)}
            </div>
          ))}
        </div>
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          {captchaFailed && !captcha && (
            <span role="alert" style={st('font:500 13.5px var(--font-ui);color:var(--danger)')}>
              {t('core.login.captchaFailed')}
            </span>
          )}
          {needsCaptcha && <TurnstileWidget siteKey={turnstileSiteKey!} onToken={setCaptcha} />}
          {list.map((p) => {
            const s = PROVIDER_STYLE[p] ?? { label: () => t('core.login.signInWith', { provider: p }), bg: 'transparent', fg: 'var(--text)', border: '1px solid var(--line)' };
            return (
              <a
                key={p}
                href={ready ? authApi.loginUrl(p, captcha) : undefined}
                aria-disabled={!ready}
                onClick={(e) => !ready && e.preventDefault()}
                style={st(
                  `height:52px;border-radius:999px;border:${s.border};background:${s.bg};color:${s.fg};font:700 15px var(--font-ui);display:flex;align-items:center;justify-content:center;text-decoration:none;opacity:${ready ? 1 : 0.7};cursor:${ready ? 'pointer' : 'progress'};transition:opacity 0.2s`,
                )}
              >
                {s.label(t)}
              </a>
            );
          })}
        </div>
      </div>
      <div style={st('flex-shrink:0;padding:16px 24px 24px;text-align:center;font:400 12px var(--font-ui);color:var(--faint)')}>
        {t('core.login.selfHosted')}
        {version ? ` · ${version}` : ''} ·{' '}
        <Link to="/privacy" style={st('color:var(--muted)')}>
          {t('core.login.privacy')}
        </Link>{' '}
        ·{' '}
        <a href="https://github.com/trentnbauer/QueueUp" target="_blank" rel="noopener noreferrer" style={st('color:var(--muted)')}>
          {t('core.login.source')}
        </a>
      </div>
    </div>
  );
}

/** `/join/:code`: says which room the invite is for and joins only when you say so - a link alone
 * mustn't be able to put you in someone's room. Shows the error with a way back if it's invalid. */
export function JoinPage({ code }: { code: string }) {
  const navigate = useNavigate();
  const ui = useUi();
  const { joinRoom } = useRooms();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; accentColor: string; memberCount: number } | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let dead = false;
    apiGet<{ room: { name: string; accentColor: string; memberCount: number } }>(`/api/rooms/invite/${encodeURIComponent(code)}`)
      .then(({ room }) => !dead && setPreview(room))
      .catch(() => !dead && setError(tr('pages.join.error', { code })));
    return () => {
      dead = true;
    };
  }, [code]);

  function join() {
    setJoining(true);
    joinRoom
      .mutateAsync({ inviteCode: code })
      .then(({ room }) => {
        navigate(`/room/${room.id}`, { replace: true });
        ui.notify(tr('pages.join.joined', { room: room.name }));
      })
      .catch(() => setError(tr('pages.join.error', { code })))
      .finally(() => setJoining(false));
  }

  return (
    <div style={st('position:fixed;inset:0;z-index:20;background:var(--bg);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px 24px;text-align:center')}>
      {!error ? (
        !preview ? (
          <span style={st('width:44px;height:44px;border-radius:50%;border:4px solid var(--chip);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />
        ) : (
          <>
            <span style={st('font:600 12px var(--font-mono);letter-spacing:0.08em;color:var(--muted)')}>{t('pages.join.invitedTo')}</span>
            <span style={st(`font:700 30px/1.05 var(--font-display);letter-spacing:-0.02em;color:${preview.accentColor}`)}>{preview.name}</span>
            <span style={st('font:400 14px/1.45 var(--font-ui);color:var(--muted)')}>
              {t(preview.memberCount === 1 ? 'pages.join.members.one' : 'pages.join.members.other', { n: preview.memberCount })}
            </span>
            <div style={st('display:flex;gap:10px;margin-top:6px')}>
              <Btn height={48} padX={22} fontSize={14.5} onClick={() => navigate('/', { replace: true })}>
                {t('common.notNow')}
              </Btn>
              <Btn kind="accent" height={48} padX={26} fontSize={14.5} disabled={joining} onClick={join}>
                {joining ? t('pages.join.joining') : t('pages.join.join')}
              </Btn>
            </div>
          </>
        )
      ) : (
        <>
          <div role="alert" style={st('width:100%;max-width:360px;display:flex;align-items:flex-start;gap:10px;padding:14px;border-radius:16px;background:var(--errBg);border:1px solid var(--errLine);text-align:left')}>
            <span style={st('flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--errBadge);color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px var(--font-ui);margin-top:1px')}>!</span>
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{error}</span>
              <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{t('pages.join.invalid')}</span>
            </span>
          </div>
          <Btn height={48} padX={22} fontSize={14.5} onClick={() => navigate('/', { replace: true })}>
            {t('pages.join.backToShelf')}
          </Btn>
        </>
      )}
    </div>
  );
}

/** `/u/:id`: one profile page for everyone - the anonymous shareable view, and (when signed in) the
 * same page with a friend's activity and controls (it replaces the old separate /friends/:id page). */
/** Marks a game the signed-in viewer owns too (see PublicProfileGame.bothOwn), over its cover. */
/** Games you and the profile owner both own first; otherwise the list's own order is kept. */
function bothOwnFirst<T extends { bothOwn?: boolean }>(games: T[]): T[] {
  return [...games.filter((g) => g.bothOwn), ...games.filter((g) => !g.bothOwn)];
}

/** Phones: two rows that scroll sideways, three cards visible at a time. Larger screens: a normal wrapping grid. */
function profileCardGridStyle(mobile: boolean): string {
  return mobile
    ? 'display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,auto);grid-auto-columns:calc((100% - 28px) / 3);gap:14px;overflow-x:auto;scroll-snap-type:x proximity;padding-bottom:10px;-webkit-overflow-scrolling:touch'
    : 'display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:14px';
}

function BothOwnBadge({ small = false }: { small?: boolean }) {
  const t = useT();
  return (
    <span
      title={t('pages.profile.bothOwnThis')}
      style={st(
        `position:absolute;left:${small ? 6 : 8}px;bottom:${small ? 6 : 8}px;max-width:calc(100% - ${small ? 12 : 16}px);height:${small ? 20 : 24}px;padding:0 ${small ? 7 : 9}px;border-radius:999px;background:var(--mint);color:var(--ink);font:700 ${small ? 10.5 : 11.5}px var(--font-ui);display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;box-shadow:0 2px 8px oklch(0 0 0 / 0.35)`,
      )}
    >
      {t('pages.profile.bothOwnBadge')}
    </span>
  );
}

/** Props that make a profile game card open its popup: mouse, Enter and Space. */
function cardProps(onOpen: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    },
  };
}
const CARD_CURSOR = 'cursor:pointer;';

/** Popup for a game on someone's profile: cover, platform, and (for a signed-in viewer who doesn't
 * have it yet) an Add to wishlist button. */
function ProfileGameDialog({
  game,
  ownerId,
  ownerName,
  canAdd,
  added,
  onAdded,
  onClose,
}: {
  game: PublicProfileGame;
  ownerId: string;
  ownerName: string;
  canAdd: boolean;
  added: boolean;
  onAdded: () => void;
  onClose: () => void;
}) {
  const ui = useUi();
  const t = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function addToWishlist() {
    setBusy(true);
    try {
      await gamesApi.create({ igdbId: game.igdbId, status: 'wishlist' });
      void queryClient.invalidateQueries({ queryKey: ['games', 'shelf'] });
      ui.notify(tr('pages.profile.addedToWishlist', { title: game.title }));
      onAdded();
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : tr('pages.profile.addFailed'));
    } finally {
      setBusy(false);
    }
  }
  const [asked, setAsked] = useState(false);
  async function askToPlay() {
    setBusy(true);
    try {
      await playTogetherApi.ask(ownerId, game.igdbId);
      setAsked(true);
      ui.notify(tr('pages.profile.askedToPlay', { name: ownerName, title: game.title }));
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : tr('pages.profile.askFailed'));
    } finally {
      setBusy(false);
    }
  }
  const have = game.viewerHas || added;
  return (
    <Dialog title={game.title} onClose={onClose} width={480}>
      <div style={st('display:flex;gap:16px;align-items:flex-start')}>
        <div style={st('position:relative;flex-shrink:0')}>
          <Cover title={game.title} url={game.coverImageUrl} width={110} radius={14} />
        </div>
        <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:10px')}>
          <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{game.platform}</span>
          {game.bothOwn && <span style={st('font:600 12.5px var(--font-ui);color:var(--mint)')}>{t('pages.profile.bothOwnThis')}</span>}
          {game.bothOwn && canAdd && (
            <Btn kind="soft" disabled={busy || asked} onClick={askToPlay}>
              {asked ? t('pages.profile.askedDone') : t('pages.profile.askToPlay')}
            </Btn>
          )}
          {canAdd &&
            (have ? (
              <span style={st('font:600 13px var(--font-ui);color:var(--muted)')}>{added ? t('pages.profile.addedDone') : t('pages.profile.alreadyOnShelf')}</span>
            ) : (
              <Btn kind="soft" disabled={busy} onClick={addToWishlist}>
                {t('pages.profile.addToWishlist')}
              </Btn>
            ))}
          {!canAdd && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('pages.profile.onShelf', { name: ownerName })}</span>}
        </div>
      </div>
    </Dialog>
  );
}

/** Add-friend control in the profile header, for a signed-in viewer who isn't this person's friend yet. */
function ProfileFriendAction({ profile }: { profile: PublicUserProfile }) {
  const friends = useFriends();
  const ui = useUi();
  if (friends.privateInstance) return null;
  return <FriendStatus userId={profile.userId} name={profile.displayName} friends={friends} notify={ui.notify} onError={ui.notify} />;
}

export function PublicProfilePage({ userId, signedIn }: { userId: string; signedIn: boolean }) {
  const t = useT();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [modal, setModal] = useState<'achievements' | 'library' | 'bothOwn' | null>(null);
  const mobile = useIsMobile();
  const [openGame, setOpenGame] = useState<PublicProfileBeatenGame | null>(null);
  const [cardGame, setCardGame] = useState<PublicProfileGame | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
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

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => () => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            {signedIn && state === 'ok' && profile?.viewer === 'public' && <ProfileFriendAction profile={profile} />}
            <Link to="/" style={st('height:40px;padding:0 18px;border-radius:999px;border:1px solid var(--line);color:var(--text);font:600 13.5px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
              {signedIn ? t('pages.profile.openQueueUp') : t('pages.common.signIn')}
            </Link>
          </div>
          {state === 'ok' && profile && (
            <div style={st('display:flex;flex-wrap:wrap;align-items:flex-end;gap:24px 40px;padding:30px 0 34px')}>
              <div style={st('flex:1 1 360px;display:flex;align-items:center;gap:22px;min-width:0')}>
                <Avatar name={profile.displayName} color={profile.avatarColor} avatarUrl={profile.avatarUrl} size={104} fontSize={42} style={{ boxShadow: '0 0 0 5px var(--bg)' }} />
                <span style={st('display:flex;flex-direction:column;gap:6px;min-width:0')}>
                  <span style={st('font:700 clamp(30px,6vw,48px)/1 var(--font-display);letter-spacing:-0.035em;overflow-wrap:anywhere')}>{profile.displayName}</span>
                  <span style={st('font:400 14.5px var(--font-ui);color:var(--muted)')}>
                    {t('pages.profile.since', { date: new Date(profile.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}
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
                {tile(profile.currentlyPlaying.length, t('pages.profile.tile.playing'), scrollTo(playingRef), '↓')}
                {tile(profile.beatenGameCount, t('pages.profile.tile.played'), scrollTo(beatenRef), '↓')}
                {profile.beatenGames.some((g) => g.review?.recommend) && tile(profile.beatenGames.filter((g) => g.review?.recommend).length, t('pages.profile.tile.recommended'), scrollTo(beatenRef), '↓')}
                {tile(profile.library.length, t('pages.profile.tile.library'), () => setModal('library'), '›')}
                {profile.bothOwn.length > 0 && tile(profile.bothOwn.length, t('pages.profile.tile.bothOwn'), () => setModal('bothOwn'), '›')}
                {tile(profile.badges.length, t('pages.profile.tile.achievements'), () => setModal('achievements'), '›')}
              </div>
            </div>
          )}
        </div>
      </div>

      {state === 'loading' && <div style={st('padding:48px 24px;text-align:center;color:var(--muted)')}>{t('common.loading')}</div>}
      {state === 'missing' && <div style={st('padding:48px 24px;text-align:center;color:var(--muted)')}>{t('pages.profile.missing')}</div>}

      {state === 'ok' && profile && (
        <div style={st('max-width:1120px;margin:0 auto;padding:32px clamp(16px,4vw,40px) 56px;display:flex;flex-direction:column;gap:40px')}>
          <div ref={playingRef} style={st('display:flex;flex-direction:column;gap:14px;scroll-margin-top:16px')}>
            <span style={st('font:700 26px var(--font-display);letter-spacing:-0.02em')}>{t('pages.profile.currentlyPlaying')}</span>
            {profile.currentlyPlaying.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.profile.nothingNow')}</span>}
            <div style={st('display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x proximity;padding-bottom:10px;-webkit-overflow-scrolling:touch')}>
              {bothOwnFirst(profile.currentlyPlaying).map((g) => (
                <div key={g.id} {...cardProps(() => setCardGame(g))} style={st(CARD_CURSOR + 'flex:0 0 auto;width:min(44vw,180px);scroll-snap-align:start;display:flex;flex-direction:column;gap:8px')}>
                  <div style={st('position:relative')}>
                    <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={18} style={{ boxShadow: '0 20px 44px oklch(0 0 0 / 0.35)' }} />
                    {g.bothOwn && <BothOwnBadge />}
                  </div>
                  <span style={st('font:700 16px var(--font-display)')}>{g.title}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{g.platform}</span>
                </div>
              ))}
            </div>
          </div>

          {profile.wishlist.length > 0 && (
            <div style={st('display:flex;flex-direction:column;gap:12px')}>
              <span style={st('display:flex;align-items:baseline;gap:10px')}>
                <span style={st('font:700 20px var(--font-display)')}>{t('pages.profile.wishlist')}</span>
                <span style={st('font:500 11.5px var(--font-mono);color:var(--muted)')}>{profile.wishlist.length}</span>
              </span>
              <div style={st(profileCardGridStyle(mobile))}>
                {bothOwnFirst(profile.wishlist).map((g) => (
                  <div key={g.id} {...cardProps(() => setCardGame(g))} style={st(CARD_CURSOR + 'min-width:0;scroll-snap-align:start;display:flex;flex-direction:column;gap:6px')}>
                    <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={14} />
                    <span style={st('font:600 12.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profile.upNext.length > 0 && (
            <div style={st('display:flex;flex-direction:column;gap:12px')}>
              <span style={st('font:700 20px var(--font-display)')}>{t('pages.profile.upNext')}</span>
              <div style={st(profileCardGridStyle(mobile))}>
                {bothOwnFirst(profile.upNext).map((g) => (
                  <div key={g.id} {...cardProps(() => setCardGame(g))} style={st(CARD_CURSOR + 'min-width:0;scroll-snap-align:start;display:flex;flex-direction:column;gap:6px')}>
                    <div style={st('position:relative')}>
                      <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={14} status={g.paused ? 'paused' : undefined} />
                      {g.bothOwn && <BothOwnBadge small />}
                    </div>
                    <span style={st('font:600 12.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                      <span style={st('font-family:var(--font-mono);color:var(--muted)')}>{profile.upNext.indexOf(g) + 1}. </span>
                      {g.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profile.yearStory && (
            <div style={st('display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:20px;background:linear-gradient(140deg, var(--hero1), var(--surf))')}>
              <span style={st('display:flex;align-items:center;gap:8px')}>
                <span style={st('font:700 16px var(--font-display)')}>{t('pages.story.profileTitle')}</span>
                {!profile.yearStory.edited && <AiBadge title={t('pages.story.badge')} />}
              </span>
              <p style={st('margin:0;font:400 14.5px/1.6 var(--font-ui);white-space:pre-wrap')}>{profile.yearStory.text}</p>
            </div>
          )}

          <div ref={beatenRef} style={st('display:flex;flex-direction:column;gap:10px;scroll-margin-top:16px')}>
            <span style={st('display:flex;flex-direction:column;gap:2px')}>
              <span style={st('display:flex;align-items:baseline;gap:10px')}>
                <span style={st('font:700 16px var(--font-display)')}>{t('pages.profile.played')}</span>
                <span style={st('font:500 11.5px var(--font-mono);color:var(--muted)')}>{profile.beatenGameCount}</span>
              </span>
              {profile.fullyCompletedCount > 0 && (
                <span style={st('font:500 12.5px var(--font-ui);color:var(--muted)')}>
                  {rich(t('pages.profile.fullyCompleted'), { n: <span style={st('font-weight:700;color:var(--text)')}>{profile.fullyCompletedCount}</span> })}
                </span>
              )}
            </span>
            {profile.beatenGames.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.profile.nothingPlayed')}</span>}
            <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:6px')}>
              {profile.beatenGames.map((g) => {
                const avg = g.review ? reviewAverage(g.review) : null;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setOpenGame(g)}
                    className="hv-surf2"
                    style={st(`display:flex;align-items:center;gap:10px;padding:6px 10px 6px 6px;border-radius:12px;border:none;background:var(--surf);color:var(--text);text-align:left`)}
                  >
                    <Cover title={g.title} url={g.coverImageUrl} width={30} radius={6} completed={g.fullyCompleted} status={g.dropped ? 'dropped' : g.replaying ? 'replay' : 'done'} recommend={g.review?.recommend} />
                    <span style={st('flex:1;min-width:0;font:600 13px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                    {g.inGroup && <span title={t('pages.profile.inGroup')} aria-label={t('pages.profile.inGroup')} style={st('flex-shrink:0;font-size:14px;line-height:1')}>👥</span>}
                    {avg !== null && <span style={st('flex-shrink:0;font:700 12px var(--font-display);color:var(--accText)')}>{avg.toFixed(1)} / 5</span>}
                    {g.review?.recommend != null && (
                      <span role="img" aria-label={g.review.recommend ? t('pages.profile.recommends') : t('pages.profile.doesntRecommend')} title={g.review.recommend ? t('pages.profile.recommends') : t('pages.profile.doesntRecommend')} style={st('flex-shrink:0;font-size:14px;line-height:1')}>
                        {g.review.recommend ? '👍' : '👎'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {signedIn && profile.viewer === 'friend' && <FriendExtras profile={profile} />}

          {!signedIn && (
            <div style={st('display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:22px;border-radius:22px;background:linear-gradient(140deg, var(--hero1), var(--surf));max-width:420px')}>
              <span style={st('font:700 20px var(--font-display)')}>{t('pages.profile.ctaTitle')}</span>
              <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>{t('pages.profile.ctaBody')}</span>
              <Link to="/" style={st('height:44px;padding:0 20px;border-radius:999px;background:var(--acc);color:var(--ink);font:700 14px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
                {t('pages.profile.getQueueUp')}
              </Link>
            </div>
          )}
        </div>
      )}

      {openGame && profile && (
        <Dialog title={openGame.title} onClose={() => setOpenGame(null)} width={560}>
          <div style={st('display:flex;gap:16px;align-items:flex-start')}>
            <Cover title={openGame.title} url={openGame.coverImageUrl} width={110} radius={14} completed={openGame.fullyCompleted} status={openGame.dropped ? 'dropped' : openGame.replaying ? 'replay' : 'done'} recommend={openGame.review?.recommend} />
            <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:8px')}>
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
                {[
                  openGame.genre?.split(',')[0],
                  openGame.dropped ? t('pages.profile.meta.dropped') : openGame.replaying ? t('pages.profile.meta.replaying') : t('pages.profile.meta.beaten'),
                  openGame.inGroup ? t('pages.profile.meta.withGroup') : null,
                  openGame.review?.recommend === true ? t('pages.profile.meta.recommends') : openGame.review?.recommend === false ? t('pages.profile.meta.doesntRecommend') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {openGame.review ? (
                <>
                  <span style={st('display:flex;align-items:baseline;gap:8px')}>
                    <span style={st('font:700 30px/1 var(--font-display);color:var(--accText)')}>{(reviewAverage(openGame.review) ?? 0).toFixed(1)}</span>
                    <span style={st('font:500 13px var(--font-ui);color:var(--muted)')}>{t('pages.profile.totalScore')}</span>
                  </span>
                  <div style={st('display:flex;flex-direction:column;gap:4px')}>
                    {REVIEW_CATEGORIES.filter((c) => openGame.review![c.key]).map((c) => (
                      <span key={c.key} style={st('display:flex;align-items:center;gap:8px;font:500 13px var(--font-ui)')}>
                        <span style={st('width:92px;color:var(--muted)')}>{reviewCategoryLabel(c.key)}</span>
                        <span style={st('font-size:16px')}>{REVIEW_EMOJI[openGame.review![c.key] as number]?.e}</span>
                        <span style={st('color:var(--text2)')}>{openGame.review![c.key]} / 5</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.profile.notReviewed', { name: profile.displayName })}</span>
              )}
            </div>
          </div>
          {openGame.review?.note && (
            <div style={st('padding:14px 16px;border-radius:14px;background:var(--surf);display:flex;flex-direction:column;gap:6px')}>
              <span style={st('font:600 12px var(--font-ui);color:var(--muted)')}>{t('pages.profile.says', { name: profile.displayName.toUpperCase() })}</span>
              <span style={st('font:italic 400 14px/1.5 var(--font-ui);color:var(--text2);text-wrap:pretty')}>“{openGame.review.note}”</span>
            </div>
          )}
        </Dialog>
      )}
      {modal === 'achievements' && profile && (
        <Dialog title={t('pages.profile.achievements')} onClose={() => setModal(null)} width={560}>
          {profile.badges.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.profile.noAchievements')}</span>}
          {profile.badges.map((b) => (
            <div key={b.key} style={st('display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
              <span style={st('font-size:28px')}>{b.emoji}</span>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:700 14.5px var(--font-ui)')}>{b.name}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{b.description}</span>
              </span>
              <span style={st('flex-shrink:0;text-align:right;display:flex;flex-direction:column')}>
                <span style={st('font:700 15px var(--font-display);color:var(--accText)')}>{b.rarityPercent}%</span>
                <span style={st('font:400 11px var(--font-ui);color:var(--muted)')}>{t('pages.profile.ofPlayers')}</span>
              </span>
            </div>
          ))}
        </Dialog>
      )}
      {modal === 'bothOwn' && profile && (
        <Dialog title={t('pages.profile.bothOwnTitle', { n: profile.bothOwn.length })} onClose={() => setModal(null)} width={640}>
          <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('pages.profile.bothOwnHint', { name: profile.displayName })}</span>
          <SearchableGameGrid games={profile.bothOwn} onOpen={setCardGame} />
        </Dialog>
      )}
      {cardGame && profile && (
        <ProfileGameDialog
          game={cardGame}
          ownerId={profile.userId}
          ownerName={profile.displayName}
          canAdd={signedIn && profile.viewer !== 'self'}
          added={addedIds.has(cardGame.igdbId)}
          onAdded={() => setAddedIds((prev) => new Set(prev).add(cardGame.igdbId))}
          onClose={() => setCardGame(null)}
        />
      )}
      {modal === 'library' && profile && (
        <Dialog title={t('pages.profile.libraryTitle', { n: profile.library.length })} onClose={() => setModal(null)} width={640}>
          {profile.library.length === 0 ? (
            <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.profile.noOwned')}</span>
          ) : (
            <SearchableGameGrid games={profile.library} onOpen={setCardGame} />
          )}
        </Dialog>
      )}
      <UiToast />
    </div>
  );
}

/** Lower-case with spaces and punctuation stripped, so "spiderman" finds "Spider-Man". Each word
 * typed must appear somewhere in the title. */
function searchKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** A profile game grid (library, you both own) with a search box over it. */
function SearchableGameGrid({ games, onOpen }: { games: PublicProfileGame[]; onOpen: (g: PublicProfileGame) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const words = query.trim().split(/\s+/).map(searchKey).filter(Boolean);
  const shown = words.length === 0 ? games : games.filter((g) => {
    const title = searchKey(g.title);
    return words.every((w) => title.includes(w));
  });
  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t(games.length === 1 ? 'pages.profile.searchGames.one' : 'pages.profile.searchGames.other', { n: games.length })}
        aria-label={t('pages.profile.searchAria')}
        style={st(inputPill)}
      />
      {shown.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.profile.noMatch', { query: query.trim() })}</span>}
      <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px')}>
        {shown.map((g) => (
          <div key={g.id} {...cardProps(() => onOpen(g))} style={st(CARD_CURSOR + 'min-width:0;display:flex;flex-direction:column;gap:5px')}>
            <div style={st('position:relative')}>
              <Cover title={g.title} url={g.coverImageUrl} width="100%" radius={12} />
              {g.bothOwn && <BothOwnBadge small />}
            </div>
            <span title={g.title} style={st('font:600 12px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** What only a friend sees on a profile: how long you've been friends, shared rooms, their feed. */
function FriendExtras({ profile }: { profile: PublicUserProfile }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const ui = useUi();
  const t = useT();
  const friends = useFriends();
  const { data } = useFriendProfile(profile.userId);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const entries = applyFeedFilter(data?.activity ?? [], filter);

  async function remove() {
    const ok = await confirm({
      title: t('pages.profile.removeTitle', { name: profile.displayName }),
      message: t('pages.profile.removeMessage'),
      confirmLabel: t('pages.profile.removeFriend'),
      danger: true,
    });
    if (!ok) return;
    await friends.unfriend(profile.userId);
    ui.notify(t('pages.profile.removed', { name: profile.displayName }));
    navigate('/activity');
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:12px')}>
      <span style={st('font:700 20px var(--font-display)')}>{t('pages.profile.activity')}</span>
      {data && (
        <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
          {t(data.sharedRoomCount === 1 ? 'pages.profile.friendsSince.one' : 'pages.profile.friendsSince.other', {
            date: new Date(data.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
            n: data.sharedRoomCount,
          })}
        </span>
      )}
      <FilterChips value={filter} onChange={setFilter} />
      <FeedGroups entries={entries} me={user?.id} compact />
      {data && entries.length === 0 && <div style={st('padding:12px 0;color:var(--muted);font-size:14px')}>{t('pages.profile.nothingInCategory')}</div>}
      <button type="button" onClick={remove} style={st('align-self:flex-start;height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 14px var(--font-ui)')}>
        {t('pages.profile.removeFriend')}
      </button>
    </div>
  );
}
