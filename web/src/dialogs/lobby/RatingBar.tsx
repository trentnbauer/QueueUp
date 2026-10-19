import type { LobbyGameId, MiniGameRatingValue } from '@queueup/shared';
import { useMiniGameRatings, useRateMiniGame } from '../../hooks/useMiniGames';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

/** Thumbs up or down for the game just played, shown under the arena while a run's result card is up. It keeps its
 * height the rest of the time, so the arena does not jump when a run ends. Once rated it shows the pick, and the
 * other thumb swaps it. */
export function RatingBar({ game, show }: { game: LobbyGameId; show: boolean }) {
  const t = useT();
  const { data } = useMiniGameRatings();
  const rate = useRateMiniGame();
  const mine = data?.ratings[game];
  const thumb = (value: MiniGameRatingValue, label: string, glyph: string) => {
    const picked = mine === value;
    return (
      <button
        type="button"
        aria-pressed={picked}
        aria-label={label}
        title={label}
        onClick={() => rate(game, value)}
        style={st(
          `min-width:48px;height:44px;padding:0 14px;border-radius:14px;border:1.5px solid ${picked ? 'var(--acc)' : 'var(--chip)'};background:${picked ? 'var(--accSoft)' : 'var(--surf)'};color:var(--text);font:600 20px var(--font-ui);cursor:pointer`,
        )}
      >
        {glyph}
      </button>
    );
  };
  return (
    <div style={st(`display:flex;align-items:center;justify-content:center;gap:10px;min-height:44px;${show ? '' : 'visibility:hidden'}`)} aria-hidden={!show}>
      <span style={st('font:500 12.5px var(--font-ui);color:var(--muted)')}>{t(mine ? 'games.rate.thanks' : 'games.rate.prompt')}</span>
      {thumb(1, t('games.rate.up'), '👍')}
      {thumb(-1, t('games.rate.down'), '👎')}
    </div>
  );
}
