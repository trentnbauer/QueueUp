import { MATCH_TURN_MS, currentTurn, type MatchThreePlay } from '@queueup/shared';
import { st } from '../../ui/st';
import { CardBack, Counter, Cover, Hint, MemberAvatar, Roster, TimerBar, WIN_RING, nameOf, secondsLeft, type ModeProps } from './shared';

const FLIP_MS = 500;

/** Roughly the design's cubic-bezier(.3,.7,.3,1). */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** 3c Match three: twelve face-down tiles, members flip one each in turn and tiles stay up. The
 * first game to show three times wins. */
export function MatchThreeMode({ play, games, members, me, now, act, mobile, settled }: ModeProps<MatchThreePlay>) {
  const turn = currentTurn(play);
  const myTurn = turn === me;
  const flipOf = new Map(play.flips.map((f) => [f.tile, f]));
  const last = play.flips[play.flips.length - 1];
  // The winning triple lights up once the third tile has turned over.
  const showWin = !!play.winnerId && (settled || (!!last && now >= last.at + FLIP_MS));

  const counts = new Map<string, number>();
  for (const id of play.tiles) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const tally = [...counts].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div style={st(`padding:${mobile ? 12 : 16}px;border-radius:20px;background:var(--bg);display:flex;flex-direction:column;justify-content:center;gap:12px;min-height:${mobile ? 0 : 372}px;box-sizing:border-box`)}>
        <div style={st('min-height:26px;display:flex;flex-wrap:wrap;gap:6px')}>
          {tally.length ? (
            tally.map(([id, n]) => (
              <div key={id} style={st(`height:26px;display:flex;align-items:center;gap:7px;padding:0 10px;border-radius:999px;max-width:100%;background:${n >= 2 ? 'var(--surf2)' : 'var(--surf)'}`)}>
                <span style={st('font:500 12px var(--font-ui);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0')}>{games.get(id)?.title ?? '…'}</span>
                <span aria-label={`${n} of 3`} style={st('flex-shrink:0;font:600 11px var(--font-mono);letter-spacing:0.1em;color:var(--accText)')}>
                  {'●'.repeat(Math.min(3, n)) + '○'.repeat(Math.max(0, 3 - n))}
                </span>
              </div>
            ))
          ) : (
            <span style={st('font:500 12px/26px var(--font-ui);color:var(--faint)')}>Nothing flipped yet</span>
          )}
        </div>

        <div style={st(`display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:${mobile ? 8 : 10}px`)}>
          {play.tiles.map((id, i) => {
            const flip = flipOf.get(i);
            const up = !!id && !!flip;
            const turned = id && flip ? easeOut(Math.min(1, Math.max(0, now - flip.at) / FLIP_MS)) : 0;
            const inTrip = showWin && id === play.winnerId;
            const canFlip = myTurn && !id;
            const game = id ? games.get(id) : undefined;
            return (
              <button
                key={i}
                type="button"
                disabled={!canFlip}
                onClick={() => act({ type: 'flip', tile: i })}
                aria-label={up ? `Tile ${i + 1}: ${game?.title ?? 'a game'}` : `Flip tile ${i + 1}`}
                style={st(`display:block;height:${mobile ? 72 : 96}px;padding:0;border:none;background:none;font:inherit;color:inherit;perspective:800px;transition:transform .3s, opacity .3s`, {
                  cursor: canFlip ? 'pointer' : 'default',
                  transform: inTrip ? 'translateY(-4px)' : 'none',
                  opacity: settled && !inTrip ? 0.35 : 1,
                })}
              >
                <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateY(${180 * (1 - turned)}deg)` }}>
                  <Cover
                    game={game}
                    title={!!game}
                    titleSize={mobile ? 10 : 11.5}
                    style={st('position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;text-align:left;transition:box-shadow .3s', { boxShadow: inTrip ? WIN_RING : 'none' })}
                  >
                    {flip && <MemberAvatar members={members} userId={flip.userId} size={mobile ? 18 : 20} style={{ position: 'absolute', top: 5, right: 5, border: '2px solid oklch(0 0 0 / 0.4)' }} />}
                  </Cover>
                  <div style={st('position:absolute;inset:0;border-radius:12px;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform:rotateY(180deg)')}>
                    <CardBack accent={canFlip} style={st('transition:border-color .2s')} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!settled && (
        <div style={st('margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center')}>
          {turn && play.turnEndsAt !== null ? (
            <>
              <Counter>
                FLIP {play.flips.length + 1} OF {play.tiles.length} · {secondsLeft(play.turnEndsAt, now)}s
              </Counter>
              <TimerBar from={play.turnEndsAt - MATCH_TURN_MS} to={play.turnEndsAt} now={now} />
              <Roster members={members} userIds={play.participants} active={turn} />
              <Hint>{myTurn ? 'Your flip. Tap any tile.' : `${nameOf(members, turn)} is flipping…`}</Hint>
            </>
          ) : (
            <Hint>Three of a kind!</Hint>
          )}
          {!play.participants.includes(me) && <Hint>You joined after this round started. You can watch this one.</Hint>}
        </div>
      )}
    </>
  );
}
