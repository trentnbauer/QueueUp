import { RUNNER_X, type RunnerSnapshot } from '@queueup/shared';
import type { LobbyDrawArgs, LobbyGameView } from './index';

// Mirrors the server's sizes (server/src/services/lobbyGames/runner.ts) so what is drawn is what is hit.
const STAND_HEIGHT = 0.45;
const DUCK_HEIGHT = 0.25;
const CACTUS = { width: 0.1, height: 0.35 };
const LOG = { width: 0.3, height: 0.35 };
const BIRD = { width: 0.06, from: 0.3, to: 0.7 };
const RUNNER_WIDTH = 0.04;

/** When this browser first saw each snapshot, so the course can keep scrolling smoothly between the
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

function draw({ ctx, size, snapshot, me, users, ease, color, t }: LobbyDrawArgs<RunnerSnapshot>) {
  const now = performance.now();
  if (!seenAt.has(snapshot)) seenAt.set(snapshot, now);
  const running = snapshot.phase === 'playing';
  const sinceSnapshot = running ? Math.min(0.12, (now - (seenAt.get(snapshot) ?? now)) / 1000) : 0;
  const scroll = snapshot.speed * sinceSnapshot;

  ctx.fillStyle = color('--bg', '#161210');
  ctx.fillRect(0, 0, size, size);

  // One shared track: every runner is on it together, over the same obstacles.
  const unit = size * 0.5; // one "lane height" of jump
  const ground = size * 0.82;
  const dashOffset = running ? ((now / 1000) * snapshot.speed * size) % 28 : 0;
  const gold = 'oklch(0.9 0.14 90)';

  // Ground line with moving dashes.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, ground, size, size - ground);
  ctx.strokeStyle = color('--chip', '#444');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(size, ground);
  ctx.stroke();
  ctx.setLineDash([10, 18]);
  ctx.lineDashOffset = dashOffset;
  ctx.beginPath();
  ctx.moveTo(0, ground + size * 0.04);
  ctx.lineTo(size, ground + size * 0.04);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const o of snapshot.obstacles) {
    const cx = (o.x - scroll) * size;
    if (o.kind === 'cactus') {
      const w = CACTUS.width * size;
      const h = CACTUS.height * unit;
      ctx.fillStyle = 'oklch(0.7 0.15 150)';
      ctx.fillRect(cx - w / 2, ground - h, w, h);
      ctx.fillRect(cx - w * 0.9, ground - h * 0.7, w * 0.35, h * 0.28);
      ctx.fillRect(cx + w * 0.55, ground - h * 0.8, w * 0.35, h * 0.28);
    } else if (o.kind === 'log') {
      // A wide, low log: a held jump to clear it.
      const w = LOG.width * size;
      const h = LOG.height * unit;
      ctx.fillStyle = 'oklch(0.5 0.08 55)';
      ctx.fillRect(cx - w / 2, ground - h, w, h);
      ctx.fillStyle = 'oklch(0.62 0.09 60)';
      ctx.fillRect(cx - w / 2, ground - h, w, h * 0.22);
      ctx.strokeStyle = 'oklch(0.38 0.06 55)';
      ctx.lineWidth = 2;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - w / 2 + (w * k) / 4, ground - h);
        ctx.lineTo(cx - w / 2 + (w * k) / 4, ground);
        ctx.stroke();
      }
    } else {
      const w = BIRD.width * size;
      const y0 = ground - BIRD.to * unit;
      const h = (BIRD.to - BIRD.from) * unit;
      const flap = Math.sin(now / 90) > 0 ? 1 : -1;
      const cy = y0 + h / 2;
      ctx.fillStyle = 'oklch(0.78 0.14 55)';
      // Body, then a wing that flaps up and down.
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.2, cy);
      ctx.lineTo(cx + w * 0.2, cy);
      ctx.lineTo(cx, cy - flap * h * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // The runners. They all stand at the same spot on the track, so they are fanned out a few pixels
  // (drawing only - everyone is hit at the same place) and the viewer is drawn last, on top.
  const spread = size * 0.006;
  const order = [...snapshot.players.keys()].sort((a, b) => Number(snapshot.players[a].id === me) - Number(snapshot.players[b].id === me) || Number(snapshot.players[a].alive) - Number(snapshot.players[b].alive));
  for (const i of order) {
    const p = snapshot.players[i];
    const user = users.get(p.id);
    const lift = ease(p.id, 0, p.h).y;
    const bodyH = (p.ducking ? DUCK_HEIGHT : STAND_HEIGHT) * unit;
    const rx = (RUNNER_WIDTH * size) / 2 + 1;
    const cx = RUNNER_X * size + (i - (snapshot.players.length - 1) / 2) * spread;
    const cy = ground - lift * unit - bodyH / 2;
    ctx.globalAlpha = p.alive ? 0.92 : 0.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, bodyH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = user?.avatarColor ?? '#8b5cf6';
    ctx.fill();
    if (p.id === me) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = color('--text', '#fff');
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(Math.min(rx * 1.3, bodyH * 0.6))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((user?.displayName ?? '?').slice(0, 1).toUpperCase(), cx, cy + 1);
    ctx.globalAlpha = 1;
  }

  // Banner and distance.
  const mine = snapshot.players.find((p) => p.id === me);
  if (snapshot.phase !== 'lobby') drawText(ctx, t('spin.lobby.runner.meters', { n: snapshot.meters }), size - size * 0.03, size * 0.05, size * 0.045, color('--text', '#fff'), 'right');
  if (snapshot.phase === 'countdown') {
    drawText(ctx, t('spin.lobby.runner.countdown', { n: Math.max(1, Math.ceil(snapshot.timerMs / 1000)) }), size * 0.4, size * 0.05, size * 0.055, gold);
  } else if (snapshot.phase === 'over') {
    const winner = snapshot.winnerId ? users.get(snapshot.winnerId)?.displayName ?? '?' : null;
    const text = winner ? t('spin.lobby.runner.winner', { name: winner }) : snapshot.players.length > 1 ? t('spin.lobby.runner.draw') : t('spin.lobby.runner.soloOver', { n: snapshot.players[0]?.meters ?? 0 });
    drawText(ctx, text, size * 0.4, size * 0.05, size * 0.05, gold);
  } else if (snapshot.phase === 'playing' && mine && !mine.alive) {
    drawText(ctx, t('spin.lobby.runner.out'), size * 0.4, size * 0.05, size * 0.045, color('--text', '#fff'));
  }
}

export const runnerView: LobbyGameView<RunnerSnapshot> = {
  // Two held buttons: Jump (Space or Up; hold it to jump higher and further) and Duck (Down). Tapping
  // the arena is a Jump too.
  pad: 'none',
  holds: [
    { labelKey: 'spin.lobby.runner.duck', dx: 0, dy: 1, keys: ['ArrowDown', 's'] },
    { labelKey: 'spin.lobby.runner.jump', dx: 0, dy: -1, keys: [' ', 'ArrowUp', 'w'], primary: true },
  ],
  actions: [],
  tapHold: [0, -1],
  hintKey: 'spin.lobby.runner.hint',
  draw,
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
