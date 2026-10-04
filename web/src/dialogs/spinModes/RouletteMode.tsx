import { ROULETTE_SPIN_MS, type RoulettePlay } from '@queueup/shared';
import { st } from '../../ui/st';
import { Hint, QuMark, pct, type ModeProps } from './shared';

/** A CSS-style cubic-bezier easing as a function of progress (0..1). Solves x(t) by bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const at = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      if (at(t, x1, x2) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return at(t, y1, y2);
  };
}

const spinEase = cubicBezier(0.1, 0.62, 0.08, 1);

/** Same title hash as the cover gradients, so a wedge's colour matches its placeholder art. */
function hueOf(title: string): number {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const mod360 = (n: number) => ((n % 360) + 360) % 360;

/** 3a Prize wheel: weight-sized wedges, one long spin that lands on the server's pick. */
export function RouletteMode({ play, games, now, mobile, settled }: ModeProps<RoulettePlay>) {
  const size = mobile ? 260 : 330;
  const total = play.wedges.reduce((s, w) => s + w.weight, 0) || 1;
  let edge = 0;
  const wedges = play.wedges.map((w, i) => {
    const span = (w.weight / total) * 360;
    const title = games.get(w.gameId)?.title ?? '…';
    const r = { ...w, i, title, start: edge, end: edge + span, mid: edge + span / 2, color: `oklch(${i % 2 ? 0.46 : 0.56} 0.12 ${hueOf(title)})` };
    edge += span;
    return r;
  });
  const conic = `conic-gradient(from 0deg, ${wedges.map((w) => `${w.color} ${w.start}deg ${w.end}deg`).join(', ')})`;

  // Rest with wedge 0 centred under the pointer, then 6 turns plus whatever brings `landing` to the top.
  const from = -(wedges[0]?.mid ?? 0);
  const to = from + 360 * 6 + mod360(-play.landing * 360 - from);
  const t = Math.max(0, now - play.startAt) / ROULETTE_SPIN_MS;
  const rot = settled ? to : from + (to - from) * spinEase(Math.min(1, t));
  const labelWidth = size / 2 - 46 - 12;

  const wheel = (
    <div style={st(`position:relative;width:${size}px;height:${size}px;flex-shrink:0`)}>
      <div
        style={st(
          `position:absolute;inset:0;border-radius:50%;overflow:hidden;background:${conic};box-shadow:0 0 0 6px var(--surf), 0 0 0 7px var(--line)`,
          { transform: `rotate(${rot.toFixed(2)}deg)` },
        )}
      >
        {wedges.map((w) => (
          <div key={w.gameId} style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transform: `rotate(${(w.mid - 90).toFixed(2)}deg)` }}>
            <span
              style={st(
                `position:absolute;left:46px;top:-8px;width:${labelWidth}px;font:600 ${mobile ? 10.5 : 11.5}px/16px var(--font-ui);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px oklch(0 0 0 / 0.6)`,
              )}
            >
              {w.title}
            </span>
          </div>
        ))}
      </div>
      <div style={st('position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:var(--bg2);box-shadow:0 0 0 4px var(--surf);display:flex;align-items:center;justify-content:center')}>
        <QuMark size={28} />
      </div>
      <div
        aria-hidden
        style={st('position:absolute;left:50%;top:-14px;transform:translateX(-50%);width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-top:26px solid var(--text);filter:drop-shadow(0 3px 4px oklch(0 0 0 / 0.5))')}
      />
    </div>
  );

  const legend = (
    <div style={st(mobile ? 'width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 6px' : 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px')}>
      {wedges.map((w) => {
        const win = settled && w.gameId === play.winnerId;
        return (
          <div
            key={w.gameId}
            style={st(
              `display:flex;align-items:center;gap:9px;padding:5px 8px;border-radius:9px;background:${win ? 'var(--surf2)' : 'transparent'};opacity:${settled && !win ? 0.35 : 1};transition:background .2s, opacity .3s`,
            )}
          >
            <span style={st(`width:12px;height:12px;flex-shrink:0;border-radius:3px;background:${w.color}`)} />
            <span style={st(`flex:1;min-width:0;font:500 12.5px var(--font-ui);color:${win ? 'var(--text)' : 'var(--text2)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{w.title}</span>
            <span style={st('font:600 11.5px var(--font-mono);color:var(--muted)')}>{pct(w.weight, total)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div
        role="img"
        aria-label={settled ? `Prize wheel landed on ${games.get(play.winnerId ?? '')?.title ?? 'the pick'}` : 'Prize wheel spinning'}
        style={st(
          mobile
            ? 'border-radius:20px;background:var(--bg);padding:26px 12px 14px;display:flex;flex-direction:column;align-items:center;gap:18px'
            : 'height:372px;padding:0 24px;border-radius:20px;background:var(--bg);display:flex;align-items:center;gap:28px',
        )}
      >
        {wheel}
        {legend}
      </div>
      {!settled && (
        <div style={st('margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center')}>
          <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>Round and round…</span>
          <Hint>Bigger slice, better odds</Hint>
        </div>
      )}
    </>
  );
}
