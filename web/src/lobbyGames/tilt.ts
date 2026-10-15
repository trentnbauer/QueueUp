import type { TiltSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** The run's time limit (RUN_LIMIT_S in the rules), for the bar along the top. */
const RUN_MS = 120_000;
// Where things are on the arena, as fractions of its side: the one beam across the middle, and everyone's
// pushes and points in a row under it.
const BEAM_X = 0.08;
const BEAM_W = 0.84;
const BEAM_Y = 0.5;
const BEAM_H = 0.03;
const BALL_R = 0.032;
/** How far the beam leans at full tilt, in radians. */
const LEAN = 0.12;
const TARGET_LIFE_MS = 7000;
/** A target scores when the ball is this close (HIT in the rules). */
const HIT = 0.05;
const ROW_Y = 0.8;
const CHIP_R = 0.024;

function drawWorld(sc: Scene<TiltSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;

  // Time left in the run, as a bar draining along the top edge.
  if (snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / RUN_MS), S * 0.008);
  }

  // The beam leans the way the ball is being pushed; the targets and the ball sit on it, so everything is
  // drawn along it (0 is its left end, 1 its right end).
  const angle = sc.ease('lean', snapshot.tilt * LEAN, 0).x;
  ctx.save();
  ctx.translate(S / 2, BEAM_Y * S);
  ctx.rotate(angle);
  const bw = BEAM_W * S;
  const bh = BEAM_H * S;
  roundRect(ctx, -bw / 2, 0, bw, bh, bh / 2);
  ctx.fillStyle = 'oklch(0.34 0.03 60)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const along = (x: number) => (x - 0.5) * bw;
  for (const t of snapshot.targets) {
    // A target fades as it runs out of time, and flashes in its last second.
    const fade = Math.min(1, t.leftMs / 1000);
    ctx.globalAlpha = (0.4 + 0.6 * Math.min(1, t.leftMs / TARGET_LIFE_MS)) * (t.leftMs < 1500 ? 0.6 + 0.4 * Math.sin(now / 60) : 1) * (0.5 + 0.5 * fade);
    ctx.fillStyle = theme.mint;
    roundRect(ctx, along(t.x) - HIT * S, -bh * 0.5, HIT * 2 * S, bh * 1.5, bh * 0.4);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The ball, in the colour of whoever pushed last (they are the one a target would score for).
  const last = snapshot.players[snapshot.last];
  ctx.save();
  ctx.fillStyle = last ? sc.info(last.id).color : theme.star;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = S * 0.02;
  ctx.beginPath();
  ctx.arc(along(sc.ease('ball', snapshot.ball.x, 0).x), -BALL_R * S, BALL_R * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();

  // Everyone's push and points in a row: an arrow for the way each is pushing, and their targets scored.
  const n = snapshot.players.length;
  const step = Math.min(0.1, 0.88 / Math.max(1, n));
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // watching until the next run
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    sc.drawPlayer(p.id, cx, ROW_Y * S, CHIP_R * S, CHIP_R * S);
    if (p.dir !== 0) {
      const ax = cx + p.dir * CHIP_R * S * 1.7;
      ctx.fillStyle = theme.acc;
      ctx.beginPath();
      ctx.moveTo(ax + p.dir * S * 0.014, ROW_Y * S);
      ctx.lineTo(ax - p.dir * S * 0.008, ROW_Y * S - S * 0.012);
      ctx.lineTo(ax - p.dir * S * 0.008, ROW_Y * S + S * 0.012);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = theme.text;
    ctx.fillText(String(p.meters), cx, (ROW_Y + CHIP_R + 0.03) * S);
  }
}

const scene: SceneGame<TiltSnapshot> = {
  scroll: 'x',
  drawWorld,
  // Nobody is knocked out here, so a burst would only start on the row of players.
  anchor: (snapshot, index) => ({ x: 0.5 + (index - (snapshot.players.length - 1) / 2) * 0.1, y: ROW_Y }),
};

export const tiltView: LobbyGameView<TiltSnapshot> = {
  // Just left and right.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.tilt.name',
  taglineKey: 'spin.lobby.tilt.tagline',
  hintKey: 'spin.lobby.tilt.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
