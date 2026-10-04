import { CARD_DEAL_MS, type CardVotePlay, type Game } from '@queueup/shared';
import { st } from '../../ui/st';
import { AvatarStack, CardBack, Counter, Cover, Hint, MINE_RING, Roster, Stage, TimerBar, WIN_RING, secondsLeft, type ModeProps } from './shared';

const FLIP_GAP_MS = 320;
const FLIP_MS = 600;

/** Roughly the design's cubic-bezier(.3,.7,.3,1): fast out, soft landing. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function metaLine(game: Game | undefined): string {
  return [game?.genre?.split(',')[0], game?.timeToBeatHours ? `~${game.timeToBeatHours}h` : ''].filter(Boolean).join(' · ');
}

/** 1a Three-card vote: three cards deal face down and flip 320ms apart, then everyone taps the one
 * they want. Voters stack under each card; the winner lifts once the vote closes. */
export function CardVoteMode({ play, games, members, me, now, act, mobile, settled }: ModeProps<CardVotePlay>) {
  const dealtAt = play.startAt + CARD_DEAL_MS;
  const dealing = now < dealtAt;
  const decided = !!play.winnerId;
  const playing = play.participants.includes(me);
  // The server accepts votes from 200ms before the deal ends.
  const canVote = playing && !decided && !play.closed && now >= dealtAt - 200;
  const mine = play.votes[me];
  const voted = Object.keys(play.votes).length;

  const cardW = mobile ? 100 : 168;
  const cardH = cardW * 1.5;

  return (
    <>
      <Stage height={mobile ? cardH + 74 : 372} style={st('display:flex;align-items:center;justify-content:center')}>
        <div style={st(`display:flex;justify-content:center;gap:${mobile ? 8 : 18}px;padding:0 ${mobile ? 8 : 16}px;width:100%`)}>
          {play.cards.map((card, i) => {
            const game = games.get(card.gameId);
            const flip = easeOut(Math.min(1, Math.max(0, now - play.startAt - i * FLIP_GAP_MS) / FLIP_MS));
            const isWin = decided && play.winnerId === card.gameId;
            const voters = play.participants.filter((id) => play.votes[id] === i);
            const ring = isWin ? WIN_RING : mine === i && !decided ? MINE_RING : '0 10px 24px oklch(0 0 0 / 0.35)';
            return (
              <div key={card.gameId} style={st(`display:flex;flex-direction:column;align-items:center;gap:${mobile ? 8 : 10}px;flex:0 1 ${cardW}px;min-width:0`)}>
                <button
                  type="button"
                  disabled={!canVote}
                  onClick={() => act({ type: 'vote', card: i })}
                  aria-label={`Vote for ${game?.title ?? 'this game'}`}
                  aria-pressed={mine === i}
                  style={st(
                    `display:block;width:100%;max-width:${cardW}px;aspect-ratio:2/3;padding:0;border:none;background:none;font:inherit;color:inherit;perspective:900px;cursor:${canVote ? 'pointer' : 'default'};transition:transform .35s ease, opacity .35s ease`,
                    {
                      transform: isWin ? 'translateY(-6px) scale(1.04)' : 'none',
                      opacity: settled && !isWin ? 0.35 : 1,
                    },
                  )}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateY(${180 * (1 - flip)}deg)` }}>
                    <Cover
                      game={game}
                      title={false}
                      style={st('position:absolute;inset:0;border-radius:14px;backface-visibility:hidden;-webkit-backface-visibility:hidden;transition:box-shadow .2s', { boxShadow: ring })}
                    >
                      <div
                        style={st(
                          `position:absolute;left:0;right:0;bottom:0;padding:${mobile ? '22px 8px 8px' : '30px 12px 12px'};background:linear-gradient(to bottom, transparent, oklch(0 0 0 / 0.85));display:flex;flex-direction:column;gap:3px;text-align:left`,
                        )}
                      >
                        <span style={st(`font:700 ${mobile ? 12.5 : 16}px/1.1 var(--font-display);letter-spacing:-0.01em;color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)}>
                          {game?.title ?? '…'}
                        </span>
                        {!mobile && <span style={st('font:500 11px var(--font-ui);color:oklch(1 0 0 / 0.75)')}>{metaLine(game)}</span>}
                      </div>
                    </Cover>
                    <div style={st('position:absolute;inset:0;border-radius:14px;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform:rotateY(180deg)')}>
                      <CardBack />
                    </div>
                  </div>
                </button>
                <div style={st('height:24px;display:flex;align-items:center;gap:6px')}>
                  <AvatarStack members={members} userIds={voters} size={mobile ? 20 : 24} />
                  {voters.length > 0 && (
                    <span style={st('font:500 11.5px var(--font-mono);color:var(--muted);white-space:nowrap')}>
                      {voters.length} vote{voters.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Stage>

      {!settled && (
        <div style={st('margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center')}>
          {dealing ? (
            <Hint>Dealing…</Hint>
          ) : decided ? (
            <Counter>VOTING CLOSED</Counter>
          ) : (
            <>
              <Counter>
                {playing ? (mine === undefined ? 'TAP A CARD TO VOTE' : 'TAP ANOTHER CARD TO CHANGE') : `${voted} OF ${play.participants.length} VOTED`} · {secondsLeft(play.closesAt, now)}s
              </Counter>
              <TimerBar from={dealtAt} to={play.closesAt} now={now} />
            </>
          )}
          <Roster members={members} userIds={play.participants} done={(id) => id in play.votes} />
          {!playing && <Hint>You joined after this round started. You can watch this one.</Hint>}
        </div>
      )}
    </>
  );
}
