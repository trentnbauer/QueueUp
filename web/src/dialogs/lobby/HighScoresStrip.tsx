import type { LobbyGameId } from '@queueup/shared';
import { useMiniGameMe, useMiniGameScores } from '../../hooks/useMiniGames';
import { Avatar } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { formatScore } from '../../lobbyGames/scoreText';

const ROWS_DESKTOP = 4;
const ROWS_PHONE = 3;

/** Solo play's stand-in for the win chart: the top of your friends' high scores for this game, and how far
 * you are from passing the next one up. */
export function HighScoresStrip({ game, phone }: { game: LobbyGameId; phone: boolean }) {
  const t = useT();
  const { data } = useMiniGameScores(game, 'friends', 'all');
  const { data: me } = useMiniGameMe(game);
  const rows = (data?.rows ?? []).slice(0, phone ? ROWS_PHONE : ROWS_DESKTOP);
  const gap = me?.nextFriend ? t('games.strip.gap', { gap: formatScore(game, me.nextFriend.gap), name: me.nextFriend.displayName }) : null;

  return (
    <div style={st(`display:flex;flex-direction:column;gap:8px;${phone ? 'padding:12px 14px;border-radius:16px;background:var(--bg)' : ''}`)} aria-live="polite">
      <div style={st('display:flex;align-items:baseline;justify-content:space-between;gap:8px')}>
        <span style={st('font:500 11px var(--font-mono);letter-spacing:.08em;color:var(--faint)')}>{t('games.strip.kicker')}</span>
        {phone && gap && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{gap}</span>}
      </div>
      {rows.length === 0 ? (
        <span style={st('font:500 13px var(--font-ui);color:var(--muted)')}>{data ? t('games.strip.quiet') : ''}</span>
      ) : (
        rows.map((r) => (
          <div key={r.userId} style={st(`display:flex;align-items:center;gap:10px;padding:4px 8px;margin:0 -8px;border-radius:10px;${r.isMe ? 'background:var(--accSoft)' : ''}`)}>
            <span style={st('width:18px;text-align:center;font:600 12px var(--font-mono);color:var(--rank)')}>{r.rank}</span>
            <Avatar name={r.displayName} color={r.avatarColor} avatarUrl={r.avatarUrl} size={28} fontSize={11} />
            <span style={st('flex:1;min-width:0;font:600 13px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.displayName}</span>
            <span style={st(`font:600 13px var(--font-mono);${r.isMe ? 'color:var(--accText)' : ''}`)}>{formatScore(game, r.score)}</span>
          </div>
        ))
      )}
      {!phone && gap && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{gap}</span>}
    </div>
  );
}
