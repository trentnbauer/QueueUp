import type { CSSProperties, ReactNode } from 'react';
import type { Game } from '@queueup/shared';
import { useScope } from '../../context/ScopeContext';
import { fmtMoney } from '../../lib/gameView';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { priceModeOf, voteTally } from './cardLogic';

function cellStyle(desktop: boolean, extra?: CSSProperties): CSSProperties {
  return st(`display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:${desktop ? '12px 14px' : '12px'};background:var(--surf);border:none;text-align:left;text-decoration:none;color:var(--text)`, extra);
}

const BIG = (desktop: boolean, color?: string) => `font:800 ${desktop ? 22 : 20}px var(--font-display);${color ? `color:${color}` : ''}`;
const SUB = (desktop: boolean, color = 'var(--muted)') => `font:500 ${desktop ? 11.5 : 11}px var(--font-ui);color:${color}`;

function Cell({ children, desktop, onClick, href }: { children: ReactNode; desktop: boolean; onClick?: () => void; href?: string }) {
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hv-surf2" style={cellStyle(desktop)}>
        {children}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="hv-surf2" style={cellStyle(desktop)}>
        {children}
      </button>
    );
  }
  return <div style={cellStyle(desktop)}>{children}</div>;
}

/** Score, ownership and price in one strip. In a room the middle cell is the viewer's own "I own this" switch (ownership is
 * per member); on the shelf it is play time. The price cell links to gg.deals when the price is live, and opens the Price
 * History sheet for a manual price or none. */
export function StatsStrip({ game, desktop, onOpenPrice }: { game: Game; desktop: boolean; onOpenPrice: () => void }) {
  const t = useT();
  const { ops, isShelf, room } = useScope();
  // A room with no platform restriction has no single platform to claim ownership on (the server refuses the
  // toggle), so there the cell only shows the count.
  const canToggleOwnership = !!room?.platform;
  const tally = voteTally(game);
  const mode = priceModeOf(game);
  const owned = game.youOwn;

  const scoreText = tally.score === null ? '—' : `${tally.score >= 0 ? '+' : ''}${tally.score}`;
  const votesWord = isShelf ? t('card.stats.yourVote') : t(tally.count === 1 ? 'card.stats.vote.one' : 'card.stats.vote.other', { n: tally.count });

  const hours = game.currentPlaytimeMinutes ? Math.round(game.currentPlaytimeMinutes / 60) : null;

  const priceBig = owned ? t('home.price.owned') : mode === 'live' ? fmtMoney(game.price.amount, game.price.currency) : mode === 'manual' ? fmtMoney(game.manualPrice, game.price.currency) : '—';
  const priceColor = owned ? 'var(--mint)' : mode === 'none' ? 'var(--faint)' : 'var(--text)';

  return (
    <div style={st('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border-radius:18px;overflow:hidden;background:var(--chip);flex-shrink:0')}>
      <Cell desktop={desktop}>
        <span style={st(BIG(desktop, tally.score === null ? 'var(--faint)' : 'var(--pos)'))}>{scoreText}</span>
        <span style={st(SUB(desktop))}>{votesWord}</span>
      </Cell>

      {isShelf ? (
        <Cell desktop={desktop}>
          <span style={st(BIG(desktop, hours === null ? 'var(--faint)' : undefined))}>{hours === null ? '—' : `${hours}h`}</span>
          <span style={st(SUB(desktop))}>{t('card.stats.played')}</span>
        </Cell>
      ) : (
        <Cell desktop={desktop} onClick={canToggleOwnership ? () => ops.setOwnership(game.id, !owned) : undefined}>
          <span style={st(BIG(desktop))}>{game.ownership ? `${game.ownership.owned}/${game.ownership.total}` : owned ? '1' : '0'}</span>
          <span style={st(SUB(desktop, owned ? 'var(--mint)' : 'var(--accText)').replace('500', '600'))}>
            {owned ? t('card.stats.ownIncl') : t('card.stats.ownMine')}
          </span>
        </Cell>
      )}

      <Cell desktop={desktop} href={mode === 'live' && game.ggDealsUrl ? game.ggDealsUrl : undefined} onClick={mode === 'live' && game.ggDealsUrl ? undefined : onOpenPrice}>
        <span style={st(BIG(desktop, priceColor))}>{priceBig}</span>
        <span style={st(SUB(desktop, mode === 'manual' ? 'var(--muted)' : 'var(--accText)').replace('500', '600'))}>
          {mode === 'live' ? t('card.stats.ggDeals') : mode === 'manual' ? t('card.stats.manual') : t('card.stats.addPrice')}
        </span>
      </Cell>
    </div>
  );
}
