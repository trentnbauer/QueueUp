import { FLAPPY_BIRD_RADIUS, FLAPPY_GAP, FLAPPY_PIPE_WIDTH, FLAPPY_X, type FlappySnapshot } from '@queueup/shared';
import type { LobbyDrawArgs, LobbyGameView } from './index';

/** When this browser first saw each snapshot, so the pipes keep scrolling smoothly between the
 * server's snapshots instead of moving in 15-a-second steps. */
const seenAt = new WeakMap<object, number>();

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center') {
  ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function draw({ ctx, size, snapshot, me, users, ease, color, t }: LobbyDrawArgs<FlappySnapshot>) {
  const now = performance.now();
  if (!seenAt.has(snapshot)) seenAt.set(snapshot, now);
  const running = snapshot.phase === 'playing';
  const scroll = running ? snapshot.speed * Math.min(0.12, (now - (seenAt.get(snapshot) ?? now)) / 1000) : 0;
  const gold = 'oklch(0.9 0.14 90)';
  // Heights are 0 (floor) to 1 (ceiling); the canvas counts down from the top.
  const py = (y: number) => size * (1 - y);

  // Sky and a strip of ground.
  ctx.fillStyle = color('--bg', '#161210');
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, py(0.03), size, size * 0.03);

  // Pipes: a top and a bottom block either side of the opening.
  const pipeW = FLAPPY_PIPE_WIDTH * size;
  for (const p of snapshot.pipes) {
    const x = (p.x - scroll) * size - pipeW / 2;
    const top = py(p.gap + FLAPPY_GAP / 2);
    const bottom = py(p.gap - FLAPPY_GAP / 2);
    ctx.fillStyle = 'oklch(0.7 0.15 150)';
    ctx.fillRect(x, 0, pipeW, top);
    ctx.fillRect(x, bottom, pipeW, size - bottom);
    ctx.fillStyle = 'oklch(0.58 0.14 150)';
    ctx.fillRect(x - pipeW * 0.12, top - size * 0.025, pipeW * 1.24, size * 0.025);
    ctx.fillRect(x - pipeW * 0.12, bottom, pipeW * 1.24, size * 0.025);
  }

  // The birds all fly the same course, so they are drawn at the same spot, fanned a few pixels
  // apart; the viewer is drawn last, on top.
  const spread = size * 0.006;
  const radius = FLAPPY_BIRD_RADIUS * size;
  const order = [...snapshot.players.keys()].sort((a, b) => Number(snapshot.players[a].id === me) - Number(snapshot.players[b].id === me) || Number(snapshot.players[a].alive) - Number(snapshot.players[b].alive));
  for (const i of order) {
    const b = snapshot.players[i];
    const user = users.get(b.id);
    const cx = FLAPPY_X * size + (i - (snapshot.players.length - 1) / 2) * spread;
    const cy = py(ease(b.id, 0, b.y).y);
    ctx.globalAlpha = b.alive ? 0.92 : 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = user?.avatarColor ?? '#8b5cf6';
    ctx.fill();
    if (b.id === me) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = color('--text', '#fff');
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(radius)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((user?.displayName ?? '?').slice(0, 1).toUpperCase(), cx, cy + 1);
    ctx.globalAlpha = 1;
  }

  // Banner and distance.
  const mine = snapshot.players.find((p) => p.id === me);
  if (snapshot.phase !== 'lobby') drawText(ctx, t('spin.lobby.flappy.meters', { n: snapshot.meters }), size - size * 0.03, size * 0.05, size * 0.045, color('--text', '#fff'), 'right');
  if (snapshot.phase === 'countdown') {
    drawText(ctx, t('spin.lobby.flappy.countdown', { n: Math.max(1, Math.ceil(snapshot.timerMs / 1000)) }), size * 0.4, size * 0.05, size * 0.055, gold);
  } else if (snapshot.phase === 'over') {
    const winner = snapshot.winnerId ? users.get(snapshot.winnerId)?.displayName ?? '?' : null;
    const text = winner ? t('spin.lobby.flappy.winner', { name: winner }) : snapshot.players.length > 1 ? t('spin.lobby.flappy.draw') : t('spin.lobby.flappy.soloOver', { n: snapshot.players[0]?.meters ?? 0 });
    drawText(ctx, text, size * 0.4, size * 0.05, size * 0.05, gold);
  } else if (snapshot.phase === 'playing' && mine && !mine.alive) {
    drawText(ctx, t('spin.lobby.flappy.out'), size * 0.4, size * 0.05, size * 0.045, color('--text', '#fff'));
  }
}

export const flappyView: LobbyGameView<FlappySnapshot> = {
  // One button: Flap (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'flap', labelKey: 'spin.lobby.flappy.flap', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'flap',
  hintKey: 'spin.lobby.flappy.hint',
  draw,
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
