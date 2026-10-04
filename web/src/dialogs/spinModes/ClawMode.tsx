import { useState } from 'react';
import {
  CLAW_BOARD,
  CLAW_CARRY_MS,
  CLAW_CLOSE_MS,
  CLAW_DOWN_MS,
  CLAW_FALL_MS,
  CLAW_ITEM_WIDTH,
  CLAW_LEAD_MS,
  CLAW_RAIL_MIN,
  CLAW_SLIP_MS,
  CLAW_TRIES,
  CLAW_TURN_GAP_MS,
  clawAnimMs,
  clawItemCenter,
  clawItemLeft,
  clawItemUnder,
  clawXAt,
  currentTurn,
  type ClawPlay,
  type ClawTry,
} from '@queueup/shared';
import { st } from '../../ui/st';
import { Counter, Cover, Hint, Pill, Roster, ScaledBoard, TimerBar, WIN_RING, nameOf, type ModeProps } from './shared';

const REST_CABLE = 40;
const GRAB_CABLE = 196;
const MISS_CABLE = 238;
const LIFT = GRAB_CABLE - REST_CABLE;
const CHUTE_X = 62;
const ITEM_H = 104;
const OPEN = 24;
const CLOSED = -6;

/** A CSS cubic-bezier(x1,y1,x2,y2) easing as a function of progress 0..1. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
const drop = bezier(0.45, 0, 0.25, 1);
const easeIn = bezier(0.5, 0, 1, 1);
const easeOut = bezier(0, 0, 0.58, 1);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

interface ClawFrame {
  x: number;
  cable: number;
  /** Prong angle: OPEN (24) to CLOSED (6). */
  prong: number;
  /** Item being moved and its offset from its spot. */
  item: number | null;
  dx: number;
  dy: number;
}

/** Where everything is `t` ms into try `tr`. Drop, close, then carry to the chute or lift and slip. */
function tryFrame(tr: ClawTry, t: number): ClawFrame {
  const depth = tr.item === null ? MISS_CABLE : GRAB_CABLE;
  const base: ClawFrame = { x: tr.x, cable: REST_CABLE, prong: OPEN, item: tr.item, dx: 0, dy: 0 };
  if (t < CLAW_DOWN_MS) return { ...base, cable: lerp(REST_CABLE, depth, drop(t / CLAW_DOWN_MS)) };
  t -= CLAW_DOWN_MS;
  if (t < CLAW_CLOSE_MS) return { ...base, cable: depth, prong: lerp(OPEN, CLOSED, t / CLAW_CLOSE_MS) };
  t -= CLAW_CLOSE_MS;
  if (tr.success && tr.item !== null) {
    const centre = clawItemCenter(tr.item);
    // First part of the carry lifts the item off the floor, the rest swings it over the chute.
    const liftMs = CLAW_CARRY_MS * 0.45;
    if (t < CLAW_CARRY_MS) {
      const up = drop(clamp01(t / liftMs));
      const across = drop(clamp01((t - liftMs) / (CLAW_CARRY_MS - liftMs)));
      return { ...base, x: lerp(tr.x, CHUTE_X, across), cable: lerp(GRAB_CABLE, REST_CABLE, up), prong: CLOSED, dx: (CHUTE_X - centre) * across, dy: -LIFT * up };
    }
    t -= CLAW_CARRY_MS;
    const fall = easeIn(clamp01(t / CLAW_FALL_MS));
    return { ...base, x: CHUTE_X, prong: lerp(CLOSED, OPEN, clamp01(t / CLAW_CLOSE_MS)), dx: CHUTE_X - centre, dy: -LIFT * (1 - fall) };
  }
  // Slip: rise, the item comes up 26px with the claw, then the prongs open and it drops back.
  const u = clamp01(t / CLAW_SLIP_MS);
  const cable = lerp(depth, REST_CABLE, drop(u));
  const hold = 0.4;
  const dy = u < hold ? -26 * easeOut(u / hold) : -26 * (1 - easeIn(clamp01((u - hold) / 0.3)));
  return { ...base, cable, prong: u < hold ? CLOSED : lerp(CLOSED, OPEN, clamp01((u - hold) / 0.2)), dy: tr.item === null ? 0 : dy };
}

/** The claw machine: the claw sweeps the rail and the member whose turn it is drops it. Every try is
 * replayed from its timestamp: drop, grip, then carry to the chute or slip. Three misses and the
 * machine takes pity on a weighted pick. */
