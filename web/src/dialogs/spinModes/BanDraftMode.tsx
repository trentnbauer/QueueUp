import { BAN_TURN_MS, currentTurn, type BanDraftPlay, type Game } from '@queueup/shared';
import { st } from '../../ui/st';
import { t, useT } from '../../i18n';
import { Counter, Cover, DANGER, DANGER_BG, Hint, MemberAvatar, TimerBar, WIN_RING, nameOf, secondsLeft, type ModeProps } from './shared';

function metaLine(game: Game | undefined): string {
  return [game?.genre?.split(',')[0], game?.timeToBeatHours ? t('spin.result.hours', { n: game.timeToBeatHours }) : ''].filter(Boolean).join(' · ');
}

/** Cards per row: one row while they fit, otherwise two (three across on phones). */
function columns(n: number, mobile: boolean): number {
  if (mobile) return n <= 4 ? n : n <= 6 ? 3 : 4;
  return n <= 6 ? n : Math.ceil(n / 2);
}

/** 1e Ban draft: members take turns banning one of the dealt games (members + 1 of them); the
 * last one standing wins. A turn that times out bans the lowest-weighted game for them. */
export function BanDraftMode({ play, games, members, me, now, act, mobile, settled }: ModeProps<BanDraftPlay>) {
  const t = useT();
  const turn = currentTurn(play);
  const myTurn = turn === me;
  const banOf = (gameId: string) => play.bans.find((b) => b.gameId === gameId);
  const n = play.participants.length;
  const cols = columns(play.cards.length, mobile);

  return (
    <>
      <div style={st(`padding:${mobile ? 12 : 16}px;border-radius:20px;background:var(--bg);display:flex;flex-direction:column;justify-content:center;gap:14px;min-height:${mobile ? 0 : 372}px;box-sizing:border-box`)}>
        <div style={st(`display:grid;grid-template-columns:repeat(${Math.min(n, mobile ? 2 : 4)},minmax(0,1fr));gap:8px`)}>
          {play.participants.map((id, i) => {
            // Each member's own bans, in turn order (one each unless the draft wraps round).
            const own = play.bans.filter((_, k) => k % n === i);
            const active = turn === id;
            const last = own[own.length - 1];
            const lastTitle = last ? games.get(last.gameId)?.title ?? t('spin.fallback.aGame') : '';
            const sub = active ? (id === me ? t('spin.ban.yourBan') : t('spin.ban.thinking')) : last ? (last.auto ? t('spin.ban.timedOutTitle', { title: lastTitle }) : t('spin.ban.bannedTitle', { title: lastTitle })) : t('spin.ban.slot', { n: i + 1 });
            const done = !!last && !active;
            return (
              <div
                key={id}
                style={st(`display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:14px;min-width:0;transition:opacity .2s, box-shadow .2s`, {
                  background: active ? 'var(--surf2)' : 'var(--surf)',
                  boxShadow: active ? '0 0 0 2px var(--acc)' : 'none',
                  opacity: done || active || !turn ? 1 : 0.55,
                })}
              >
                <MemberAvatar members={members} userId={id} size={26} style={{ border: 'none' }} />
                <div style={st('display:flex;flex-direction:column;min-width:0')}>
                  <span style={st('font:600 12.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{nameOf(members, id, me)}</span>
                  <span style={st('font:500 11px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{sub}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={st(`display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${mobile ? 8 : 10}px`)}>
          {play.cards.map((card) => {
            const game = games.get(card.gameId);
            const ban = banOf(card.gameId);
            const isWin = !!play.winnerId && play.winnerId === card.gameId;
            const canBan = myTurn && !ban;
            return (
              <button
                key={card.gameId}
                type="button"
                disabled={!canBan}
                onClick={() => act({ type: 'ban', gameId: card.gameId })}
                aria-label={ban ? t('spin.ban.cardBanned', { title: game?.title ?? t('spin.fallback.game') }) : t('spin.ban.cardBan', { title: game?.title ?? t('spin.fallback.thisGame') })}
                style={st(`position:relative;display:block;aspect-ratio:2/3;padding:0;border:none;border-radius:12px;overflow:hidden;background:none;font:inherit;color:inherit;transition:transform .25s, box-shadow .25s, opacity .35s`, {
                  cursor: canBan ? 'pointer' : 'default',
                  boxShadow: isWin ? WIN_RING : '0 8px 20px oklch(0 0 0 / 0.3)',
                  transform: isWin ? 'translateY(-6px) scale(1.04)' : 'none',
                  opacity: settled && !isWin ? 0.35 : 1,
                })}
              >
                <Cover game={game} title={false} style={st('position:absolute;inset:0;border-radius:0;transition:filter .35s', { filter: ban ? 'grayscale(1) brightness(0.3)' : 'none' })}>
                  <span
                    style={st(
                      `position:absolute;left:0;right:0;bottom:0;padding:${mobile ? '16px 6px 6px' : '22px 9px 9px'};display:flex;flex-direction:column;gap:2px;text-align:left;background:linear-gradient(to bottom, transparent, oklch(0 0 0 / 0.82))`,
                    )}
                  >
                    <span style={st(`font:600 ${mobile ? 11 : 12}px/1.15 var(--font-ui);color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`)}>{game?.title ?? '…'}</span>
                    {!mobile && <span style={st('font:500 10.5px var(--font-ui);color:oklch(1 0 0 / 0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{metaLine(game)}</span>}
                  </span>
                </Cover>
                {ban && (
                  <div style={st('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px')}>
                    <MemberAvatar members={members} userId={ban.userId} size={30} style={{ border: '2px solid var(--bg)' }} />
                    <span style={st(`font:800 ${mobile ? 11.5 : 13}px var(--font-display);letter-spacing:0.04em;color:${DANGER}`)}>{t('spin.ban.banned')}</span>
                    {ban.auto && <span style={st('font:600 9.5px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('spin.ban.timedOut')}</span>}
                  </div>
                )}
                {canBan && (
                  <span style={st(`position:absolute;top:8px;right:8px;height:22px;padding:0 9px;border-radius:999px;background:${DANGER_BG};color:#fff;font:700 11px/22px var(--font-ui)`)}>{t('spin.ban.pill')}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!settled && (
        <div style={st('margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center')}>
          {turn && play.turnEndsAt !== null ? (
            <>
              <Counter>{t('spin.ban.counter', { n: play.bans.length + 1, total: play.banCount, s: secondsLeft(play.turnEndsAt, now) })}</Counter>
              <TimerBar from={play.turnEndsAt - BAN_TURN_MS} to={play.turnEndsAt} now={now} />
              <Hint>{myTurn ? t('spin.ban.yourTurn') : t('spin.ban.choosing', { name: nameOf(members, turn) })}</Hint>
            </>
          ) : (
            <Hint>{t('spin.ban.lastStanding')}</Hint>
          )}
          {!play.participants.includes(me) && <Hint>{t('spin.mode.lateJoin')}</Hint>}
        </div>
      )}
    </>
  );
}
