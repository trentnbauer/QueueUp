import { COINS_ITEM_SIZE, COINS_PLAYER_WIDTH, COINS_PLAYER_Y, type CoinsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, drawFloor, groundShadow, renderScene, type Scene, type SceneGame } from './kit';

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

function drawWorld(sc: Scene<CoinsSnapshot>): void {
  const { ctx, S, snapshot, drift, now } = sc;
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
    const cx = sc.ease(p.id, p.x, 0).x * S;
    groundShadow(ctx, cx, floor, radius * 0.7);
    sc.drawPlayer(p.id, cx, cy, radius * 0.6, radius * 0.6);
    // Their coin count over their head: it is a race, so everyone's score is on screen.
    ctx.font = `700 ${Math.round(S * 0.028)}px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = sc.theme.text;
    ctx.fillText(String(p.meters), cx, cy - radius * 0.75);
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
