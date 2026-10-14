import { useState } from 'react';
import { parseLobbyCode, type MiniGameLobbyDto } from '@queueup/shared';
import { miniGamesApi } from '../api/miniGames';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Join with code: paste the code (or the whole link) someone sent you. */
export function JoinCodeDialog({ initialCode = '', onClose, onJoined }: { initialCode?: string; onClose: () => void; onJoined: (lobby: MiniGameLobbyDto) => void }) {
  const t = useT();
  const phone = useIsMobile();
  const [text, setText] = useState(initialCode);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = parseLobbyCode(text);

  const join = async () => {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      onJoined(await miniGamesApi.joinLobby(code));
    } catch {
      setError(t('games.join.notFound'));
      setBusy(false);
    }
  };

  return (
    <Dialog onClose={onClose} title={t('games.join.title')} width={440} gap={14}>
      <span style={st('font:400 14px/1.5 var(--font-ui);color:var(--muted)')}>{t('games.join.sub')}</span>
      <input
        value={text}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label={t('games.join.title')}
        placeholder={t('games.join.placeholder')}
        onChange={(e) => {
          // A pasted link is cut down to its code straight away.
          const pasted = parseLobbyCode(e.target.value);
          setText(pasted ? `${pasted.slice(0, 3)}-${pasted.slice(3)}` : e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && void join()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={st(`height:52px;padding:0 20px;border-radius:999px;background:var(--bg);border:1px solid ${focused ? 'var(--acc)' : 'var(--line)'};color:var(--text);font:600 20px var(--font-mono);letter-spacing:.12em;text-transform:uppercase;outline:none`)}
      />
      {error && <Banner>{error}</Banner>}
      <Btn kind="accent" height={phone ? 52 : 46} fontSize={15} weight={800} disabled={!code || busy} style={{ width: '100%' }} onClick={() => void join()}>
        {t('games.join.submit')}
      </Btn>
    </Dialog>
  );
}
