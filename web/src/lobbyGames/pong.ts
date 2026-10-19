import { PONG_BALL_R, PONG_PADDLE_LENGTH, PONG_PADDLE_SPEED, PONG_PADDLE_THICKNESS, type PongSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** Where a side's paddle is on the arena for a position along it, as fractions of its side: sides 0 and 1 (bottom and top)
 * run along x, sides 2 and 3 (left and right) along y. */
function paddleBox(seat: number, pos: number): { x: number; y: number; w: number; h: number } {
  const L = PONG_PADDLE_LENGTH;
  const T = PONG_PADDLE_THICKNESS;
  if (seat === 0) return { x: pos - L / 2, y: 1 - T, w: L, h: T };
  if (seat === 1) return { x: pos - L / 2, y: 0, w: L, h: T };
  if (seat === 2) return { x: 0, y: pos - L / 2, w: T, h: L };
  return { x: 1 - T, y: pos - L / 2, w: T, h: L };
}

/** Where your own paddle is drawn, kept between frames: it moves the moment you press (the server only hears about it a moment later) and is
 * pulled back toward where the server says it is, so the two never drift far apart. */
const predicted = new WeakMap<object, { pos: number; at: number }>();

function drawWorld(sc: Scene<PongSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  // The server sends about 15 snapshots a second, so between them everything carries on at the speed it was going: the ball
  // along its line, and each paddle at the way its player is holding. Drawing only what the last snapshot said looks jerky.
  const age = sc.fx.age(snapshot, sc.now);
  const half = PONG_PADDLE_LENGTH / 2;

  // Sides nobody defends are walls: a faint line along the edge.
  const defended = new Set(snapshot.players.filter((p) => p.alive && p.seat >= 0).map((p) => p.seat));
  ctx.fillStyle = 'oklch(1 0 0 / 0.14)';
  for (let seat = 0; seat < 4; seat++) {
    if (defended.has(seat)) continue;
    const box = paddleBox(seat, 0.5);
    const full = seat < 2 ? { x: 0, y: box.y, w: 1, h: box.h * 0.35 } : { x: box.x, y: 0, w: box.w * 0.35, h: 1 };
    ctx.fillRect(full.x * S + (seat === 3 ? box.w * S * 0.65 : 0), full.y * S + (seat === 0 ? box.h * S * 0.65 : 0), full.w * S, full.h * S);
  }

  // Paddles, in each player's colour; yours has a bright edge.
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive || p.seat < 0) continue; // out: the burst has taken them
    const toward = Math.min(1 - half, Math.max(half, p.pos + p.dir * PONG_PADDLE_SPEED * age));
    let along = toward;
    if (p.id === sc.me && snapshot.phase === 'playing') {
      const last = predicted.get(sc.fx) ?? { pos: toward, at: sc.now };
      const dt = Math.min(0.1, (sc.now - last.at) / 1000);
      let pos = Math.min(1 - half, Math.max(half, last.pos + sc.held.dx * PONG_PADDLE_SPEED * dt));
      pos += (toward - pos) * Math.min(1, dt * 6);
      predicted.set(sc.fx, { pos, at: sc.now });
      along = pos;
    }
    const box = paddleBox(p.seat, along);
    roundRect(ctx, box.x * S, box.y * S, box.w * S, box.h * S, Math.min(box.w, box.h) * S * 0.45);
    ctx.fillStyle = sc.info(p.id).color;
    ctx.fill();
    if (p.id === sc.me) {
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // The ball.
  const ball = { x: snapshot.ball.x + snapshot.ball.vx * age, y: snapshot.ball.y + snapshot.ball.vy * age };
  ctx.save();
  ctx.shadowColor = theme.acc;
  ctx.shadowBlur = S * 0.03;
  ctx.globalAlpha = snapshot.serving ? 0.5 + 0.4 * Math.sin(sc.now / 90) : 1;
  ctx.fillStyle = theme.text;
  ctx.beginPath();
  ctx.arc(ball.x * S, ball.y * S, PONG_BALL_R * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The middle of the court, faintly.
  ctx.strokeStyle = STAGE.groundTick;
  ctx.globalAlpha = 0.25;
  ctx.setLineDash([S * 0.02, S * 0.02]);
  ctx.beginPath();
  ctx.moveTo(S / 2, S * 0.08);
  ctx.lineTo(S / 2, S * 0.92);
  ctx.moveTo(S * 0.08, S / 2);
  ctx.lineTo(S * 0.92, S / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

const scene: SceneGame<PongSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => {
    const p = snapshot.players[index];
    const box = paddleBox(Math.max(0, p.seat), p.pos);
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  },
};

export const pongView: LobbyGameView<PongSnapshot> = {
  // Just left and right (on the side paddles, left is up and right is down).
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.pong.name',
  taglineKey: 'spin.lobby.pong.tagline',
  hintKey: 'spin.lobby.pong.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
