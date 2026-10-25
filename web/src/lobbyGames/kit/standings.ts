import type { LobbyGameSnapshot } from '@queueup/shared';
import { FONT, STAGE, type StageTheme } from './theme';
import type { Scene } from './scene';

/** The standings strip: one row of everyone in the run, in the same place, size and type in every game. Sizes are fractions of `S`. */
export const STRIP_Y = 0.15;
export const STRIP_R = 0.022;
/** The most room the strip takes across the arena, and the widest gap between two players. */
const STRIP_SPAN = 0.84;
const STRIP_STEP = 0.09;
/** How faint someone who is out of the run is drawn. Out players stay in the strip (never hidden), so the row never reshuffles. */
export const OUT_ALPHA = 0.35;

/** Where player number `index` of `count` sits across the strip, as a fraction of the arena. Use it in `anchor()` too, so a burst starts on the avatar. */
export function stripX(count: number, index: number): number {
  return 0.5 + (index - (count - 1) / 2) * Math.min(STRIP_STEP, STRIP_SPAN / Math.max(1, count));
}

/** A status mark on a player: right, wrong, too late, a tie, or finished. Drawn, not typed, so it looks the same on every device. */
export type BadgeKind = 'ok' | 'no' | 'late' | 'tie' | 'done';

/** A small disc with a mark in it, centred on (x, y), radius `r`. */
export function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: BadgeKind, theme: StageTheme): void {
  const fill = kind === 'ok' || kind === 'done' ? theme.mint : kind === 'tie' ? 'oklch(0.7 0.01 60)' : theme.danger;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.3);
  ctx.strokeStyle = STAGE.ink;
  ctx.stroke();
  ctx.lineWidth = Math.max(1.4, r * 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'ok' || kind === 'done') {
    ctx.moveTo(x - r * 0.45, y);
    ctx.lineTo(x - r * 0.1, y + r * 0.35);
    ctx.lineTo(x + r * 0.5, y - r * 0.35);
  } else if (kind === 'no') {
    ctx.moveTo(x - r * 0.38, y - r * 0.38);
    ctx.lineTo(x + r * 0.38, y + r * 0.38);
    ctx.moveTo(x + r * 0.38, y - r * 0.38);
    ctx.lineTo(x - r * 0.38, y + r * 0.38);
  } else if (kind === 'late') {
    ctx.moveTo(x, y - r * 0.5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + r * 0.38, y + r * 0.2);
  } else {
    ctx.moveTo(x - r * 0.42, y - r * 0.2);
    ctx.lineTo(x + r * 0.42, y - r * 0.2);
    ctx.moveTo(x - r * 0.42, y + r * 0.2);
    ctx.lineTo(x + r * 0.42, y + r * 0.2);
  }
  ctx.stroke();
  ctx.restore();
}

type Player<S extends LobbyGameSnapshot> = S['players'][number];

export interface StandingsOptions<S extends LobbyGameSnapshot> {
  /** The line under each avatar. Default: the player's score (`meters`). Return '' for none. */
  text?: (p: Player<S>) => string;
  /** A status mark on the avatar, or null. */
  badge?: (p: Player<S>) => BadgeKind | null;
  /** Anything extra under the text (lives, a push arrow), drawn at (cx, y) in pixels. */
  under?: (p: Player<S>, cx: number, y: number) => void;
}

/** Draws everyone in the run in one row under the heads-up display. The viewer gets the accent ring and accent score, not the YOU tag (it would
 * run into the HUD pills just above). Call it from `drawWorld`, before the game's own art. */
export function drawStandings<S extends LobbyGameSnapshot>(sc: Scene<S>, o: StandingsOptions<S> = {}): void {
  const { ctx, S, snapshot, theme } = sc;
  const n = snapshot.players.length;
  const y = STRIP_Y * S;
  const r = STRIP_R * S;
  for (const i of sc.order()) {
    const p = snapshot.players[i] as Player<S>;
    const cx = stripX(n, i) * S;
    ctx.save();
    if (!p.alive) ctx.globalAlpha = OUT_ALPHA;
    sc.drawPlayer(p.id, cx, y, r, r, { tag: false });
    const badge = o.badge?.(p);
    if (badge) drawBadge(ctx, cx + r * 0.78, y + r * 0.78, S * 0.012, badge, theme);
    const label = o.text ? o.text(p) : String(p.meters);
    if (label) {
      ctx.font = `600 ${Math.round(S * 0.024)}px ${FONT.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = p.id === sc.me ? theme.accText : theme.text;
      ctx.fillText(label, cx, y + r + S * 0.032);
    }
    o.under?.(p, cx, y + r + S * 0.052);
    ctx.restore();
  }
}
