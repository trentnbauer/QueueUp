import { slotSpinEnd, slotStopTimes, type SlotPlay, type SlotSpin } from '@queueup/shared';
import { st } from '../../ui/st';
import { t, useT } from '../../i18n';
import { cubicBezier } from './RouletteMode';
import { Counter, Cover, Stage, WIN_RING, type ModeProps } from './shared';

/** Strip speed while a reel spins freely, in cells per ms (one cover every 60ms). */
const SPEED = 1 / 60;
/** How long a reel takes to ease from full speed onto its final symbol. */
const EASE_MS = 700;
const stopEase = cubicBezier(0.2, 0.75, 0.3, 1.06);
/** Cells the ease covers, so its starting speed (the bezier's slope 0.75/0.2) matches SPEED. */
const EASE_CELLS = (SPEED * EASE_MS) / (0.75 / 0.2);

/** Deterministic filler for cell `k` of a reel, so the strip doesn't flicker between frames. */
function fillerIndex(spin: number, reel: number, k: number, n: number): number {
  let h = (spin * 7919 + reel * 104729 + k * 31337) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) % n;
}

/** Where reel `i` of `spin` is at `now`: the strip position (in cells, the final symbol at index
 * `final`), or null once it has stopped. */
function reelPosition(spin: SlotSpin, i: number, now: number): { pos: number; final: number } | null {
  const stop = slotStopTimes(spin)[i];
  if (spin.held[i] || now >= stop) return null;
  const easeFrom = stop - EASE_MS;
  const elapsed = Math.max(0, now - spin.at);
  const pos0 = SPEED * Math.max(0, easeFrom - spin.at);
  const final = Math.round(pos0 + EASE_CELLS);
  if (now < easeFrom) return { pos: SPEED * elapsed, final };
  return { pos: pos0 + (final - pos0) * stopEase((now - easeFrom) / EASE_MS), final };
}

function statusFor(spin: SlotSpin, title: (id: string) => string): string {
  const odd = spin.held.indexOf(false);
  if (odd < 0 || !spin.held.some(Boolean)) return t('spin.slot.noMatch');
  const pairId = spin.reels[spin.held.indexOf(true)];
  return t(odd === 2 ? 'spin.slot.pairLast' : odd === 0 ? 'spin.slot.pairFirst' : 'spin.slot.pairMiddle', { title: title(pairId) });
}

