import { PENDULUM_ARM, PENDULUM_GROUND_Y, PENDULUM_PIVOT_X, PENDULUM_PIVOT_Y, type PendulumSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, STRIP_Y, drawPrompt, drawStandings, renderScene, roundRect, stripX, type Scene, type SceneGame } from './kit';

// The standings strip, the round on the prompt line, then the world: the pendulum hanging over a platform on the ground, and the cue under it.
const BALL_R = 0.026;
const PLATFORM_H = 0.03;
const MARK_H = 0.05;
const CUE_Y = 0.96;

function drawWorld(sc: Scene<PendulumSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Whoever has let go this round gets a done mark (the score stays visible).
  drawStandings(sc, { badge: (p) => (p.dropped && p.alive ? 'ok' : !p.alive ? 'no' : null) });
  if (snapshot.round > 0) drawPrompt(sc, sc.t('spin.lobby.pendulum.round', { n: snapshot.round }));

  // The ground, and the platform on it with its excellent middle.
  const gy = PENDULUM_GROUND_Y * S;
  ctx.fillStyle = STAGE.groundLine;
  ctx.fillRect(S * 0.04, gy + PLATFORM_H * S, S * 0.92, 1);
  if (snapshot.round > 0) {
    roundRect(ctx, (snapshot.centre - snapshot.half) * S, gy, snapshot.half * 2 * S, PLATFORM_H * S, PLATFORM_H * S * 0.3);
    ctx.fillStyle = 'oklch(0.7 0.16 150 / 0.6)';
    ctx.fill();
    ctx.fillStyle = theme.star;
    ctx.globalAlpha = 0.8;
    ctx.fillRect((snapshot.centre - snapshot.excellent) * S, gy, snapshot.excellent * 2 * S, PLATFORM_H * S);
    ctx.globalAlpha = 1;
  }

  // Where each ball landed this round, a tick in each person's colour.
  for (const p of snapshot.players) {
    if (p.at < 0 || p.at > 1) continue;
    ctx.fillStyle = sc.info(p.id).color;
    ctx.fillRect(p.at * S - 1.5, gy - MARK_H * S * 0.6, 3, MARK_H * S);
  }

  // The pendulum: a hook, the arm and the ball, swinging while a round is on.
  const px = PENDULUM_PIVOT_X * S;
  const py = PENDULUM_PIVOT_Y * S;
  const angle = sc.ease('angle', snapshot.angle, 0).x;
  const bx = px + Math.sin(angle) * PENDULUM_ARM * S;
  const by = py + Math.cos(angle) * PENDULUM_ARM * S;
  ctx.strokeStyle = 'oklch(1 0 0 / 0.5)';
  ctx.lineWidth = Math.max(2, S * 0.005);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.fillStyle = STAGE.ground;
  ctx.beginPath();
  ctx.arc(px, py, S * 0.012, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = theme.acc;
  ctx.shadowBlur = S * 0.02;
  ctx.fillStyle = theme.text;
  ctx.beginPath();
  ctx.arc(bx, by, BALL_R * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The cue is a second prompt by position only: same font and size, accent tone.
  const mine = snapshot.players.find((p) => p.id === sc.me);
  if (snapshot.stage === 'sweep' && mine?.alive) drawPrompt(sc, sc.t(mine.dropped ? 'spin.lobby.pendulum.waiting' : 'spin.lobby.pendulum.cue'), 'accent', CUE_Y);
}

const scene: SceneGame<PendulumSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const pendulumView: LobbyGameView<PendulumSnapshot> = {
  // One button: Let go (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'drop', labelKey: 'spin.lobby.pendulum.drop', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'drop',
  nameKey: 'spin.lobby.pendulum.name',
  taglineKey: 'spin.lobby.pendulum.tagline',
  hintKey: 'spin.lobby.pendulum.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
