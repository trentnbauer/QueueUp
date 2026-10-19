import type { LobbyGameId, MiniGameRatingValue } from '@queueup/shared';
import { useMiniGameRatings, useRateMiniGame } from '../../hooks/useMiniGames';
import { RESULT_RATING_STRIP } from '../../lobbyGames/kit';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

/** The result card's own geometry (kit/hud.ts drawResult), as fractions of the arena: it is centred at 0.48 and is 0.66 wide, its text
 * area is 0.4 tall, and below that is the strip these thumbs fill. */
const CARD_LEFT = 0.17;
const CARD_WIDTH = 0.66;
const STRIP_TOP = 0.48 + 0.2;

/** Thumbs up or down for the game just played, laid over the strip at the bottom of the end-of-run card in the arena (so it
 * reads as part of the pop-up). Once rated it shows the pick, and the other thumb swaps it. Rendered only while the card is up. */
export function RatingBar({ game }: { game: LobbyGameId }) {
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
          `min-width:52px;height:100%;max-height:44px;padding:0 14px;border-radius:14px;border:1.5px solid ${picked ? 'var(--acc)' : 'var(--chip)'};background:${picked ? 'var(--accSoft)' : 'var(--surf)'};color:var(--text);font:600 20px var(--font-ui);cursor:pointer`,
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
      style={st(`position:absolute;left:${CARD_LEFT * 100}%;width:${CARD_WIDTH * 100}%;top:${STRIP_TOP * 100}%;height:${RESULT_RATING_STRIP * 100 - 2}%;display:flex;align-items:center;justify-content:center;gap:12px`)}
    >
      {thumb(1, t('games.rate.up'), '👍')}
      {thumb(-1, t('games.rate.down'), '👎')}
    </div>
  );
}
