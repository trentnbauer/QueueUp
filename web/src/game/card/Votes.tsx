import type { Game, VoteValue } from '@queueup/shared';
import { useScope } from '../../context/ScopeContext';
import { VOTES, VOTE_VALUES } from '../../lib/gameView';
import { Avatar } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { verdictParts } from './cardLogic';
import { SECTION_TITLE } from './ui';

/** "How keen are you?": five round vote buttons, each with the avatars of the people who picked it, and the room's verdict on the right. */
export function Votes({ game, size = 56 }: { game: Game; size?: number }) {
  const t = useT();
  const { ops } = useScope();
  const mine = game.myVote ?? 0;
  const parts = verdictParts(game.votes);

  return (
    <div style={st('display:flex;flex-direction:column;gap:12px;flex-shrink:0')}>
      <div style={st('display:flex;justify-content:space-between;align-items:baseline;gap:12px')}>
        <span style={st(SECTION_TITLE)}>{t('card.votes.title')}</span>
        <span style={st('font:500 12px var(--font-ui);color:var(--muted);text-align:right')}>
          {parts.length ? parts.map((p) => `${p.count} ${VOTES[p.value].l.toLowerCase()}`).join(' · ') : t('card.votes.none')}
        </span>
      </div>
      <div style={st('display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px')}>
        {VOTE_VALUES.map((v: VoteValue) => {
          const on = mine === v;
          const voters = game.votes.filter((x) => x.value === v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => (on ? ops.unvote(game.id) : ops.vote(game.id, v))}
              aria-pressed={on}
              aria-label={VOTES[v].l}
              style={st('display:flex;flex-direction:column;align-items:center;gap:6px;border:none;background:transparent;padding:0;color:inherit')}
            >
              <span
                style={st(
                  `width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.46)}px;line-height:1;background:${on ? 'var(--acc)' : 'var(--surf)'};box-shadow:${on ? '0 0 0 4px var(--accA25)' : 'none'};opacity:${mine && !on ? 0.55 : 1};transition:opacity .15s`,
                )}
              >
                {VOTES[v].e}
              </span>
              <span style={st(`font:600 11.5px var(--font-ui);color:${on ? 'var(--text)' : 'var(--muted)'}`)}>{VOTES[v].l}</span>
              <span style={st('display:flex;min-height:18px;padding-left:6px')}>
                {voters.map((x) => (
                  <Avatar
                    key={x.user.id}
                    name={x.user.displayName}
                    color={x.user.avatarColor}
                    avatarUrl={x.user.avatarUrl}
                    size={18}
                    fontSize={8}
                    style={{ marginLeft: -6, border: '1.5px solid var(--sheet)' }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
