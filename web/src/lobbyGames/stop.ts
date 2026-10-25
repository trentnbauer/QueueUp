import type { StopSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, STRIP_Y, drawPrompt, drawStandings, renderScene, roundRect, stripX, type Scene, type SceneGame } from './kit';

// The standings strip, the round on the prompt line, the bar with its target zone, and the cue under it.
const BAR_X = 0.08;
const BAR_W = 0.84;
const BAR_Y = 0.52;
const BAR_H = 0.1;
const MARKER_W = 0.012;
const CUE_Y = BAR_Y + BAR_H + 0.13;

function drawWorld(sc: Scene<StopSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Cleared rounds for everyone, an ok badge once they have stopped this round (the score stays visible).
  drawStandings(sc, { badge: (p) => (p.stopped ? 'ok' : !p.alive ? 'no' : null) });
  if (snapshot.round > 0) drawPrompt(sc, sc.t('spin.lobby.stop.round', { n: snapshot.round }));

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
    ctx.fillStyle = 'oklch(0.7 0.16 150 / 0.45)';
    ctx.fillRect(x + (snapshot.centre - snapshot.half) * w, y, snapshot.half * 2 * w, h);
    // The excellent middle (double points).
    ctx.fillStyle = theme.star;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x + (snapshot.centre - snapshot.excellent) * w, y, snapshot.excellent * 2 * w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.mint;
    ctx.fillRect(x + snapshot.centre * w - 1, y, 2, h);
  }
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

  // The cue is a second prompt by position only: same font and size, accent tone. Strings become "Stop it!" / "Waiting for the others".
  const mine = snapshot.players.find((p) => p.id === sc.me);
  if (snapshot.stage === 'sweep' && mine?.alive) drawPrompt(sc, sc.t(mine.stopped ? 'spin.lobby.stop.waiting' : 'spin.lobby.stop.press'), 'accent', CUE_Y);
}

const scene: SceneGame<StopSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const stopView: LobbyGameView<StopSnapshot> = {
  pad: 'none',
  actions: [{ name: 'stop', labelKey: 'spin.lobby.stop.stop', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'stop',
  nameKey: 'spin.lobby.stop.name',
  taglineKey: 'spin.lobby.stop.tagline',
  hintKey: 'spin.lobby.stop.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
