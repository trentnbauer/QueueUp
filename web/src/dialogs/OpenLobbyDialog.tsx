import { useState } from 'react';
import { LOBBY_GAME_IDS, type LobbyGameId, type MiniGameLobbyDto, type MiniGameLobbyVisibility } from '@queueup/shared';
import { miniGamesApi } from '../api/miniGames';
import { useFriends } from '../hooks/useFriends';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, ChipToggle, Group, Kicker } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

const WHO: { value: MiniGameLobbyVisibility; label: MessageKey; sub: MessageKey }[] = [
  { value: 'public', label: 'games.open.public', sub: 'games.open.publicSub' },
  { value: 'friends', label: 'games.open.friends', sub: 'games.open.friendsSub' },
  { value: 'code', label: 'games.open.code', sub: 'games.open.codeSub' },
];

/** Open a lobby: who can join, and whether it plays a random game each run or one game. Confirming opens it. */
export function OpenLobbyDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (lobby: MiniGameLobbyDto) => void }) {
  const t = useT();
  const phone = useIsMobile();
  // On a server where everyone is everyone's friend (a private instance), Friends and Public mean the same.
  const { privateInstance } = useFriends();
  const [visibility, setVisibility] = useState<MiniGameLobbyVisibility>('public');
  const [game, setGame] = useState<LobbyGameId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = WHO.filter((o) => !(privateInstance && o.value === 'friends'));

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      onOpened(await miniGamesApi.openLobby({ visibility, game }));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('games.open.failed'));
      setBusy(false);
    }
  };

  const footer = (
    <div style={st(`display:flex;flex-direction:${phone ? 'column' : 'row'};align-items:center;gap:${phone ? 10 : 12}px;padding:14px 20px 20px;border-top:1px solid var(--chip)`)}>
      {phone ? (
        <>
          <Btn kind="accent" height={52} fontSize={15} weight={800} disabled={busy} style={{ width: '100%' }} onClick={() => void open()}>
            {t('games.open.submit')}
          </Btn>
          <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted);text-align:center')}>{t('games.open.note')}</span>
        </>
      ) : (
        <>
          <span style={st('flex:1;font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{t('games.open.note')}</span>
          <Btn kind="ghost" height={44} onClick={onClose}>
            {t('common.cancel')}
          </Btn>
          <Btn kind="accent" height={44} fontSize={14} weight={800} disabled={busy} onClick={() => void open()}>
            {t('games.open.submit')}
          </Btn>
        </>
      )}
    </div>
  );

  return (
    <Dialog onClose={onClose} title={t('games.open.title')} width={600} gap={16} footer={footer}>
      {error && <Banner>{error}</Banner>}
      <Kicker>{t('games.open.who')}</Kicker>
      <Group>
        <div role="radiogroup" aria-label={t('games.open.who')} style={st('display:flex;flex-direction:column;gap:1px')}>
          {options.map((o) => {
            const on = visibility === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setVisibility(o.value)}
                style={st(`display:flex;align-items:center;gap:14px;min-height:64px;padding:10px 16px;border:none;background:${on ? 'var(--surf2)' : 'var(--surf)'};color:var(--text);text-align:left`)}
              >
                <span style={st(`width:22px;height:22px;flex-shrink:0;border-radius:50%;border:2px solid ${on ? 'var(--acc)' : 'var(--line)'};display:flex;align-items:center;justify-content:center`)}>
                  {on && <span style={st('width:10px;height:10px;border-radius:50%;background:var(--acc)')} />}
                </span>
                <span style={st('display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 15px var(--font-ui)')}>{t(o.label)}</span>
                  <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{t(o.sub)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Group>
      {visibility === 'code' && (
        <div style={st('padding:14px 16px;border-radius:18px;border:1px dashed var(--line);font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{t('games.open.codeLater')}</div>
      )}
      <Kicker>{t('games.open.game')}</Kicker>
      <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{game ? t('games.open.fixedSub') : t('games.open.randomSub')}</span>
      <div style={st('display:flex;flex-wrap:wrap;gap:6px')} role="group" aria-label={t('games.open.game')}>
        <ChipToggle on={game === null} height={36} onClick={() => setGame(null)}>
          {t('games.open.random')}
        </ChipToggle>
        {LOBBY_GAME_IDS.map((id) => (
          <ChipToggle key={id} on={game === id} height={36} onClick={() => setGame(id)}>
            {t(LOBBY_GAME_VIEWS[id].nameKey)}
          </ChipToggle>
        ))}
      </div>
    </Dialog>
  );
}
