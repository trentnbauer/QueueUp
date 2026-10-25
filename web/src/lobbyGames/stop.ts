import type { StopSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';

// Where things are on the arena, as fractions of its side: everyone's rounds in a row, the round, the bar with its
// target zone, and everyone's stops on it.
const CHIPS_Y = 0.11;
const CHIP_R = 0.022;
const ROUND_Y = 0.3;
const BAR_X = 0.08;
const BAR_W = 0.84;
const BAR_Y = 0.52;
const BAR_H = 0.1;
const MARKER_W = 0.012;

function drawWorld(sc: Scene<StopSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Everyone's cleared rounds in one row; someone who is out is dimmed.
  const n = snapshot.players.length;
  const step = Math.min(0.09, 0.84 / Math.max(1, n));
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out, or watching until the next run
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    sc.drawPlayer(p.id, cx, CHIPS_Y * S, CHIP_R * S, CHIP_R * S);
    ctx.fillStyle = p.stopped ? theme.mint : theme.text;
    ctx.fillText(p.stopped ? '✓' : String(p.meters), cx, (CHIPS_Y + CHIP_R + 0.03) * S);
  }

  if (snapshot.round > 0) {
    ctx.font = `800 ${Math.round(S * 0.05)}px ${FONT.display}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.fillText(sc.t('spin.lobby.stop.round', { n: snapshot.round }), S / 2, ROUND_Y * S);
  }

  // The bar, the target zone on it, and the marker sweeping back and forth.
  const x = BAR_X * S;
  const y = BAR_Y * S;
  const w = BAR_W * S;
  const h = BAR_H * S;
  roundRect(ctx, x, y, w, h, h * 0.25);
  ctx.fillStyle = 'oklch(0.22 0.01 60)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (snapshot.round > 0) {
    const zx = x + (snapshot.centre - snapshot.half) * w;
    const zw = snapshot.half * 2 * w;
    ctx.fillStyle = 'oklch(0.7 0.16 150 / 0.45)';
    ctx.fillRect(zx, y, zw, h);
    ctx.fillStyle = 'oklch(0.8 0.18 95 / 0.7)';
    ctx.fillRect(x + (snapshot.centre - snapshot.excellent) * w, y, snapshot.excellent * 2 * w, h);
    ctx.fillStyle = theme.mint;
    ctx.fillRect(x + snapshot.centre * w - 1, y, 2, h);
  }

  // Stops so far this round, a tick in each person's colour.
  for (const p of snapshot.players) {
    if (p.at < 0) continue;
    ctx.fillStyle = sc.info(p.id).color;
    ctx.fillRect(x + p.at * w - 1.5, y - h * 0.18, 3, h * 1.36);
  }

  if (snapshot.marker >= 0) {
    const m = sc.ease('marker', snapshot.marker, 0).x;
    ctx.save();
    ctx.shadowColor = theme.acc;
    ctx.shadowBlur = S * 0.02;
    ctx.fillStyle = theme.text;
    ctx.fillRect(x + m * w - (MARKER_W * S) / 2, y - h * 0.35, MARKER_W * S, h * 1.7);
    ctx.restore();
  }

  // What to do now.
  ctx.font = `700 ${Math.round(S * 0.034)}px ${FONT.ui}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.accText;
  const mine = snapshot.players.find((p) => p.id === sc.me);
  if (snapshot.stage === 'sweep' && mine?.alive) ctx.fillText(mine.stopped ? sc.t('spin.lobby.stop.waiting') : sc.t('spin.lobby.stop.press'), S / 2, (BAR_Y + BAR_H + 0.13) * S);
}

const scene: SceneGame<StopSnapshot> = {
  scroll: 'y',
  drawWorld,
  // A burst starts over the row of players, where the person who missed is shown.
  anchor: (snapshot, index) => ({ x: 0.5 + (index - (snapshot.players.length - 1) / 2) * 0.09, y: CHIPS_Y }),
};

export const stopView: LobbyGameView<StopSnapshot> = {
  // One button: Stop (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'stop', labelKey: 'spin.lobby.stop.stop', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'stop',
  nameKey: 'spin.lobby.stop.name',
  taglineKey: 'spin.lobby.stop.tagline',
  hintKey: 'spin.lobby.stop.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
