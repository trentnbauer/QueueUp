import { WALL_BALL_R, WALL_PLAYER_R, WALL_PLAYER_SPEED, WALL_REACH, WALL_ROW_Y, WALL_Y, type WallSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** Where your own player is drawn, kept between frames: it moves the moment you press (the server only hears about it a moment
 * later) and is pulled back toward where the server says it is, so the two never drift far apart. */
const predicted = new WeakMap<object, { x: number; at: number }>();

function drawWorld(sc: Scene<WallSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  // Between snapshots the ball carries on along its line and each player at the way they are holding.
  const age = sc.fx.age(snapshot, now);

  // The wall across the top, with a glow where the ball last met it.
  roundRect(ctx, S * 0.04, S * (WALL_Y - 0.03), S * 0.92, S * 0.03, S * 0.012);
  ctx.fillStyle = 'oklch(0.34 0.03 60)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  // The floor line the players stand on.
  ctx.fillStyle = STAGE.groundLine;
  ctx.fillRect(S * 0.04, S * (WALL_ROW_Y + WALL_PLAYER_R + 0.012), S * 0.92, 1);

  // Where the ball will land, for whoever's turn it is: a ring on the floor with the reach shown as a bar.
  const target = snapshot.players.find((p) => p.id === snapshot.targetId);
  if (snapshot.leg === 'down' && snapshot.landX >= 0 && target?.alive) {
    const cx = snapshot.landX * S;
    const cy = WALL_ROW_Y * S;
    const soon = Math.max(0, 1 - snapshot.landInMs / 600);
    ctx.strokeStyle = theme.mint;
    ctx.globalAlpha = 0.35 + 0.5 * soon;
    ctx.lineWidth = 2 + soon * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, S * WALL_REACH * 0.5 * (1.2 - 0.3 * soon), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const toward = Math.min(1, Math.max(0, p.x + p.dir * WALL_PLAYER_SPEED * age));
    let x = toward;
    if (p.id === sc.me && snapshot.phase === 'playing') {
      const last = predicted.get(sc.fx) ?? { x: toward, at: now };
      const dt = Math.min(0.1, (now - last.at) / 1000);
      let pos = Math.min(1, Math.max(0, last.x + sc.held.dx * WALL_PLAYER_SPEED * dt));
      pos += (toward - pos) * Math.min(1, dt * 6);
      predicted.set(sc.fx, { x: pos, at: now });
      x = pos;
    }
    const mine = p.id === snapshot.targetId;
    ctx.save();
    // Everyone but the one whose turn it is is dimmed, so it is clear who the ball is coming for.
    if (!mine && snapshot.phase === 'playing') ctx.globalAlpha = 0.55;
    sc.drawPlayer(p.id, x * S, WALL_ROW_Y * S, WALL_PLAYER_R * S, WALL_PLAYER_R * S);
    ctx.restore();
    if (mine && snapshot.phase === 'playing') {
      ctx.strokeStyle = theme.mint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x * S, WALL_ROW_Y * S, WALL_PLAYER_R * S * 1.45, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = `700 ${Math.round(S * 0.024)}px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.text;
    ctx.fillText(String(p.meters), x * S, (WALL_ROW_Y + WALL_PLAYER_R + 0.045) * S);
  }

  // The ball.
  const bx = snapshot.ball.x + snapshot.ball.vx * age;
  const by = snapshot.ball.y + snapshot.ball.vy * age;
  ctx.save();
  ctx.shadowColor = theme.acc;
  ctx.shadowBlur = S * 0.03;
  ctx.fillStyle = theme.text;
  ctx.beginPath();
  ctx.arc(bx * S, by * S, WALL_BALL_R * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const scene: SceneGame<WallSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: WALL_ROW_Y }),
};

export const wallView: LobbyGameView<WallSnapshot> = {
  // Left and right to slide along the bottom: the ball is hit back for you if you are in the ring as it lands.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.wall.name',
  taglineKey: 'spin.lobby.wall.tagline',
  hintKey: 'spin.lobby.wall.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
