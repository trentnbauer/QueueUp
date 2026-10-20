import type { LobbyGameId, MiniGameRatingValue } from '@queueup/shared';
import { useMiniGameRatings, useRateMiniGame } from '../../hooks/useMiniGames';
import type { resultCardRect } from '../../lobbyGames/kit';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

/** Thumbs up or down for the game just played, laid over the strip at the bottom of the end-of-run card in the arena (so it
 * reads as part of the pop-up). Once rated it shows the pick, and the other thumb swaps it. Rendered only while the card is up. */
export function RatingBar({ game, card }: { game: LobbyGameId; card: ReturnType<typeof resultCardRect> }) {
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
          `min-width:${48 * Math.min(card.u, 1.3)}px;height:100%;max-height:${40 * Math.min(card.u, 1.3)}px;padding:0 ${12 * Math.min(card.u, 1.3)}px;border-radius:14px;border:1.5px solid ${picked ? 'var(--acc)' : 'var(--chip)'};background:${picked ? 'var(--accSoft)' : 'var(--surf)'};color:var(--text);font:600 ${18 * Math.min(card.u, 1.3)}px var(--font-ui);cursor:pointer`,
        )}
      >
        {glyph}
      </button>
    );
  };
  return (
    <div
      role="group"
      aria-label={t(mine ? 'games.rate.thanks' : 'games.rate.prompt')}
      style={st(`position:absolute;left:${(card.left + 0.04) * 100}%;width:${(card.width - 0.08) * 100}%;top:${card.stripTop * 100}%;height:${card.stripHeight * 100 - 2}%;display:flex;align-items:center;justify-content:space-between;gap:${12 * card.u}px`)}
    >
      <span style={st(`font:500 ${11 * Math.min(card.u, 1.15)}px var(--font-ui);color:var(--muted);min-width:0;line-height:1.25;white-space:nowrap`)}>{t('games.rate.review')}</span>
      <span style={st(`display:flex;gap:${8 * card.u}px;height:100%;align-items:center`)}>
        {thumb(1, t('games.rate.up'), '👍')}
        {thumb(-1, t('games.rate.down'), '👎')}
      </span>
    </div>
  );
}
