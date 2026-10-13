import { TOTEM_CENTER, type TotemSnapshot } from '@queueup/shared';
import type { LobbyDrawArgs, LobbyGameView } from './index';

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string) {
  ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function draw({ ctx, size, snapshot, me, users, ease, color, t }: LobbyDrawArgs<TotemSnapshot>) {
  const centre = size * TOTEM_CENTER;
  const radius = Math.max(12, size * 0.045);

  // Water, then the totem on it.
  ctx.fillStyle = color('--bg', '#161210');
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(centre, centre, snapshot.radius * size, 0, Math.PI * 2);
  ctx.fillStyle = color('--surf2', '#2b2420');
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = snapshot.phase === 'playing' ? 'oklch(0.76 0.14 25)' : color('--chip', '#444');
  ctx.stroke();

  // Fallen players first (faded), then everyone standing on top.
  const ordered = [...snapshot.players].sort((a, b) => Number(a.alive) - Number(b.alive));
  for (const p of ordered) {
    const pos = ease(p.id, p.x, p.y);
    const px = pos.x * size;
    const py = pos.y * size;
    const user = users.get(p.id);
    ctx.globalAlpha = p.alive ? 1 : 0.3;

    // A swing: a ring that grows and fades for a moment after a punch.
    if (p.punchAgo < 250) {
      const k = p.punchAgo / 250;
      ctx.beginPath();
      ctx.arc(px, py, radius + k * size * 0.1, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = user?.avatarColor ?? '#8b5cf6';
    ctx.fill();
    if (p.id === me) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = color('--text', '#fff');
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(radius)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((user?.displayName ?? '?').slice(0, 1).toUpperCase(), px, py + 1);
    ctx.globalAlpha = 1;
  }

  // Messages over the arena.
  const mine = snapshot.players.find((p) => p.id === me);
  const gold = 'oklch(0.9 0.14 90)';
  if (snapshot.phase === 'countdown') {
    drawText(ctx, t('spin.lobby.totem.countdown', { n: Math.max(1, Math.ceil(snapshot.timerMs / 1000)) }), centre, size * 0.05, size * 0.055, gold);
  } else if (snapshot.phase === 'over') {
    const winner = snapshot.winnerId ? users.get(snapshot.winnerId)?.displayName ?? '?' : null;
    drawText(ctx, winner ? t('spin.lobby.totem.winner', { name: winner }) : t('spin.lobby.totem.draw'), centre, size * 0.05, size * 0.055, gold);
  } else if (snapshot.phase === 'lobby' && snapshot.players.length < 2) {
    drawText(ctx, t('spin.lobby.totem.alone'), centre, size * 0.05, size * 0.045, color('--text', '#fff'));
  } else if (snapshot.phase === 'playing' && mine && !mine.alive) {
    drawText(ctx, t('spin.lobby.totem.out'), centre, size * 0.05, size * 0.045, color('--text', '#fff'));
  }
}

export const totemView: LobbyGameView<TotemSnapshot> = {
  actions: [{ name: 'punch', labelKey: 'spin.lobby.totem.punch', key: ' ' }],
  hintKey: 'spin.lobby.totem.hint',
  draw,
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
