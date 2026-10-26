import type { TiltSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, STRIP_R, STRIP_Y, drawStandings, drawTimer, renderScene, roundRect, type Scene, type SceneGame } from './kit';

// The one beam across the middle; everyone's pushes and points are in the standings strip at the top.
const BEAM_X = 0.08;
const BEAM_W = 0.84;
const BEAM_Y = 0.5;
const BEAM_H = 0.03;
const BALL_R = 0.032;
const LEAN = 0.12;
const TARGET_LIFE_MS = 7000;
const HIT = 0.05;
const FALL_S = 0.8;
const FALL_BOTTOM = 1.02;
const drops = new Map<string, number>();

/** A small arrow beside a strip avatar for the way that person is pushing. */
function pushArrow(sc: Scene<TiltSnapshot>, cx: number, cy: number, dir: number): void {
  const { ctx, S, theme } = sc;
  const ax = cx + dir * STRIP_R * S * 1.7;
  ctx.fillStyle = theme.acc;
  ctx.beginPath();
  ctx.moveTo(ax + dir * S * 0.014, cy);
  ctx.lineTo(ax - dir * S * 0.008, cy - S * 0.012);
  ctx.lineTo(ax - dir * S * 0.008, cy + S * 0.012);
  ctx.closePath();
  ctx.fill();
}

function drawWorld(sc: Scene<TiltSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;

  drawTimer(sc, snapshot.phase === 'playing' && snapshot.limitMs > 0 ? snapshot.roundLeftMs / snapshot.limitMs : null);
  drawStandings(sc, {
    badge: (p) => (p.fell || !p.alive ? 'no' : null),
    under: (p, cx) => {
      if (p.alive && p.dir !== 0) pushArrow(sc, cx, STRIP_Y * S, p.dir);
    },
  });

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
    const fade = Math.min(1, t.leftMs / 1000);
    ctx.globalAlpha = (0.4 + 0.6 * Math.min(1, t.leftMs / TARGET_LIFE_MS)) * (t.leftMs < 1500 ? 0.6 + 0.4 * Math.sin(now / 60) : 1) * (0.5 + 0.5 * fade);
    ctx.fillStyle = theme.mint;
    roundRect(ctx, along(t.x) - HIT * S, -bh * 0.5, HIT * 2 * S, bh * 1.5, bh * 0.4);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Every ball is a player, drawn by the kit: the viewer gets the accent ring and the YOU tag.
  const falling: { id: string; x: number; y: number }[] = [];
  const radius = BALL_R * S * (snapshot.players.length > 6 ? 0.7 : 1);
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (p.fell) {
      if (snapshot.phase !== 'playing') continue;
      const key = `${snapshot.run}:${p.id}`;
      if (!drops.has(key)) drops.set(key, now);
      const t = (now - (drops.get(key) ?? now)) / 1000;
      if (t < FALL_S) {
        const side = p.x < 0.5 ? -1 : 1;
        const ly = -BALL_R * S;
        const sx = S / 2 + ((side * bw) / 2) * Math.cos(angle) - ly * Math.sin(angle);
        const sy = BEAM_Y * S + ((side * bw) / 2) * Math.sin(angle) + ly * Math.cos(angle);
        falling.push({ id: p.id, x: sx + side * t * S * 0.08, y: sy + (FALL_BOTTOM * S - sy) * (t / FALL_S) ** 2 });
      }
      continue;
    }
    if (!p.alive) continue;
    sc.drawPlayer(p.id, along(sc.ease(`ball:${p.id}`, p.x, 0).x), -radius, radius, radius);
  }
  ctx.restore();
  for (const f of falling) sc.drawPlayer(f.id, f.x, f.y, radius, radius, { tag: false });
}

const scene: SceneGame<TiltSnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x < 0.5 ? BEAM_X - 0.04 : BEAM_X + BEAM_W + 0.04, y: FALL_BOTTOM - 0.03, delayS: FALL_S }),
};

export const tiltView: LobbyGameView<TiltSnapshot> = {
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.tilt.name',
  taglineKey: 'spin.lobby.tilt.tagline',
  hintKey: 'spin.lobby.tilt.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
