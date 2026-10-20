import { PARACHUTE_PLAYER_H, PARACHUTE_PLAYER_W, PARACHUTE_ROW_H, type ParachuteSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { coverTile, hueOf, renderScene, roundRect, type Scene, type SceneGame } from './kit';

function drawWorld(sc: Scene<ParachuteSnapshot>): void {
  const { ctx, S, snapshot, drift, theme, now } = sc;
  // Between snapshots the course carries on coming up the screen at the speed it was going.
  const up = drift;

  // Gusts: soft bands with chevrons streaming the way they push.
  for (const g of snapshot.gusts) {
    const y = (g.y - up) * S;
    const h = S * 0.3;
    if (y < -h || y > S + h) continue;
    ctx.fillStyle = 'oklch(0.82 0.12 220 / 0.1)';
    ctx.fillRect(0, y - h / 2, S, h);
    ctx.strokeStyle = 'oklch(0.9 0.08 220 / 0.35)';
    ctx.lineWidth = 2;
    const slide = ((now / 700) * g.push) % 1;
    for (let row = 0; row < 3; row++) {
      for (let i = -1; i < 7; i++) {
        const x = ((i + slide + row * 0.37) / 6) * S;
        const cy = y + (row - 1) * h * 0.28;
        ctx.beginPath();
        ctx.moveTo(x - g.push * S * 0.012, cy - S * 0.012);
        ctx.lineTo(x + g.push * S * 0.012, cy);
        ctx.lineTo(x - g.push * S * 0.012, cy + S * 0.012);
        ctx.stroke();
      }
    }
  }

  // Rows of clouds, with a gap: a fluffy bank either side, ending in a game cover at the edge of the gap.
  const h = PARACHUTE_ROW_H * S;
  for (const row of snapshot.rows) {
    const y = (row.y - up) * S;
    if (y < -h || y > S + h) continue;
    const left = (row.gap - row.width / 2) * S;
    const right = (row.gap + row.width / 2) * S;
    ctx.fillStyle = 'oklch(0.9 0.02 240 / 0.8)';
    for (const [from, to] of [[0, left], [right, S]]) {
      roundRect(ctx, from, y - h / 2, to - from, h, h / 2);
      ctx.fill();
      for (let x = from + h * 0.6; x < to - h * 0.3; x += h * 1.1) {
        ctx.beginPath();
        ctx.arc(x, y - h * 0.35, h * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const post = S * 0.03;
    coverTile(ctx, left - post, y - h / 2, post, h, hueOf(row.n), S * 0.008);
    coverTile(ctx, right, y - h / 2, post, h, hueOf(row.n), S * 0.008);
  }

  const w = PARACHUTE_PLAYER_W * S;
  const r = w / 2;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const x = sc.ease(p.id, p.x, p.y).x * S;
    const y = p.y * S;
    // The chute: a canopy over the skydiver when open, folded away when shut.
    if (p.open) {
      ctx.fillStyle = sc.info(p.id).color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x, y - PARACHUTE_PLAYER_H * S * 0.6, r * 1.9, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - r * 1.9, y - PARACHUTE_PLAYER_H * S * 0.6);
      ctx.lineTo(x - r * 0.3, y - r * 0.4);
      ctx.moveTo(x + r * 1.9, y - PARACHUTE_PLAYER_H * S * 0.6);
      ctx.lineTo(x + r * 0.3, y - r * 0.4);
      ctx.stroke();
    }
    sc.drawPlayer(p.id, x, y, r, r);
  }
}

const scene: SceneGame<ParachuteSnapshot> = {
  // The sky rushes up past you.
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: snapshot.players[index].y }),
};

export const parachuteView: LobbyGameView<ParachuteSnapshot> = {
  // Left and right to slide, and hold the chute (Space or Up, or press and hold the arena) to float.
  pad: 'leftRight',
  holds: [{ labelKey: 'spin.lobby.parachute.chute', dx: 0, dy: -1, keys: [' ', 'ArrowUp', 'w'], primary: true }],
  actions: [],
  tapHold: [0, -1],
  nameKey: 'spin.lobby.parachute.name',
  taglineKey: 'spin.lobby.parachute.tagline',
  hintKey: 'spin.lobby.parachute.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
