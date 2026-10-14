import type { RedLightSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, groundShadow, renderScene, type Scene, type SceneGame } from './kit';

/** Where the track starts and finishes across the arena, as fractions of its width. */
const START = 0.08;
const FINISH = 0.9;
/** The lanes fill this band of the arena's height. */
const LANES_TOP = 0.3;
const LANES_BOTTOM = 0.92;
const MAX_RADIUS = 0.05;

/** The lane's middle, as a fraction of the height, for runner number `i` of `n`. */
function laneY(i: number, n: number): number {
  return LANES_TOP + ((i + 0.5) / n) * (LANES_BOTTOM - LANES_TOP);
}

function radiusFor(n: number): number {
  return Math.min(MAX_RADIUS, ((LANES_BOTTOM - LANES_TOP) / n) * 0.42);
}

function drawWorld(sc: Scene<RedLightSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  const n = snapshot.players.length;

  // The light: a big lamp at the top that is green, flashes amber as a warning, then red.
  const lamp = snapshot.light === 'red' ? theme.danger : snapshot.light === 'warn' ? theme.star : theme.mint;
  const flash = snapshot.light === 'warn' ? 0.5 + 0.5 * Math.sin(now / 60) : 1;
  const lx = S / 2;
  const ly = S * 0.17;
  const lr = S * 0.07;
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.75 * flash;
  ctx.fillStyle = lamp;
  ctx.shadowColor = lamp;
  ctx.shadowBlur = S * 0.05;
  ctx.beginPath();
  ctx.arc(lx, ly, lr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lx, ly, lr * 1.15, 0, Math.PI * 2);
  ctx.stroke();

  // Lane lines, the start and a chequered finish line.
  ctx.strokeStyle = STAGE.edge;
  ctx.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    const y = (LANES_TOP + (i / n) * (LANES_BOTTOM - LANES_TOP)) * S;
    ctx.beginPath();
    ctx.moveTo(START * S, y);
    ctx.lineTo(FINISH * S, y);
    ctx.stroke();
  }
  const fx = FINISH * S;
  const top = LANES_TOP * S;
  const height = (LANES_BOTTOM - LANES_TOP) * S;
  const cell = S * 0.02;
  for (let y = 0; y < height; y += cell) {
    ctx.fillStyle = Math.floor(y / cell) % 2 ? 'oklch(1 0 0 / 0.85)' : 'oklch(0.2 0 0 / 0.85)';
    ctx.fillRect(fx, top + y, cell, Math.min(cell, height - y));
  }

  const radius = radiusFor(n) * S;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // caught: the burst has taken them
    const cx = (START + sc.ease(p.id, p.x, 0).x * (FINISH - START)) * S;
    // A little bounce while running.
    const bounce = p.running ? Math.abs(Math.sin(now / 90)) * radius * 0.25 : 0;
    const cy = laneY(i, n) * S - bounce;
    groundShadow(ctx, cx, laneY(i, n) * S + radius, radius, 0.8);
    sc.drawPlayer(p.id, cx, cy, radius, radius);
  }
}

const scene: SceneGame<RedLightSnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => ({ x: START + snapshot.players[index].x * (FINISH - START), y: laneY(index, snapshot.players.length) }),
};

export const redLightView: LobbyGameView<RedLightSnapshot> = {
  // One button, held down to run: Space, Right or D, or hold anywhere on the arena.
  pad: 'none',
  holds: [{ labelKey: 'spin.lobby.redlight.run', dx: 1, dy: 0, keys: [' ', 'ArrowRight', 'd'], primary: true }],
  actions: [],
  tapHold: [1, 0],
  nameKey: 'spin.lobby.redlight.name',
  taglineKey: 'spin.lobby.redlight.tagline',
  hintKey: 'spin.lobby.redlight.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
