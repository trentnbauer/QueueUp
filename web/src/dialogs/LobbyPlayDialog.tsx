import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { MiniGameLobbyDto, RoomMember } from '@queueup/shared';
import { useQueryClient } from '@tanstack/react-query';
import { miniGamesApi } from '../api/miniGames';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { MINIGAMES_QUERY_KEY, useLobbyInfo } from '../hooks/useMiniGames';
import { Dialog } from '../ui/Dialog';
import { Btn, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { useT } from '../i18n';
import { LobbyPanel } from './LobbyPanel';

/** What a link to a lobby names: its invite code when it has one (the only way into a code lobby), otherwise its id. */
export function lobbyRef(lobby: Pick<MiniGameLobbyDto, 'id' | 'code'>): string {
  return lobby.code ?? lobby.id;
}

/** The link that opens the Mini games page in this lobby: signed in it joins, and signed out it offers to sign in or play as a guest. */
export function lobbyLink(ref: string): string {
  return `${window.location.origin}${getBasePath()}/games?lobby=${encodeURIComponent(ref)}`;
}

/** An open lobby: the live game with whoever else is in it. Closing the dialog leaves; the lobby closes when
 * the last person leaves. The host can close it for everyone. */
export function LobbyPlayDialog({ lobbyId, onClose }: { lobbyId: string; onClose: () => void }) {
  const t = useT();
  const ui = useUi();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: lobby, isError } = useLobbyInfo(lobbyId);
  // The page's address names the lobby while it is open, so the address bar is a link others can follow.
  const [, setParams] = useSearchParams();
  const ref = lobby ? lobbyRef(lobby) : null;
  useEffect(() => {
    if (!ref) return;
    setParams((p) => new URLSearchParams([...p].filter(([k]) => k !== 'code' && k !== 'lobby').concat([['lobby', ref]])), { replace: true });
    return () => setParams((p) => new URLSearchParams([...p].filter(([k]) => k !== 'lobby')), { replace: true });
  }, [ref, setParams]);
  // The lobby closed on us (everyone left, or the host closed it): say so once and close the dialog.
  const told = useRef(false);
  useEffect(() => {
    if (!isError || told.current) return;
    told.current = true;
    ui.notify(t('games.lobby.closed'), undefined, 4000, true);
    void queryClient.invalidateQueries({ queryKey: MINIGAMES_QUERY_KEY });
    onClose();
  }, [isError, ui, t, queryClient, onClose]);

  // The panel wants a list of members: whoever is in the lobby, with you included from the start.
  const members = useMemo<RoomMember[]>(() => {
    if (!user) return [];
    const players = lobby?.players ?? [];
    const people = players.some((p) => p.id === user.id) ? players : [{ id: user.id, displayName: user.displayName, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl }, ...players];
    return people.map((p) => ({ roomId: '', user: { ...p, isAdmin: false }, role: 'member' as const, joinedAt: '' }));
  }, [lobby, user]);
  if (!user) return null;

  const host = lobby?.players.find((p) => p.id === lobby.hostId);
  const title = lobby?.mine ? t('games.lobby.title.mine') : t('games.lobby.title.other', { name: host?.displayName ?? '…' });
  const close = async () => {
    try {
      await miniGamesApi.closeLobby(lobbyId);
    } catch {
      // Already gone.
    }
    void queryClient.invalidateQueries({ queryKey: MINIGAMES_QUERY_KEY });
    onClose();
  };

  return (
    <Dialog onClose={onClose} title={title} width={760} height="tall" gap={14}>
      {lobby?.code ? <InviteCode code={lobby.code} /> : lobby && !lobby.solo && lobby.visibility !== 'code' && <ShareLink link={lobbyLink(lobbyRef(lobby))} />}
      <LobbyPanel key={lobbyId} lobbyId={lobbyId} members={members} me={user.id} />
      {lobby?.mine && (
        <Btn kind="ghost" height={40} onClick={() => void close()}>
          {t('games.closeLobby')}
        </Btn>
      )}
    </Dialog>
  );
}

/** A lobby without a code (public, or friends): just the link to it. */
function ShareLink({ link }: { link: string }) {
  const t = useT();
  const ui = useUi();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const share = async () => {
    if (canShare) return void navigator.share({ url: link }).catch(() => {});
    try {
      await navigator.clipboard.writeText(link);
      ui.notify(t('games.lobby.copied'), undefined, 2000);
    } catch {
      // Clipboard blocked: nothing more to do here.
    }
  };
  return (
    <div>
      <Btn kind="text" height={38} fontSize={13} onClick={() => void share()}>
        {canShare ? t('games.lobby.shareLink') : t('games.lobby.copyLink')}
      </Btn>
    </div>
  );
}

function InviteCode({ code }: { code: NonNullable<MiniGameLobbyDto['code']> }) {
  const t = useT();
  const ui = useUi();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      ui.notify(t('games.lobby.copied'), undefined, 2000);
    } catch {
      // Clipboard blocked: the code is on screen to read out.
    }
  };
  const link = lobbyLink(code);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:18px;border:1px dashed var(--line)')}>
      <Kicker>{t('games.lobby.codeKicker')}</Kicker>
      <span style={st('font:600 24px var(--font-mono);letter-spacing:.12em')}>{code}</span>
      <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
        <Btn height={38} fontSize={13} onClick={() => void copy(code)}>
          {t('games.lobby.copyCode')}
        </Btn>
        <Btn kind="text" height={38} fontSize={13} onClick={() => (canShare ? void navigator.share({ url: link }).catch(() => {}) : void copy(link))}>
          {canShare ? t('games.lobby.shareLink') : t('games.lobby.copyLink')}
        </Btn>
      </div>
    </div>
  );
}
