import type { ReactNode } from 'react';
import { PLINKO_FALL_MS, PLINKO_ROWS, PLINKO_SEGMENT_MS, type Game, type PlinkoPlay } from '@queueup/shared';
import { coverBg } from '../../ui/primitives';
import { st } from '../../ui/st';
import { Hint, ScaledBoard, WIN_RING, pct, type ModeProps } from './shared';

// Board geometry (board pixels, the design's 644x372).
const BW = 644;
const BH = 372;
const PEG_TOP = 60;
const PEG_GAP = 28;
const PEG_SPACING = BW / 13;
const BIN_PAD = 8;
const BIN_GAP = 4;
const RAIL_Y = 24;

const PEGS = Array.from({ length: PLINKO_ROWS }, (_, r) => {
  const n = r % 2 ? 12 : 13;
  const off = r % 2 ? PEG_SPACING : PEG_SPACING / 2;
  return Array.from({ length: n }, (_, c) => ({ x: off + c * PEG_SPACING - 3, y: PEG_TOP + r * PEG_GAP - 3 }));
}).flat();

/** Where fraction `f` of the weight line falls on the drawn bin row (which has padding and gaps). */
function binRowX(f: number, weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const inner = BW - 2 * BIN_PAD - BIN_GAP * (weights.length - 1);
  let edge = 0;
  let x = BIN_PAD;
  for (let i = 0; i < weights.length; i++) {
    const share = weights[i] / total;
    const w = inner * share;
    if (f <= edge + share || i === weights.length - 1) return x + w * Math.max(0, Math.min(1, (f - edge) / (share || 1)));
    edge += share;
    x += w + BIN_GAP;
  }
  return BW / 2;
}

/** The chip's board position at `now`, falling along `path` from `dropAt`: one segment per peg row,
 * with a small bounce arc between pegs. */
function chipAt(path: number[], dropAt: number, now: number, weights: number[], binHeight: number) {
  const binY = BH - BIN_PAD - binHeight + 32;
  const pts = path.map((f, i) => ({
    x: i === path.length - 1 ? binRowX(f, weights) : Math.max(12, Math.min(BW - 12, f * BW)),
    y: i === 0 ? RAIL_Y : i === path.length - 1 ? binY : PEG_TOP + (i - 1) * PEG_GAP - 10,
  }));
  const t = Math.max(0, now - dropAt);
  const i = Math.floor(t / PLINKO_SEGMENT_MS);
  if (i >= pts.length - 1) return pts[pts.length - 1];
  const a = pts[i];
  const b = pts[i + 1];
  const u = (t % PLINKO_SEGMENT_MS) / PLINKO_SEGMENT_MS;
  const arc = i > 0 && i < pts.length - 2 ? Math.sin(Math.PI * u) * 7 : 0;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u * u - arc };
}

/** True once a chip dropped at `dropAt` has reached its bin. */
export function plinkoLanded(dropAt: number | null, now: number): boolean {
  return dropAt !== null && now >= dropAt + PLINKO_FALL_MS;
}

/** A bin's background: its cover under a darkening gradient so the labels read. */
export function binBackground(game: Game | undefined, top = 0.15, bottom = 0.65): string {
  return `linear-gradient(to bottom, oklch(0 0 0 / ${top}), oklch(0 0 0 / ${bottom})), ${coverBg(game?.title ?? '…', game?.coverImageUrl ?? null)}`;
}

/** The plinko board shared by solo and chip-stake plinko: dashed drop rail, offset peg rows, the bin
 * row (`children`, laid out by flex weight) and the chip. Before `dropAt` a ghost chip waits on the
 * rail at the drop point. */
export function PlinkoBoard({
  rail,
  weights,
  binHeight,
  path,
  dropAt,
  now,
  children,
}: {
  rail: string;
  /** Bin weights as drawn (for landing the chip inside the right bin). */
  weights: number[];
  binHeight: number;
  path: number[] | null;
  dropAt: number | null;
  now: number;
  children: ReactNode;
}) {
  const falling = path && dropAt !== null && now >= dropAt;
  const chip = falling ? chipAt(path, dropAt, now, weights, binHeight) : null;
  return (
    <ScaledBoard width={BW} height={BH}>
      <div
        style={st(
          'position:absolute;left:14px;right:14px;top:10px;height:28px;border-radius:999px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;font:500 10.5px var(--font-mono);letter-spacing:0.08em;color:var(--faint)',
        )}
      >
        {rail}
      </div>
      {PEGS.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, width: 6, height: 6, borderRadius: '50%', background: 'var(--surf2)' }} />
      ))}
      <div style={st(`position:absolute;left:${BIN_PAD}px;right:${BIN_PAD}px;bottom:${BIN_PAD}px;height:${binHeight}px;display:flex;gap:${BIN_GAP}px`)}>{children}</div>
      {path && !falling && (
        <div style={{ position: 'absolute', top: RAIL_Y - 7, left: Math.max(12, Math.min(BW - 12, path[0] * BW)) - 7, width: 14, height: 14, borderRadius: '50%', background: 'var(--accA45)', pointerEvents: 'none' }} />
      )}
      {chip && (
        <div
          style={{ position: 'absolute', left: chip.x - 7, top: chip.y - 7, width: 14, height: 14, borderRadius: '50%', background: 'var(--acc)', boxShadow: '0 0 14px var(--accA70)', pointerEvents: 'none' }}
        />
      )}
    </ScaledBoard>
  );
}

/** Solo plinko: bins sized by weight share; the server picks the bin and the path, and the chip
 * drops on its own at `dropAt`. */
export function PlinkoMode({ play, games, now, settled }: ModeProps<PlinkoPlay>) {
  const weights = play.bins.map((b) => b.weight);
  const total = weights.reduce((s, w) => s + w, 0);
  const landed = plinkoLanded(play.dropAt, now);
  return (
    <>
      <PlinkoBoard rail={landed ? 'LANDED' : 'DROP ANYWHERE ALONG HERE'} weights={weights} binHeight={96} path={play.path} dropAt={play.dropAt} now={now}>
        {play.bins.map((b) => {
          const game = games.get(b.gameId);
          const win = landed && b.gameId === play.winnerId;
          return (
            <div
              key={b.gameId}
              style={st(
                `position:relative;flex:${b.weight} 1 0;min-width:0;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;padding:8px;transition:box-shadow .2s, opacity .3s`,
                { background: binBackground(game), boxShadow: win ? WIN_RING : 'none', opacity: settled && !win ? 0.35 : 1 },
              )}
            >
              <span style={st('font:600 10.5px var(--font-mono);color:oklch(1 0 0 / 0.8)')}>{pct(b.weight, total)}</span>
              <span style={st('font:600 11.5px/1.15 var(--font-ui);color:#fff;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical')}>{game?.title ?? '…'}</span>
            </div>
          );
        })}
      </PlinkoBoard>
      {!settled && (
        <div style={st('min-height:112px;margin-top:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center')}>
          <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>{now < play.dropAt ? 'Lining up the drop…' : landed ? 'Landed!' : 'Bouncing…'}</span>
          <Hint>Where it drops changes the bounce, not the odds</Hint>
        </div>
      )}
    </>
  );
}
