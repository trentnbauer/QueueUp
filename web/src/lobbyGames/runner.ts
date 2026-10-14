import { RUNNER_X, type RunnerSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, courseOffset, coverTile, drawFloor, groundShadow, hueOf, renderScene, roundRect, type Scene, type SceneGame } from './kit';

// Mirrors the server's sizes (packages/shared/src/lobbyGames/runner.ts), so what is drawn is what is hit.
const STAND_HEIGHT = 0.45;
const DUCK_HEIGHT = 0.25;
const CACTUS = { width: 0.1, height: 0.35 };
const LOG = { width: 0.3, height: 0.35 };
const BIRD = { from: 0.3, to: 0.7 };

/** Where the ground is, as a fraction of the arena, and how tall a jump "lane height" is. */
const GROUND = 0.82;
const UNIT = 0.5;
/** Runners share one spot on the track, so they are fanned out a little (drawing only). */
const FAN = 0.022;

function bodyHeight(ducking: boolean): number {
  return (ducking ? DUCK_HEIGHT : STAND_HEIGHT) * UNIT;
}

function drawWorld(sc: Scene<RunnerSnapshot>): void {
  const { ctx, S, snapshot, theme, now, drift } = sc;
  const unit = S * UNIT;
  const ground = S * GROUND;

  drawFloor(sc, ground);
  // Ground texture that moves with the course: pale ticks and a row of accent dashes.
  const tick = S * 0.08;
  // Both rows move left at exactly the course's speed, the same as the obstacles, whatever their spacing.
  ctx.fillStyle = STAGE.groundTick;
  for (let x = -courseOffset(sc, tick); x < S; x += tick) ctx.fillRect(x, ground + S * 0.04, tick * 0.4, 2);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = theme.acc;
  for (let x = -courseOffset(sc, tick * 2); x < S; x += tick * 2) ctx.fillRect(x, ground + S * 0.09, tick * 0.15, 2);
  ctx.restore();

  for (const o of snapshot.obstacles) {
    const cx = (o.x - drift) * S;
    const hue = hueOf(o.n);
    if (o.kind === 'cactus') {
      // A game cover standing on the ground, with two lines of "title" at the bottom.
      const w = CACTUS.width * S;
      const h = CACTUS.height * unit;
      groundShadow(ctx, cx, ground, w * 0.6);
      coverTile(ctx, cx - w / 2, ground - h, w, h, hue, S * 0.022, true);
      ctx.fillStyle = 'oklch(1 0 0 / 0.7)';
      roundRect(ctx, cx - w * 0.32, ground - h * 0.16, w * 0.5, Math.max(2, S * 0.007), 2);
      ctx.fill();
      ctx.fillStyle = 'oklch(1 0 0 / 0.35)';
      roundRect(ctx, cx - w * 0.32, ground - h * 0.09, w * 0.3, Math.max(2, S * 0.006), 2);
      ctx.fill();
    } else if (o.kind === 'log') {
      // A wide, low stack of covers: a held jump to clear it.
      const w = LOG.width * S;
      const h = LOG.height * unit;
      groundShadow(ctx, cx, ground, w * 0.55);
      coverTile(ctx, cx - w / 2, ground - h, w, h, hue, S * 0.022, true);
      ctx.strokeStyle = 'oklch(1 0 0 / 0.12)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - w / 2 + (w * k) / 3, ground - h + 3);
        ctx.lineTo(cx - w / 2 + (w * k) / 3, ground - 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'oklch(1 0 0 / 0.55)';
      roundRect(ctx, cx - w * 0.4, ground - h * 0.14, w * 0.36, Math.max(2, S * 0.007), 2);
      ctx.fill();
    } else {
      // A 😴 vote flying in (the bottom of the app's five-emoji vote scale): duck under it.
      const d = 0.18 * S;
      const bob = Math.sin(now / 180 + o.n) * S * 0.006;
      const cy = ground - ((BIRD.from + BIRD.to) / 2) * unit + bob;
      ctx.fillStyle = 'oklch(1 0 0 / 0.08)';
      for (let k = 0; k < 3; k++) {
        roundRect(ctx, cx + d * 0.55 + k * S * 0.012, cy - d * 0.25 + k * d * 0.25, S * (0.05 - k * 0.012), 2, 1);
        ctx.fill();
      }
      ctx.save();
      ctx.shadowColor = 'oklch(0 0 0 / 0.4)';
      ctx.shadowBlur = S * 0.03;
      ctx.shadowOffsetY = S * 0.01;
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.fillStyle = sc.color('--surf2', 'oklch(0.25 0.01 55)');
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `${Math.round(d * 0.55)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",${FONT.ui}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('😴', cx, cy + d * 0.04);
    }
  }

  const n = snapshot.players.length;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // knocked out: the burst has taken them
    const lift = sc.ease(p.id, 0, p.h).y;
    const ry = (bodyHeight(p.ducking) * S) / 2;
    const rx = (p.ducking ? 0.05 : 0.04) * S;
    const cx = (RUNNER_X + (i - (n - 1) / 2) * FAN) * S;
    groundShadow(ctx, cx, ground, rx, Math.max(0.2, 1 - lift));
    sc.drawPlayer(p.id, cx, ground - lift * unit - ry, rx, ry);
  }
}

const scene: SceneGame<RunnerSnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => {
    const p = snapshot.players[index];
    const n = snapshot.players.length;
    return { x: RUNNER_X + (index - (n - 1) / 2) * FAN, y: GROUND - p.h * UNIT - bodyHeight(p.ducking) / 2 };
  },
};

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
  nameKey: 'spin.lobby.runner.name',
  taglineKey: 'spin.lobby.runner.tagline',
  hintKey: 'spin.lobby.runner.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
