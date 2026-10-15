import { useState } from 'react';
import { suggestsBeatenByPlaytime, suggestsPlaying, type Game, type GameStatus } from '@queueup/shared';
import { useScope } from '../../context/ScopeContext';
import { REVIEW_EMOJI, STATUS_DESC, reviewAverage } from '../../lib/gameView';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { FINISHED_STATUSES, dismissNudge, nextStatus, nudgeDismissed, progressSegments, statusBadge } from './cardLogic';
import { cardStatusLabel } from './statusLabel';

type NudgeKind = 'beaten' | 'playing';

/** Which "finished it?" / "playing it now?" suggestion applies, if any: at most one, and never once dismissed for this game.
 * Nothing changes by itself; the buttons ask. */
export function useNudge(game: Game): { kind: NudgeKind; fullyAchieved: boolean; hours: number } | null {
  const ach = game.myAchievements;
  const fullyAchieved = !!ach && ach.total > 0 && ach.unlocked === ach.total && !['done', 'dropped', 'wont_play', 'replay'].includes(game.status);
  const hours = game.currentPlaytimeMinutes ? Math.round(game.currentPlaytimeMinutes / 60) : 0;
  const kind: NudgeKind | null = fullyAchieved || suggestsBeatenByPlaytime(game) ? 'beaten' : suggestsPlaying(game) ? 'playing' : null;
  if (!kind || nudgeDismissed(game.id, kind)) return null;
  return { kind, fullyAchieved, hours };
}

/** "👍 · 😊 4.2": whether they recommend it and the average face of their review. */
function reviewSummary(review: NonNullable<Game['review']>): string {
  const avg = reviewAverage(review);
  const rec = review.recommend === true ? '👍' : review.recommend === false ? '👎' : '';
  const face = avg !== null ? `${REVIEW_EMOJI[Math.max(1, Math.min(5, Math.round(avg)))]?.e ?? ''} ${avg.toFixed(1)}`.trim() : '';
  return [rec, face].filter(Boolean).join(' · ');
}

/** The status row (number or emoji, name, one-line meaning, progress bar, "Change"), with the nudge strip and the review row
 * attached underneath when they apply. Tapping the row opens the Status picker. */
export function StatusBlock({
  game,
  onOpenPicker,
  onOpenReview,
  changeStatus,
}: {
  game: Game;
  onOpenPicker: () => void;
  onOpenReview: () => void;
  changeStatus: (game: Game, status: GameStatus) => void;
}) {
  const t = useT();
  const { isShelf } = useScope();
  const nudge = useNudge(game);
  // Re-render after "Not yet" without waiting for anything else to change.
  const [, bump] = useState(0);
  const segs = progressSegments(game.status, isShelf);
  const finished = FINISHED_STATUSES.includes(game.status);
  const next = nextStatus(game.status, isShelf);
  const circle = 'width:40px;height:40px;flex-shrink:0;border-radius:50%;background:var(--acc);color:var(--ink);display:flex;align-items:center;justify-content:center;font:700 15px var(--font-ui);box-shadow:0 0 0 4px var(--accA20)';

  return (
    <div style={st('display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:var(--surf);flex-shrink:0')}>
      <div style={st('display:flex;align-items:center;gap:14px;padding:14px 16px')}>
        {next ? (
          // The circle is a Play button: it moves the game on to the next step (the rest of the row opens the picker).
          <button
            type="button"
            onClick={() => changeStatus(game, next)}
            aria-label={t('card.status.advance', { status: cardStatusLabel(next) })}
            title={t('card.status.advance', { status: cardStatusLabel(next) })}
            style={st(`${circle};border:none;padding:0`)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginLeft: 2 }}>
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
            </svg>
          </button>
        ) : (
          <span style={st(circle)}>{statusBadge(game.status, isShelf)}</span>
        )}
        <button type="button" onClick={onOpenPicker} className="hv-surf2" style={st('flex:1;min-width:0;display:flex;align-items:center;gap:14px;padding:0;border:none;background:transparent;text-align:left;color:var(--text)')}>
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px')}>
          <span style={st('display:flex;align-items:baseline;gap:8px;min-width:0')}>
            <span style={st('font:700 16px var(--font-ui);flex-shrink:0')}>{cardStatusLabel(game.status)}</span>
            <span style={st('font:400 12px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{STATUS_DESC[game.status]}</span>
          </span>
          <span style={st('display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px;max-width:280px')} aria-hidden>
            {segs.map((on, i) => (
              <span key={i} style={st(`height:4px;border-radius:999px;background:${on ? 'var(--acc)' : 'var(--line)'}`)} />
            ))}
          </span>
        </span>
        <span style={st('height:30px;padding:0 12px;border-radius:999px;background:var(--chip);font:600 12px var(--font-ui);color:var(--text2);display:flex;align-items:center;flex-shrink:0')}>{t('card.status.change')}</span>
      </button>
      </div>

      {nudge && (
        <div style={st('display:flex;flex-direction:column;gap:10px;padding:12px 16px 14px;background:var(--accA10);border-top:1px solid var(--accA25)')}>
          <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--text2);text-wrap:pretty')}>
            {nudge.fullyAchieved ? t('game.detail.nudge.fullyAchieved') : nudge.kind === 'beaten' ? t('game.detail.nudge.beaten', { hours: nudge.hours }) : t('game.detail.nudge.playing', { hours: nudge.hours })}
          </span>
          <div style={st('display:flex;gap:8px')}>
            <button
              type="button"
              onClick={() => changeStatus(game, nudge.kind === 'beaten' ? 'done' : 'playing')}
              style={st('height:36px;padding:0 14px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 13px var(--font-ui)')}
            >
              {nudge.kind === 'beaten' ? t('game.detail.nudge.markBeaten') : t('game.detail.nudge.markPlaying')}
            </button>
            <button
              type="button"
              onClick={() => {
                dismissNudge(game.id, nudge.kind);
                bump((n) => n + 1);
              }}
              style={st('height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:600 13px var(--font-ui)')}
            >
              {t('card.nudge.notYet')}
            </button>
          </div>
        </div>
      )}

      {finished && (
        <button
          type="button"
          onClick={onOpenReview}
          className="hv-surf2"
          style={st('display:flex;align-items:center;gap:12px;min-height:52px;padding:0 16px;border:none;border-top:1px solid var(--chip);background:transparent;text-align:left;color:var(--text)')}
        >
          <span style={st('width:40px;flex-shrink:0;text-align:center;font-size:16px')}>✍️</span>
          <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui)')}>{game.review ? t('card.review.yours') : t('card.review.write')}</span>
          <span style={st(`font:500 13px var(--font-ui);color:${game.review ? 'var(--text)' : 'var(--accText)'}`)}>{game.review ? reviewSummary(game.review) || t('card.review.saved') : t('card.review.rate')}</span>
          <span aria-hidden style={st('color:var(--faint);font-size:18px')}>›</span>
        </button>
      )}
    </div>
  );
}
