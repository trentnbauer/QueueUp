import { stakedWeights, type PlinkoStakePlay } from '@queueup/shared';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { Counter, Hint, MINE_RING, MINT, MemberAvatar, Roster, TimerBar, WIN_RING, secondsLeft, type ModeProps } from './shared';
import { PlinkoBoard, binBackground, plinkoLanded } from './PlinkoMode';

/** Chip-stake plinko: each participant stakes one chip on a bin (tap another to move it), which
 * widens that bin live. When staking closes, one shared chip drops along the server's path. */
export function PlinkoStakeMode({ play, games, members, me, now, act, settled }: ModeProps<PlinkoStakePlay>) {
  const t = useT();
  const weights = stakedWeights(play);
  const total = weights.reduce((s, w) => s + w, 0);
  const baseTotal = play.bins.reduce((s, b) => s + b.weight, 0);
  const canStake = !play.closed && play.participants.includes(me);
  const myBin = play.stakes[me];
  const staked = play.participants.filter((id) => id in play.stakes).length;
  const landed = plinkoLanded(play.dropAt, now);

  return (
    <>
      <PlinkoBoard rail={play.closed ? t('spin.stake.sharedDrop') : t('spin.stake.rail')} weights={weights} binHeight={120} path={play.path} dropAt={play.dropAt} now={now}>
        {play.bins.map((b, i) => {
          const game = games.get(b.gameId);
          const title = game?.title ?? '…';
          const odds = Math.round((weights[i] / (total || 1)) * 100);
          const delta = odds - Math.round((b.weight / (baseTotal || 1)) * 100);
          const chips = Object.keys(play.stakes).filter((id) => play.stakes[id] === i);
          const win = landed && b.gameId === play.winnerId;
          const ring = win ? WIN_RING : myBin === i && !play.closed ? MINE_RING : 'none';
          return (
            <button
              key={b.gameId}
              type="button"
              disabled={!canStake}
              onClick={() => act({ type: 'stake', bin: i })}
              aria-label={t(myBin === i ? 'spin.stake.yourChipOn' : 'spin.stake.stakeOn', { title, odds })}
              aria-pressed={myBin === i}
              style={st(
                'position:relative;flex-shrink:1;flex-basis:0;min-width:0;border:none;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:8px;text-align:left;transition:flex-grow .5s cubic-bezier(.3,.7,.3,1), box-shadow .2s, opacity .3s',
                {
                  flexGrow: weights[i],
                  background: binBackground(game, 0.2, 0.7),
                  boxShadow: ring,
                  cursor: canStake ? 'pointer' : 'default',
                  opacity: settled && !win ? 0.35 : 1,
                },
              )}
            >
              <div style={st('display:flex;flex-wrap:wrap;min-height:22px;padding-right:5px')}>
                {chips.map((id) => (
                  <MemberAvatar key={id} members={members} userId={id} style={{ marginRight: -5 }} />
                ))}
              </div>
              <div style={st('display:flex;flex-direction:column;gap:2px;min-width:0')}>
                <div style={st('display:flex;align-items:baseline;gap:5px')}>
                  <span style={st('font:600 12px var(--font-mono);color:#fff')}>{odds}%</span>
                  {delta > 0 && <span style={st(`font:600 10.5px var(--font-mono);color:${MINT}`)}>+{delta}</span>}
                </div>
                <span style={st('font:600 11.5px/1.15 var(--font-ui);color:#fff;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical')}>{title}</span>
              </div>
            </button>
          );
        })}
      </PlinkoBoard>
      {!settled && (
        <div style={st('min-height:112px;margin-top:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center')}>
          {play.closed ? (
            <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>{landed ? t('spin.plinko.landedBang') : t('spin.stake.dropping')}</span>
          ) : (
            <>
              <div style={st('display:flex;width:min(260px,70%);justify-content:space-between;gap:10px')}>
                <Counter>{t('spin.stake.staked', { n: staked, total: play.participants.length })}</Counter>
                <Counter>{secondsLeft(play.closesAt, now)}s</Counter>
              </div>
              <TimerBar from={play.startAt} to={play.closesAt} now={now} />
              <Roster members={members} userIds={play.participants} done={(id) => id in play.stakes} />
              <Hint>{canStake ? (myBin === undefined ? t('spin.stake.tapBin') : t('spin.stake.moveChip')) : t('spin.stake.watching')}</Hint>
            </>
          )}
        </div>
      )}
    </>
  );
}
