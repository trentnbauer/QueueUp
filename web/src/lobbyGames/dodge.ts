import { DODGE_BLOCK_HEIGHT, DODGE_PLAYER_WIDTH, DODGE_PLAYER_Y, type DodgeSnapshot } from '@queueup/shared';
import type { LobbyDrawArgs, LobbyGameView } from './index';

/** When this browser first saw each snapshot, so blocks keep falling smoothly between the server's
 * snapshots instead of moving in 15-a-second steps. */
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

function draw({ ctx, size, snapshot, me, users, ease, color, t }: LobbyDrawArgs<DodgeSnapshot>) {
  const now = performance.now();
  if (!seenAt.has(snapshot)) seenAt.set(snapshot, now);
  const running = snapshot.phase === 'playing';
  const fall = running ? snapshot.speed * Math.min(0.12, (now - (seenAt.get(snapshot) ?? now)) / 1000) : 0;
  const gold = 'oklch(0.9 0.14 90)';

  ctx.fillStyle = color('--bg', '#161210');
  ctx.fillRect(0, 0, size, size);
  // The floor the players stand on.
  const floor = (DODGE_PLAYER_Y + DODGE_BLOCK_HEIGHT / 2) * size;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, floor, size, size - floor);

  // Falling blocks.
  const blockH = DODGE_BLOCK_HEIGHT * size;
  ctx.fillStyle = 'oklch(0.72 0.14 40)';
  for (const b of snapshot.blocks) {
    const w = b.w * size;
    ctx.fillRect(b.x * size - w / 2, (b.y + fall) * size - blockH / 2, w, blockH);
  }

  // Players: everyone shares the floor, drawn translucent so overlaps show; the viewer is last, on top.
  const radius = (DODGE_PLAYER_WIDTH * size) / 2;
  const order = [...snapshot.players.keys()].sort((a, b) => Number(snapshot.players[a].id === me) - Number(snapshot.players[b].id === me) || Number(snapshot.players[a].alive) - Number(snapshot.players[b].alive));
  for (const i of order) {
    const p = snapshot.players[i];
    const user = users.get(p.id);
    const cx = ease(p.id, p.x, 0).x * size;
    const cy = DODGE_PLAYER_Y * size;
    ctx.globalAlpha = p.alive ? 0.92 : 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = user?.avatarColor ?? '#8b5cf6';
    ctx.fill();
    if (p.id === me) {
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
  if (snapshot.phase !== 'lobby') drawText(ctx, t('spin.lobby.dodge.meters', { n: snapshot.meters }), size - size * 0.03, size * 0.05, size * 0.045, color('--text', '#fff'), 'right');
  if (snapshot.phase === 'countdown') {
    drawText(ctx, t('spin.lobby.dodge.countdown', { n: Math.max(1, Math.ceil(snapshot.timerMs / 1000)) }), size * 0.4, size * 0.05, size * 0.055, gold);
  } else if (snapshot.phase === 'over') {
    const winner = snapshot.winnerId ? users.get(snapshot.winnerId)?.displayName ?? '?' : null;
    const text = winner ? t('spin.lobby.dodge.winner', { name: winner }) : snapshot.players.length > 1 ? t('spin.lobby.dodge.draw') : t('spin.lobby.dodge.soloOver', { n: snapshot.players[0]?.meters ?? 0 });
    drawText(ctx, text, size * 0.4, size * 0.05, size * 0.05, gold);
  } else if (snapshot.phase === 'playing' && mine && !mine.alive) {
    drawText(ctx, t('spin.lobby.dodge.out'), size * 0.4, size * 0.05, size * 0.045, color('--text', '#fff'));
  }
}

export const dodgeView: LobbyGameView<DodgeSnapshot> = {
  // Just left and right.
  pad: 'leftRight',
  actions: [],
  hintKey: 'spin.lobby.dodge.hint',
  draw,
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
