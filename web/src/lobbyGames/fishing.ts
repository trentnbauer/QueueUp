import type { FishingSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** The pond runs from the surface (just under the heads-up display) to the bottom of the arena; the rules' 0..1 depth maps onto it. */
const POND_TOP = 0.13;
const POND_BOTTOM = 0.96;
const pondY = (y: number) => POND_TOP + y * (POND_BOTTOM - POND_TOP);
/** The fish's own range, the same as the rules' (so the drawing never carries it out of the water while it is carried on between snapshots). */
const FISH_MIN = 0.08;
const FISH_MAX = 0.92;

function drawPond(sc: Scene<FishingSnapshot>): void {
  const { ctx, S, now } = sc;
  const top = POND_TOP * S;
  const water = ctx.createLinearGradient(0, top, 0, S);
  water.addColorStop(0, 'oklch(0.36 0.07 215 / 0.8)');
  water.addColorStop(1, 'oklch(0.2 0.05 240 / 0.9)');
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.moveTo(0, S);
  for (let x = 0; x <= S; x += S / 24) ctx.lineTo(x, top + Math.sin((x / S) * 12 + now / 600) * S * 0.004);
  ctx.lineTo(S, S);
  ctx.closePath();
  ctx.fill();
  // A bright line along the surface.
  ctx.strokeStyle = 'oklch(0.85 0.08 210 / 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= S; x += S / 24) {
    const y = top + Math.sin((x / S) * 12 + now / 600) * S * 0.004;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** The fish: an orange body with a wagging tail and an eye, swimming a little from side to side as it thrashes. */
function drawFish(sc: Scene<FishingSnapshot>, y: number): void {
  const { ctx, S, now, theme } = sc;
  const cx = (0.5 + Math.sin(now / 520) * 0.06) * S;
  const cy = pondY(y) * S;
  const rx = S * 0.065;
  const ry = S * 0.032;
  const wag = Math.sin(now / 90) * ry * 0.5;
  ctx.save();
  ctx.shadowColor = 'oklch(0.75 0.17 60 / 0.6)';
  ctx.shadowBlur = S * 0.03;
  ctx.fillStyle = 'oklch(0.72 0.17 55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.85, cy);
  ctx.lineTo(cx - rx * 1.6, cy - ry * 0.9 + wag);
  ctx.lineTo(cx - rx * 1.6, cy + ry * 0.9 + wag);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'oklch(0.85 0.12 70 / 0.7)';
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.1, cy + ry * 0.35, rx * 0.6, ry * 0.4, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = theme.text;
  ctx.beginPath();
  ctx.arc(cx + rx * 0.55, cy - ry * 0.2, ry * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = STAGE.ink;
  ctx.beginPath();
  ctx.arc(cx + rx * 0.6, cy - ry * 0.2, ry * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawWorld(sc: Scene<FishingSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  const age = snapshot.phase === 'playing' ? sc.fx.age(snapshot, now) : 0;
  const fishY = Math.min(FISH_MAX, Math.max(FISH_MIN, snapshot.fish.y + snapshot.fish.vy * age));
  drawPond(sc);

  const n = Math.max(1, snapshot.players.length);
  const netH = snapshot.half * 2 * (POND_BOTTOM - POND_TOP) * S;
  // Nets first, so the fish swims in front of them; everyone's net crosses the whole pond, at their own height.
  for (const i of sc.order()) {
    const c = snapshot.players[i];
    if (!c.alive) continue; // line snapped: the burst has taken them
    const mine = c.id === sc.me;
    const who = sc.info(c.id);
    // Eased in the pond's own depth, plus how far it has moved since the snapshot.
    const y = Math.min(0.96, Math.max(0.04, sc.ease(`${c.id}:y`, 0, c.y).y + c.vy * age));
    const cy = pondY(y) * S;
    const holding = Math.abs(fishY - y) <= snapshot.half;
    ctx.save();
    ctx.globalAlpha = (holding ? 0.34 : 0.16) * (mine ? 1.3 : 1);
    ctx.fillStyle = who.color;
    ctx.fillRect(0, cy - netH / 2, S, netH);
    ctx.restore();
    ctx.fillStyle = who.color;
    ctx.globalAlpha = mine ? 0.9 : 0.5;
    ctx.fillRect(0, cy - netH / 2, S, mine ? 2 : 1);
    ctx.fillRect(0, cy + netH / 2 - 1, S, mine ? 2 : 1);
    ctx.globalAlpha = 1;
  }

  drawFish(sc, fishY);

  const r = S * 0.034;
  for (const i of sc.order()) {
    const c = snapshot.players[i];
    if (!c.alive) continue;
    const who = sc.info(c.id);
    const x = ((i + 0.5) / n) * 0.84 * S + S * 0.08;
    const y = Math.min(0.96, Math.max(0.04, sc.ease(`${c.id}:y`, 0, c.y).y + c.vy * age));
    const cy = pondY(y) * S;
    // The line from the surface down to the angler's net.
    ctx.strokeStyle = who.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = c.id === sc.me ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, POND_TOP * S);
    ctx.lineTo(x, cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    sc.drawPlayer(c.id, x, cy, r, r);
    // Under the avatar: the line's health (red when it is close to snapping), a thin bar for how near the fish is to landing, and their count.
    const bw = S * 0.1;
    const bx = x - bw / 2;
    const by = cy + r + S * 0.012;
    const bar = (top: number, height: number, fraction: number, fill: string) => {
      ctx.fillStyle = STAGE.hudFill;
      roundRect(ctx, bx, top, bw, height, height / 2);
      ctx.fill();
      ctx.fillStyle = fill;
      roundRect(ctx, bx, top, Math.max(height, bw * fraction), height, height / 2);
      ctx.fill();
    };
    bar(by, S * 0.012, c.health, c.health < 0.25 ? theme.danger : theme.mint);
    bar(by + S * 0.016, S * 0.007, c.catch, theme.acc);
    ctx.font = `700 ${Math.round(S * 0.024)}px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.text;
    ctx.fillText(String(c.landed), x, by + S * 0.05);
  }
}

const scene: SceneGame<FishingSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => {
    const n = Math.max(1, snapshot.players.length);
    return { x: ((index + 0.5) / n) * 0.84 + 0.08, y: pondY(snapshot.players[index].y) };
  },
};

export const fishingView: LobbyGameView<FishingSnapshot> = {
  // One held button: Reel (Space or Up) pulls your net up, and letting go lets it sink. Pressing and holding the arena works too.
  pad: 'none',
  holds: [{ labelKey: 'spin.lobby.fishing.reel', dx: 0, dy: -1, keys: [' ', 'ArrowUp', 'w'], primary: true }],
  actions: [],
  tapHold: [0, -1],
  nameKey: 'spin.lobby.fishing.name',
  taglineKey: 'spin.lobby.fishing.tagline',
  hintKey: 'spin.lobby.fishing.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
