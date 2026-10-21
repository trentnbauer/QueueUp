import { COINS_HP_MAX, COINS_ITEM_SIZE, COINS_PLAYER_SPEED, COINS_PLAYER_WIDTH, COINS_PLAYER_Y, type CoinsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, drawFloor, groundShadow, renderScene, roundRect, rememberSnapshot, type Scene, type SceneGame } from './kit';

/** Where the floor is, just under the catchers. */
const FLOOR = 0.95;
/** The round-timer bar along the top edge. */
const BAR_H = 0.008;

/** A coin: a gold disc with a rim and a shine. `spin` squeezes it sideways so it turns as it falls. */
function drawCoin(sc: Scene<CoinsSnapshot>, cx: number, cy: number, r: number, spin: number): void {
  const { ctx } = sc;
  const w = r * (0.35 + 0.65 * Math.abs(Math.cos(spin)));
  ctx.fillStyle = sc.theme.star;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = 'oklch(0.2 0.02 70 / 0.55)';
  ctx.stroke();
  ctx.fillStyle = 'oklch(1 0 0 / 0.5)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.3, cy - r * 0.3, w * 0.22, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A bomb: a dark ball with a fuse and a spark. */
function drawBomb(sc: Scene<CoinsSnapshot>, cx: number, cy: number, r: number): void {
  const { ctx } = sc;
  ctx.fillStyle = 'oklch(0.22 0.01 280)';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.1, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.strokeStyle = sc.theme.danger;
  ctx.stroke();
  ctx.strokeStyle = 'oklch(0.7 0.02 70)';
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.35, cy - r * 0.7);
  ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 1.2, cx + r * 0.9, cy - r * 1.0);
  ctx.stroke();
  const flicker = 0.7 + 0.3 * Math.sin(sc.now / 50);
  ctx.fillStyle = sc.theme.danger;
  ctx.beginPath();
  ctx.arc(cx + r * 0.9, cy - r * 1.0, r * 0.22 * flicker, 0, Math.PI * 2);
  ctx.fill();
}

/** The coins in the air as of the last snapshot drawn. */
const previousCoins = rememberSnapshot<Map<number, { x: number; y: number; kind: string }>>();

/** A coin that disappears while it is down at the catchers, next to one of them, was caught: a tiny gold puff. (One that falls past is not.) */
function celebrate(sc: Scene<CoinsSnapshot>): void {
  const { snapshot } = sc;
  const before = previousCoins(snapshot, () => new Map(snapshot.items.map((i) => [i.n, { x: i.x, y: i.y, kind: i.kind }])));
  if (!before) return;
  const still = new Set(snapshot.items.map((i) => i.n));
  for (const [n, c] of before) {
    if (still.has(n) || c.kind !== 'coin' || Math.abs(c.y - COINS_PLAYER_Y) > 0.08) continue;
    if (snapshot.players.some((p) => p.alive && Math.abs(p.x - c.x) < COINS_PLAYER_WIDTH)) sc.fx.confettiAt(c.x, c.y, 'oklch(0.83 0.15 85)', 6);
  }
}

/** Where your own catcher is drawn, kept between frames: it slides the moment you press (the server only hears about it a moment later) and is
 * pulled back toward where the server says it is, so the two never drift far apart. */
const predicted = new WeakMap<object, { x: number; at: number }>();

function drawWorld(sc: Scene<CoinsSnapshot>): void {
  const { ctx, S, snapshot, drift, now } = sc;
  celebrate(sc);
  const floor = S * FLOOR;
  drawFloor(sc, floor);

  // Time left in the round, as a bar draining along the top edge.
  if (snapshot.phase === 'playing' && snapshot.limitMs > 0) {
    const left = Math.max(0, snapshot.roundLeftMs / snapshot.limitMs);
    ctx.fillStyle = sc.theme.acc;
    ctx.fillRect(0, 0, S * left, S * BAR_H);
  }

  const r = (COINS_ITEM_SIZE * S) / 2;
  for (const item of snapshot.items) {
    const cx = item.x * S;
    const cy = (item.y + drift) * S;
    if (item.kind === 'coin') drawCoin(sc, cx, cy, r, now / 160 + item.n);
    else drawBomb(sc, cx, cy, r);
  }

  const radius = (COINS_PLAYER_WIDTH * S) / 2;
  const cy = COINS_PLAYER_Y * S;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // watching until the next round
    // Between snapshots (about 15 a second) everyone keeps sliding the way they are holding; the viewer's own catcher answers the
    // press at once instead of a round trip later.
    const half = COINS_PLAYER_WIDTH / 2;
    const clampX = (x: number) => Math.min(1 - half, Math.max(half, x));
    let x = sc.ease(p.id, clampX(p.x + p.dir * COINS_PLAYER_SPEED * sc.fx.age(snapshot, now)), 0).x;
    if (p.id === sc.me && snapshot.phase === 'playing') {
      const last = predicted.get(sc.fx) ?? { x, at: now };
      const dt = Math.min(0.1, (now - last.at) / 1000);
      x = clampX(last.x + sc.held.dx * COINS_PLAYER_SPEED * dt);
      x += (clampX(p.x + p.dir * COINS_PLAYER_SPEED * sc.fx.age(snapshot, now)) - x) * Math.min(1, dt * 6);
      predicted.set(sc.fx, { x, at: now });
    }
    const cx = x * S;
    groundShadow(ctx, cx, floor, radius * 0.7);
    sc.drawPlayer(p.id, cx, cy, radius * 0.6, radius * 0.6);
    // Their coin count over their head: it is a race, so everyone's score is on screen.
    ctx.font = `700 ${Math.round(S * 0.028)}px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = sc.theme.text;
    ctx.fillText(String(p.meters), cx, cy - radius * 0.75);
    // Endless runs: the health bar over the count (it drains, and each coin refills a little). Red when low.
    if (p.hp !== null) {
      const bw = radius * 2.2;
      const bh = S * 0.01;
      const by = cy - radius * 0.75 - S * 0.06;
      const frac = Math.min(1, Math.max(0, p.hp / COINS_HP_MAX));
      ctx.fillStyle = STAGE.hudFill;
      roundRect(ctx, cx - bw / 2, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = frac < 0.3 ? sc.theme.danger : sc.theme.acc;
      roundRect(ctx, cx - bw / 2, by, Math.max(bh, bw * frac), bh, bh / 2);
      ctx.fill();
    }
  }
}

const scene: SceneGame<CoinsSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: COINS_PLAYER_Y }),
};

export const coinsView: LobbyGameView<CoinsSnapshot> = {
  // Just left and right.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.coins.name',
  taglineKey: 'spin.lobby.coins.tagline',
  hintKey: 'spin.lobby.coins.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
