import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GUEST_NAME_MAX, GUEST_NAME_MIN, parseLobbyCode, type GuestJoinResponse, type MiniGameLobbyDto, type PublicMiniGameLobbyDto, type RoomMember } from '@queueup/shared';
import { miniGamesApi } from '../api/miniGames';
import { usePublicLobbies } from '../hooks/useMiniGames';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { lobbyHeadline } from '../lobbyGames/lobbyText';
import { Dialog } from '../ui/Dialog';
import { Avatar, Banner, Btn, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { LobbyPanel } from './LobbyPanel';

/** The only thing about a guest kept anywhere: their last display name, in this browser. Never sent except as the in-lobby label. */
const NAME_KEY = 'sq-guest-name';
// The sign-up strip stays dismissed until the page is reloaded.
let bannerDismissed = false;

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

type Stage = { kind: 'list' } | { kind: 'name'; ref: string; title: string } | { kind: 'lobby'; joined: GuestJoinResponse };

/** Mini games for someone without an account: pick a public lobby or paste an invite code, give a name, play.
 * Nothing about the guest is stored on the server; their scores are not kept. */
export function GuestGamesDialog({ captcha, needsCaptcha, onCaptchaUsed, onSignUp, onClose }: { captcha: string | null; needsCaptcha: boolean; onCaptchaUsed: () => void; onSignUp: () => void; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'list' });
  const [banner, setBanner] = useState(!bannerDismissed);
  const strip = banner ? (
    <SignUpStrip
      onSignUp={onSignUp}
      onDismiss={() => {
        bannerDismissed = true;
        setBanner(false);
      }}
    />
  ) : undefined;

  if (stage.kind === 'name') {
    return <NameDialog ref_={stage.ref} title={stage.title} captcha={captcha} needsCaptcha={needsCaptcha} onCaptchaUsed={onCaptchaUsed} onBack={() => setStage({ kind: 'list' })} onClose={onClose} onJoined={(joined) => setStage({ kind: 'lobby', joined })} />;
  }
  if (stage.kind === 'lobby') {
    return <GuestLobby joined={stage.joined} footer={strip} onLeave={() => setStage({ kind: 'list' })} />;
  }
  return <GamesList onPick={(ref, title) => setStage({ kind: 'name', ref, title })} footer={strip} onClose={onClose} />;
}