export function ClawMode({ play, games, members, me, now, act, settled }: ModeProps<ClawPlay>) {
  const [sentFor, setSentFor] = useState(-1);
  const tries = play.tries;
  const last = tries[tries.length - 1];
  const lastEnd = last ? last.at + clawAnimMs(last.success) : 0;
  const animating = last && now < lastEnd ? last : null;
  const turn = currentTurn(play);
  const live = !play.winnerId && play.turnStartedAt !== null && !animating;
  const sweeping = live && now >= play.turnStartedAt!;
  const myTurn = turn === me && sweeping && sentFor !== tries.length;

  // Successful items stay in the chute; everything else sits on the floor.
  const won = tries.find((t) => t.success);
  let frame: ClawFrame;
  if (animating) frame = tryFrame(animating, now - animating.at);
  else if (won) frame = tryFrame(won, Infinity);
  else if (play.turnStartedAt !== null && !play.winnerId) {
    // Glide back to the rail start between turns, then sweep.
    const sweepFrom = play.turnStartedAt + CLAW_LEAD_MS;
    const x =
      last && now < sweepFrom ? lerp(last.x, CLAW_RAIL_MIN, clamp01((now - lastEnd) / Math.max(1, sweepFrom - lastEnd))) : clawXAt(play.turnStartedAt, now);
    frame = { x, cable: REST_CABLE, prong: OPEN, item: null, dx: 0, dy: 0 };
  } else frame = { x: last?.x ?? CLAW_RAIL_MIN, cable: REST_CABLE, prong: OPEN, item: null, dx: 0, dy: 0 };

  const under = live ? clawItemUnder(frame.x, play.items.length) : null;
  const dropNow = () => {
    if (!myTurn || play.turnStartedAt === null) return;
    setSentFor(tries.length);
    act({ type: 'drop', x: clawXAt(play.turnStartedAt, now) });
  };

  // "Slipped!" / "Missed" from the moment it lets go until the next turn starts sweeping.
  const lastSlip = last && !last.success ? last : null;
  const toast =
    lastSlip && now >= lastSlip.at + CLAW_DOWN_MS + CLAW_CLOSE_MS + (lastSlip.item === null ? 0 : CLAW_SLIP_MS * 0.4) && now < lastEnd + CLAW_TURN_GAP_MS + CLAW_LEAD_MS
      ? lastSlip.item === null
        ? 'Missed'
        : 'Slipped!'
      : null;
  const finished = play.winnerId !== null && !animating;
  const actor = animating?.userId ?? turn;

  return (
    <>
      <ScaledBoard width={CLAW_BOARD.width} height={CLAW_BOARD.height}>
        <div style={st('position:absolute;top:14px;left:14px;right:14px;height:6px;border-radius:3px;background:var(--surf2)')} />
        <div
          style={st(
            'position:absolute;left:14px;bottom:12px;width:96px;height:132px;border-radius:12px;border:2px dashed var(--line);display:flex;align-items:flex-start;justify-content:center;padding-top:10px;font:500 10.5px var(--font-mono);letter-spacing:0.08em;color:var(--faint)',
          )}
        >
          CHUTE
        </div>
        {play.items.map((it, i) => {
          const moving = frame.item === i;
          const win = finished && it.gameId === play.winnerId;
          const ring = win ? WIN_RING : under === i ? '0 0 0 2px var(--text2)' : 'none';
          return (
            <Cover
              key={it.gameId}
              game={games.get(it.gameId)}
              style={{
                position: 'absolute',
                left: clawItemLeft(i),
                bottom: 12,
                width: CLAW_ITEM_WIDTH,
                height: ITEM_H,
                transform: moving ? `translate(${frame.dx}px, ${frame.dy}px)` : undefined,
                boxShadow: ring,
                opacity: settled && !win ? 0.4 : 1,
                transition: 'opacity .3s, box-shadow .2s',
                zIndex: moving ? 2 : undefined,
              }}
            >
              <Pill style={{ position: 'absolute', top: 6, left: 6, height: 18, padding: '0 6px', background: 'oklch(0 0 0 / 0.5)' }}>{Math.round(play.grips[i] * 100)}% grip</Pill>
            </Cover>
          );
        })}
        <div style={{ position: 'absolute', top: 17, left: frame.x, width: 0, height: 0, zIndex: 3 }}>
          <div style={st('position:absolute;left:-2px;top:0;width:4px;height:12px;border-radius:2px;background:var(--text2)')} />
          <div style={{ position: 'absolute', left: -1, top: 0, width: 2, height: frame.cable, background: 'var(--muted)' }} />
          <div style={{ position: 'absolute', left: -24, top: frame.cable, width: 48, height: 44 }}>
            <div style={st('position:absolute;left:8px;top:0;width:32px;height:13px;border-radius:5px;background:var(--text2)')} />
            <div style={st('position:absolute;left:7px;top:9px;width:5px;height:32px;border-radius:3px;background:var(--text2);transform-origin:50% 0', { transform: `rotate(${frame.prong}deg)` })} />
            <div style={st('position:absolute;right:7px;top:9px;width:5px;height:32px;border-radius:3px;background:var(--text2);transform-origin:50% 0', { transform: `rotate(${-frame.prong}deg)` })} />
          </div>
        </div>
        {toast && <span style={st('position:absolute;right:16px;top:30px;height:26px;padding:0 11px;border-radius:999px;background:var(--surf2);color:var(--text);font:600 12px/26px var(--font-ui)')}>{toast}</span>}
        {myTurn && <button type="button" aria-label="Drop the claw here" onClick={dropNow} style={st('position:absolute;inset:0;border:none;background:transparent;cursor:pointer;z-index:4')} />}
      </ScaledBoard>
      {!settled && (
        <div style={st('min-height:112px;margin-top:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center')}>
          {finished ? (
            <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>{play.pity ? 'Three misses. The machine is taking pity…' : 'Got it!'}</span>
          ) : (
            <>
              <Counter>
                Try {Math.min(CLAW_TRIES, animating ? tries.length : tries.length + 1)} of {CLAW_TRIES}
                {actor ? ` · ${actor === me ? 'Your' : `${nameOf(members, actor)}'s`} turn` : ''}
              </Counter>
              {sweeping && play.turnEndsAt !== null && <TimerBar from={play.turnStartedAt!} to={play.turnEndsAt} now={now} />}
              <Roster members={members} userIds={play.participants} active={actor} />
              {myTurn ? (
                <button
                  type="button"
                  onClick={dropNow}
                  style={st('margin-top:4px;height:46px;padding:0 32px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:800 15px var(--font-display);box-shadow:0 8px 24px var(--accA35);cursor:pointer')}
                >
                  Drop claw
                </button>
              ) : (
                <Hint>
                  {animating
                    ? `${animating.userId === me ? 'Your' : `${nameOf(members, animating.userId)}'s`} claw is dropping…`
                    : actor === me
                      ? 'Get ready…'
                      : actor
                        ? `${nameOf(members, actor)} is lining up…`
                        : ''}
                </Hint>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
