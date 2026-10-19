import type { SumoSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, groundShadow, renderScene, roundRect, type Scene, type SceneGame } from './kit';

// Where things are on the arena, as fractions of its side: one platform across the middle, over a drop.
const PLATFORM_Y = 0.62;
const PLATFORM_H = 0.045;
/** Size of a wrestler (drawing only). */
const RX = 0.024;
const RY = 0.05;
/** A shove reaches this far in front (SHOVE_RANGE in the rules), and is drawn as a puff that far out. */
const SHOVE_RANGE = 0.09;
const SHOVE_SHOW_MS = 250;
/** The platform's starting ends (START_L and START_R in the rules), shown faintly so you can see it close in. */
const START_L = 0.1;
const START_R = 0.9;
/** A fallen wrestler drops off the platform for this long, then bursts at the bottom of the arena. */
const FALL_S = 0.7;
const FALL_BOTTOM = 0.97;
/** Where each wrestler who has fallen was when they went, and when (`performance.now()`), by run and id. */
const falls = new Map<string, { x: number; at: number }>();

function drawWorld(sc: Scene<SumoSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  const { l, r } = snapshot.platform;
  const top = PLATFORM_Y * S;

  // The drop under the platform: darker the further down, so it reads as a long way to fall.
  const drop = ctx.createLinearGradient(0, top, 0, S);
  drop.addColorStop(0, 'oklch(0.18 0.01 55 / 0)');
  drop.addColorStop(1, 'oklch(0.1 0.01 55 / 0.7)');
  ctx.fillStyle = drop;
  ctx.fillRect(0, top, S, S - top);

  // Where the platform started, faint, and the platform now.
  ctx.fillStyle = 'oklch(1 0 0 / 0.05)';
  ctx.fillRect(START_L * S, top, (START_R - START_L) * S, PLATFORM_H * S);
  roundRect(ctx, l * S, top, (r - l) * S, PLATFORM_H * S, PLATFORM_H * S * 0.3);
  ctx.fillStyle = STAGE.ground;
  ctx.fill();
  ctx.strokeStyle = STAGE.groundLine;
  ctx.lineWidth = 2;
  ctx.stroke();
  // The ends flash red once it is small, as a warning that it is nearly gone.
  const narrow = Math.max(0, 1 - (r - l - 0.24) / 0.2);
  if (narrow > 0) {
    ctx.fillStyle = theme.danger;
    ctx.globalAlpha = 0.5 * narrow;
    ctx.fillRect(l * S, top, S * 0.01, PLATFORM_H * S);
    ctx.fillRect(r * S - S * 0.01, top, S * 0.01, PLATFORM_H * S);
    ctx.globalAlpha = 1;
  }

  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) {
      // Fallen: they drop away, then the burst at the bottom takes them.
      if (snapshot.phase === 'playing') {
        const key = `${snapshot.run}:${p.id}`;
        if (!falls.has(key)) falls.set(key, { x: p.x, at: sc.now });
        const f = falls.get(key)!;
        const t = (sc.now - f.at) / 1000;
        if (t < FALL_S) {
          const y = (PLATFORM_Y - RY) + (FALL_BOTTOM - PLATFORM_Y + RY) * (t / FALL_S) ** 2;
          sc.drawPlayer(p.id, f.x * S, y * S, RX * S, RY * S);
        }
      }
      continue;
    }
    const cx = sc.ease(p.id, p.x, 0).x * S;
    const ry = RY * S;
    const cy = top - ry;
    groundShadow(ctx, cx, top, RX * S);

    // A shove: a puff in front of them that fades, as far as it reaches.
    if (p.shoveMs > 0) {
      const t = p.shoveMs / SHOVE_SHOW_MS;
      ctx.save();
      ctx.globalAlpha = 0.6 * t;
      ctx.fillStyle = theme.acc;
      ctx.beginPath();
      ctx.ellipse(cx + p.face * SHOVE_RANGE * S * 0.5, cy, SHOVE_RANGE * S * 0.5 * (1.2 - 0.4 * t), ry * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    sc.drawPlayer(p.id, cx, cy, RX * S, ry);
    // A small chevron on the side they face, so you can tell which way a shove would go.
    ctx.fillStyle = theme.text;
    ctx.beginPath();
    ctx.moveTo(cx + p.face * RX * S * 1.9, cy);
    ctx.lineTo(cx + p.face * RX * S * 1.2, cy - S * 0.012);
    ctx.lineTo(cx + p.face * RX * S * 1.2, cy + S * 0.012);
    ctx.closePath();
    ctx.fill();

    // The wait before the next shove, as a bar under the feet.
    if (p.cooldownMs > 0) {
      const w = RX * S * 2;
      ctx.fillStyle = 'oklch(1 0 0 / 0.15)';
      ctx.fillRect(cx - w / 2, top + PLATFORM_H * S + S * 0.008, w, S * 0.006);
      ctx.fillStyle = theme.acc;
      ctx.fillRect(cx - w / 2, top + PLATFORM_H * S + S * 0.008, w * (1 - p.cooldownMs / 700), S * 0.006);
    }
  }
}

const scene: SceneGame<SumoSnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: FALL_BOTTOM, delayS: FALL_S }),
};

export const sumoView: LobbyGameView<SumoSnapshot> = {
  // Left and right to walk, plus one Shove button (Space or Up).
  pad: 'leftRight',
  actions: [{ name: 'shove', labelKey: 'spin.lobby.sumo.shove', keys: [' ', 'ArrowUp', 'w'] }],
  nameKey: 'spin.lobby.sumo.name',
  taglineKey: 'spin.lobby.sumo.tagline',
  hintKey: 'spin.lobby.sumo.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