function GamesList({ onPick, footer, onClose }: { onPick: (ref: string, title: string) => void; footer: React.ReactNode; onClose: () => void }) {
  const t = useT();
  const { data } = usePublicLobbies(true);
  const lobbies = data?.lobbies ?? [];
  const [text, setText] = useState('');
  const code = parseLobbyCode(text);
  const [focused, setFocused] = useState(false);
  // A code the server does not know is told at the name step, when the join is tried.
  const join = () => code && onPick(code, `${code.slice(0, 3)}-${code.slice(3)}`);

  return (
    <Dialog onClose={onClose} title={t('games.guest.title')} width={560} gap={16} footer={footer}>
      <span style={st('font:400 14px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('games.guest.sub')}</span>
      <div style={st('display:flex;flex-direction:column;gap:8px')}>
        <Kicker>{t('games.guest.codeLabel')}</Kicker>
        <div style={st('display:flex;gap:8px')}>
          <input
            value={text}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-label={t('games.guest.codeLabel')}
            placeholder={t('games.join.placeholder')}
            onChange={(e) => {
              const pasted = parseLobbyCode(e.target.value);
              setText(pasted ? `${pasted.slice(0, 3)}-${pasted.slice(3)}` : e.target.value);
            }}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={st(`flex:1;min-width:0;height:52px;padding:0 20px;border-radius:999px;background:var(--bg);border:1px solid ${focused ? 'var(--acc)' : 'var(--line)'};color:var(--text);font:600 20px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;outline:none`)}
          />
          <Btn kind="accent" height={52} padX={24} fontSize={15} weight={800} disabled={!code} onClick={join}>
            {t('games.guest.join')}
          </Btn>
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('games.guest.publicLabel', { n: lobbies.length })}</Kicker>
        {lobbies.length > 0 ? (
          <div style={st('display:flex;flex-direction:column;gap:8px')}>
            {lobbies.map((l) => (
              <PublicLobbyRow key={l.id} lobby={l} onJoin={() => onPick(l.id, t('games.lobby.title.other', { name: l.hostName }))} />
            ))}
          </div>
        ) : (
          <div style={st('display:flex;flex-direction:column;align-items:center;gap:4px;padding:28px 16px;border-radius:18px;background:var(--surf);text-align:center')}>
            <span style={st('font:700 17px var(--font-display)')}>{t('games.guest.quietTitle')}</span>
            <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--muted)')}>{t('games.guest.quietSub')}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function PublicLobbyRow({ lobby, onJoin }: { lobby: PublicMiniGameLobbyDto; onJoin: () => void }) {
  const t = useT();
  // The same sentence the signed-in lobby cards use, from first names only.
  const asLobby = {
    mine: false,
    game: lobby.game,
    players: lobby.players.map((p, i) => ({ id: String(i), displayName: p.name, avatarColor: p.avatarColor, avatarUrl: null })),
  } as unknown as MiniGameLobbyDto;
  return (
    <div style={st('display:flex;align-items:center;gap:14px;padding:14px 14px 14px 16px;border-radius:18px;background:linear-gradient(135deg,var(--hero1),var(--hero2))')}>
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px')}>
        <span style={st('display:flex;align-items:center;gap:8px;font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accText)')}>
          <span style={st('width:8px;height:8px;border-radius:50%;background:var(--mint)')} />
          {t('games.live.kickerPublic')}
        </span>
        <span style={st('font:700 17px var(--font-display);letter-spacing:-.02em;text-wrap:pretty')}>{lobbyHeadline(asLobby, '', t, (id) => t(LOBBY_GAME_VIEWS[id].nameKey))}</span>
      </div>
      <div style={st('display:flex;align-items:center;margin-left:16px')}>
        {lobby.players.map((p, i) => (
          <Avatar key={i} name={p.name} color={p.avatarColor} avatarUrl={null} size={32} style={{ margin: '0 0 0 -12px', boxShadow: '0 0 0 2.5px var(--hero2)' }} />
        ))}
      </div>
      <Btn kind="accent" height={42} padX={20} fontSize={14} weight={800} style={{ boxShadow: '0 6px 20px var(--accA30)' }} onClick={onJoin}>
        {t('games.guest.join')}
      </Btn>
    </div>
  );
}

function NameDialog({
  ref_,
  title,
  captcha,
  needsCaptcha,
  onCaptchaUsed,
  onBack,
  onClose,
  onJoined,
}: {
  ref_: string;
  title: string;
  captcha: string | null;
  needsCaptcha: boolean;
  onCaptchaUsed: () => void;
  onBack: () => void;
  onClose: () => void;
  onJoined: (joined: GuestJoinResponse) => void;
}) {
  const t = useT();
  const saved = useMemo(savedName, []);
  const [name, setName] = useState(saved);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = trimmed.length >= GUEST_NAME_MIN && trimmed.length <= GUEST_NAME_MAX;
  const remembered = !!saved && trimmed === saved;
  const ready = valid && !busy && (!needsCaptcha || !!captcha);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const joined = await miniGamesApi.guestJoin(ref_, { displayName: trimmed, captcha: captcha ?? undefined });
      try {
        localStorage.setItem(NAME_KEY, joined.displayName);
      } catch {
        // Storage blocked: they just type it again next time.
      }
      onJoined(joined);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('games.guest.joinFailed'));
      setBusy(false);
    } finally {
      // A captcha token works once, whatever came of it.
      if (needsCaptcha) onCaptchaUsed();
    }
  };

  return (
    <Dialog onClose={onClose} onBack={onBack} title={t('games.guest.nameTitle')} width={440} gap={14}>
      <span style={st('font:400 14px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('games.guest.nameSub', { lobby: title })}</span>
      <input
        value={name}
        autoFocus
        maxLength={GUEST_NAME_MAX}
        autoComplete="nickname"
        aria-label={t('games.guest.nameTitle')}
        placeholder={t('games.guest.namePlaceholder')}
        onChange={(e) => {
          setName(e.target.value.slice(0, GUEST_NAME_MAX));
          setError(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={st(`height:52px;padding:0 20px;border-radius:999px;background:var(--bg);border:1px solid ${focused ? 'var(--acc)' : 'var(--line)'};color:var(--text);font:600 17px var(--font-ui);outline:none`)}
      />
      <span style={st(`font:400 12.5px/1.4 var(--font-ui);color:${remembered ? 'var(--mint)' : 'var(--faint)'}`)}>{remembered ? t('games.guest.nameRemembered') : t('games.guest.nameHint')}</span>
      {error && <Banner>{error}</Banner>}
      <Btn kind="accent" height={46} fontSize={15} weight={800} disabled={!ready} style={{ width: '100%' }} onClick={() => void submit()}>
        {t('games.guest.nameSubmit')}
      </Btn>
    </Dialog>
  );
}

function GuestLobby({ joined, footer, onLeave }: { joined: GuestJoinResponse; footer: React.ReactNode; onLeave: () => void }) {
  const t = useT();
  const { data: lobby, isError } = useQuery({
    queryKey: ['minigames', 'guest-lobby', joined.lobbyId],
    queryFn: () => miniGamesApi.guestLobby(joined.lobbyId, joined.token),
    refetchInterval: 2000,
    retry: 2,
  });
  // The lobby closed on us (everyone left, or the host closed it): back to the list.
  const left = useRef(false);
  useEffect(() => {
    if (isError && !left.current) {
      left.current = true;
      onLeave();
    }
  }, [isError, onLeave]);

  const players = lobby?.players ?? [];
  const members = useMemo<RoomMember[]>(() => {
    const me = { id: joined.guestId, displayName: joined.displayName, avatarColor: '#888', avatarUrl: null };
    const people = players.some((p) => p.id === joined.guestId) ? players : [...players, me];
    return people.map((p) => ({ roomId: '', user: { ...p, isAdmin: false }, role: 'member' as const, joinedAt: '' }));
  }, [players, joined]);

  const host = players.find((p) => p.id === lobby?.hostId);
  return (
    <Dialog onClose={onLeave} title={t('games.lobby.title.other', { name: host?.displayName ?? '…' })} width={760} height="tall" gap={14} footer={footer}>
      <LobbyPanel key={joined.lobbyId} lobbyId={joined.lobbyId} members={members} me={joined.guestId} guestToken={joined.token} />
      <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
        {members.map((m) => (
          <span key={m.user.id} style={st('display:flex;align-items:center;gap:7px;height:34px;padding:0 12px 0 4px;border-radius:999px;background:var(--surf);font:600 13px var(--font-ui)')}>
            <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={26} />
            {m.user.displayName}
            {m.user.id.startsWith('guest:') && <span style={st('font:600 10px var(--font-mono);letter-spacing:.06em;color:var(--faint)')}>{t('games.guest.tag')}</span>}
          </span>
        ))}
      </div>
      <Btn kind="ghost" height={40} onClick={onLeave}>
        {t('games.guest.leave')}
      </Btn>
    </Dialog>
  );
}

function SignUpStrip({ onSignUp, onDismiss }: { onSignUp: () => void; onDismiss: () => void }) {
  const t = useT();
  return (
    <div role="status" style={st('display:flex;align-items:center;gap:12px;padding:12px 12px 14px 20px;border-top:1px solid var(--chip)')}>
      <span style={st('flex:1;min-width:0;font:400 12.5px/1.4 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('games.guest.banner')}</span>
      <Btn kind="soft" height={34} padX={14} fontSize={13} onClick={onSignUp}>
        {t('games.guest.signUp')}
      </Btn>
      <Btn kind="text" height={30} padX={8} ariaLabel={t('games.guest.dismiss')} onClick={onDismiss}>
        ×
      </Btn>
    </div>
  );
}
