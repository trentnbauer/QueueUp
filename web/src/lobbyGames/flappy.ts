import { FLAPPY_BIRD_RADIUS, FLAPPY_GAP, FLAPPY_PIPE_WIDTH, FLAPPY_X, type FlappySnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, coverTile, drawFloor, hueOf, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** Birds share one spot on the screen, so they are fanned out a little (drawing only). */
const FAN = 0.007;
const FLOOR = 0.03;
const TRAIL = 10;

/** Each bird's last few positions, kept between frames for its trail. */
const trails = new WeakMap<object, Map<string, number[]>>();

function drawWorld(sc: Scene<FlappySnapshot>): void {
  const { ctx, S, snapshot, drift, now } = sc;
  // Heights are 0 (floor) to 1 (ceiling); the canvas counts down from the top.
  const py = (y: number) => S * (1 - y);
  drawFloor(sc, py(FLOOR));

  // Pipes: a column either side of the opening, each capped with a game cover.
  const pipeW = FLAPPY_PIPE_WIDTH * S;
  const capH = S * 0.051;
  for (const p of snapshot.pipes) {
    const x = (p.x - drift) * S - pipeW / 2;
    const top = py(p.gap + FLAPPY_GAP / 2);
    const bottom = py(p.gap - FLAPPY_GAP / 2);
    const column = (y0: number, y1: number) => {
      const g = ctx.createLinearGradient(x, 0, x + pipeW, 0);
      g.addColorStop(0, 'oklch(0.27 0.012 55)');
      g.addColorStop(1, 'oklch(0.21 0.009 55)');
      roundRect(ctx, x, y0, pipeW, y1 - y0, S * 0.02);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = STAGE.hudStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    column(-20, top);
    column(bottom, S + 20);
    const capW = pipeW * 1.25;
    const hue = hueOf(p.n);
    coverTile(ctx, x - (capW - pipeW) / 2, top - capH, capW, capH, hue, S * 0.016);
    coverTile(ctx, x - (capW - pipeW) / 2, bottom, capW, capH, (hue + 120) % 360, S * 0.016);
  }

  let memory = trails.get(sc.fx);
  if (!memory) trails.set(sc.fx, (memory = new Map()));
  const radius = FLAPPY_BIRD_RADIUS * S;
  const n = snapshot.players.length;
  for (const i of sc.order()) {
    const b = snapshot.players[i];
    if (!b.alive) {
      memory!.delete(b.id);
      continue; // knocked out: the burst has taken them
    }
    const cx = (FLAPPY_X + (i - (n - 1) / 2) * FAN) * S;
    const cy = py(sc.ease(b.id, 0, b.y).y);
    const trail = memory!.get(b.id) ?? [];
    memory!.set(b.id, trail);
    trail.push(cy);
    while (trail.length > TRAIL) trail.shift();

    // A trail of fading dots in the bird's colour.
    const color = sc.info(b.id).color;
    ctx.fillStyle = color;
    trail.forEach((y, k) => {
      ctx.globalAlpha = (k / trail.length) * 0.25;
      ctx.beginPath();
      ctx.arc(cx - (trail.length - k) * S * 0.012, y, radius * (0.3 + (0.5 * k) / trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // A wing that tilts with the climb, or beats gently while waiting.
    const wing = snapshot.phase === 'playing' ? Math.max(-1, Math.min(1, b.vy * 1.5)) : Math.sin(now / 120);
    ctx.fillStyle = 'oklch(1 0 0 / 0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.6, cy);
    ctx.lineTo(cx - radius * 1.5, cy - wing * radius * 0.9);
    ctx.lineTo(cx - radius * 0.2, cy + radius * 0.2);
    ctx.closePath();
    ctx.fill();
    sc.drawPlayer(b.id, cx, cy, radius, radius);
  }
}

const scene: SceneGame<FlappySnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => {
    const n = snapshot.players.length;
    return { x: FLAPPY_X + (index - (n - 1) / 2) * FAN, y: 1 - snapshot.players[index].y };
  },
};

export const flappyView: LobbyGameView<FlappySnapshot> = {
  // One button: Flap (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'flap', labelKey: 'spin.lobby.flappy.flap', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'flap',
  nameKey: 'spin.lobby.flappy.name',
  hintKey: 'spin.lobby.flappy.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