/** 1b Hold & respin slots: replays the server's precomputed spins. Pairs hold, the odd reel respins. */
export function SlotMode({ play, games, now, mobile, settled }: ModeProps<SlotPlay>) {
  const t = useT();
  const reelW = mobile ? 96 : 150;
  const reelH = mobile ? 172 : 250;
  const cellH = mobile ? 138 : 200;
  const title = (id: string) => games.get(id)?.title ?? '…';
  const symbols = play.symbols.length ? play.symbols : [{ gameId: play.spins[0]?.reels[0] ?? '', weight: 1 }];

  let idx = 0;
  play.spins.forEach((s, i) => {
    if (s.at <= now) idx = i;
  });
  const spin = play.spins[idx];
  if (!spin) return <Stage>{null}</Stage>;
  const lastSpin = idx === play.spins.length - 1;
  const stopped = now >= slotSpinEnd(spin);
  // Between the last reel stopping and the respin starting, show what's about to hold.
  const next = stopped && !lastSpin ? play.spins[idx + 1] : null;
  const prev = idx > 0 ? play.spins[idx - 1] : null;

  const status = next ? statusFor(next, title) : idx === 0 ? t('spin.slot.rolling') : statusFor(spin, title);
  const done = stopped && lastSpin;

  const reels = [0, 1, 2].map((i) => {
    const moving = reelPosition(spin, i, now);
    const held = next ? next.held[i] : spin.held[i];
    const won = done && spin.reels[i] === play.winnerId;
    const frameOn = (!settled && held) || won;
    const cellTop = (reelH - cellH) / 2;
    let cells: { k: number; id: string; y: number }[];
    if (!moving) {
      cells = [{ k: 0, id: spin.reels[i], y: cellTop }];
    } else {
      const base = Math.floor(moving.pos);
      cells = [];
      for (let k = base - 1; k <= base + 2; k++) {
        if (k < 0) continue;
        const id =
          k === moving.final
            ? spin.reels[i]
            : k === 0 && prev
              ? prev.reels[i]
              : symbols[fillerIndex(idx, i, k, symbols.length)].gameId;
        cells.push({ k, id, y: cellTop + (k - moving.pos) * cellH });
      }
    }
    return (
      <div
        key={i}
        aria-label={moving ? t('spin.slot.reelSpinning', { n: i + 1 }) : t(held && !settled ? 'spin.slot.reelHeld' : 'spin.slot.reel', { n: i + 1, title: title(spin.reels[i]) })}
        style={st(
          `position:relative;width:${reelW}px;height:${reelH}px;flex-shrink:0;border-radius:16px;overflow:hidden;background:var(--bg2);box-shadow:inset 0 0 0 1px var(--chip);transition:opacity .3s`,
          { opacity: settled && !won ? 0.35 : 1 },
        )}
      >
        {cells.map((c) => (
          <div key={c.k} style={{ position: 'absolute', left: mobile ? 6 : 9, right: mobile ? 6 : 9, top: 0, height: cellH, padding: '6px 0', transform: `translateY(${c.y.toFixed(1)}px)` }}>
            <Cover game={games.get(c.id)} titleSize={mobile ? 10.5 : 12} style={{ height: '100%' }} />
          </div>
        ))}
        <div style={st('position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom, oklch(0 0 0 / 0.6), transparent 20%, transparent 80%, oklch(0 0 0 / 0.6))')} />
        <div
          style={st(
            `position:absolute;left:4px;right:4px;top:${cellTop + 2}px;height:${cellH - 4}px;border-radius:15px;pointer-events:none;transition:border-color .2s, box-shadow .2s`,
            {
              border: `2.5px solid ${frameOn ? 'var(--acc)' : 'var(--line)'}`,
              boxShadow: settled && won ? WIN_RING : frameOn ? '0 0 22px var(--accA45)' : 'none',
            },
          )}
        />
        {held && !settled && (
          <span style={st('position:absolute;left:50%;bottom:3px;transform:translateX(-50%);height:18px;padding:0 8px;border-radius:999px;background:var(--acc);color:var(--ink);font:700 10px/18px var(--font-mono);letter-spacing:0.06em')}>
            {t('spin.slot.held')}
          </span>
        )}
      </div>
    );
  });

  return (
    <>
      <Stage height={mobile ? 268 : 372} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: mobile ? 12 : 16 }}>
        <div style={st(`display:flex;gap:${mobile ? 8 : 12}px`)}>{reels}</div>
        <div style={st('display:flex;align-items:center;gap:10px')} aria-label={t('spin.slot.respinsUsed', { n: idx, total: play.respinLimit })}>
          <span style={st('font:500 11px var(--font-mono);letter-spacing:0.06em;color:var(--faint)')}>{t('spin.slot.respins')}</span>
          <div style={st('display:flex;gap:4px')}>
            {Array.from({ length: play.respinLimit }, (_, i) => (
              <span key={i} style={st(`width:${mobile ? 14 : 20}px;height:6px;border-radius:3px;transition:background .2s`, { background: i < idx ? 'var(--acc)' : 'var(--chip)' })} />
            ))}
          </div>
        </div>
      </Stage>
      {!settled && (
        <div style={st('margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center')}>
          <Counter>{idx === 0 ? t('spin.slot.firstPull') : t('spin.slot.respinOf', { n: idx, total: play.respinLimit })}</Counter>
          <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>{done ? t('spin.slot.settled') : status}</span>
        </div>
      )}
    </>
  );
}
