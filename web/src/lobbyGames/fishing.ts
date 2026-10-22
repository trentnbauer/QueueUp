import { FISHING_TIERS, type FishingPlayer, type FishingSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, drawLives, renderScene, roundRect, rememberSnapshot, type Scene, type SceneGame } from './kit';

// Where things are, as fractions of the arena's side. These mirror the rules' (packages/shared/src/lobbyGames/fishing.ts): the pond fills the arena,
// the anglers stand along the bottom at the rod, and a cast goes up the pond.
const ROD_Y = 0.9;
const WATER_TOP = 0.09;
const SHORE_Y = 0.85;
/** How far up the pond a cast reaches at the weakest and the strongest power (the rules' CAST_MIN and CAST_MAX). */
const CAST_MIN = 0.1;
const CAST_MAX = 0.74;
/** The lure's size (the rules' LURE_R). */
const LURE_R = 0.03;
/** The reeling bar on the viewer's side of the arena, while they have a fish on. */
const BAR = { x: 0.045, w: 0.04, top: 0.17, bottom: 0.76 };
/** One colour for each kind of fish, smallest first: silver blue, green, orange, gold. */
const TIER_COLOR = ['oklch(0.78 0.08 225)', 'oklch(0.76 0.15 150)', 'oklch(0.74 0.17 55)', 'oklch(0.84 0.16 90)'];

function drawPond(sc: Scene<FishingSnapshot>): void {
  const { ctx, S, now, fx } = sc;
  const top = WATER_TOP * S;
  const water = ctx.createLinearGradient(0, top, 0, S);
  water.addColorStop(0, 'oklch(0.3 0.06 225 / 0.85)');
  water.addColorStop(1, 'oklch(0.2 0.05 245 / 0.92)');
  ctx.fillStyle = water;
  ctx.fillRect(0, top, S, S - top);
  // A few slow ripples, still when the device asks for reduced motion.
  ctx.strokeStyle = 'oklch(0.85 0.06 225 / 0.1)';
  ctx.lineWidth = 1.5;
  const drift = fx.reduced ? 0 : now / 4000;
  for (let i = 0; i < 6; i++) {
    const y = (WATER_TOP + 0.08 + i * 0.12 + Math.sin(drift + i) * 0.006) * S;
    ctx.beginPath();
    for (let x = 0; x <= S; x += S / 20) {
      const yy = y + Math.sin((x / S) * 9 + drift * 2 + i * 1.7) * S * 0.004;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // The bank the anglers stand on.
  ctx.fillStyle = 'oklch(0.27 0.03 70 / 0.95)';
  ctx.fillRect(0, SHORE_Y * S, S, S - SHORE_Y * S);
  ctx.fillStyle = 'oklch(0.85 0.06 225 / 0.35)';
  ctx.fillRect(0, SHORE_Y * S - 1, S, 2);
}

/** A fish: a body with a tail that wags, an eye at the front, in the colour of its kind. `dir` is which way it swims. */
function drawFish(sc: Scene<FishingSnapshot>, cx: number, cy: number, tier: number, dir: number, seed: number): void {
  const { ctx, S, now, fx } = sc;
  const r = FISHING_TIERS[tier].r * S;
  const rx = r * 1.6;
  const ry = r * 0.9;
  const wag = fx.reduced ? 0 : Math.sin(now / 110 + seed) * ry * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(dir, 1);
  ctx.fillStyle = TIER_COLOR[tier];
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-rx * 0.8, 0);
  ctx.lineTo(-rx * 1.5, -ry * 0.95 + wag);
  ctx.lineTo(-rx * 1.5, ry * 0.95 + wag);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'oklch(1 0 0 / 0.28)';
  ctx.beginPath();
  ctx.ellipse(rx * 0.05, ry * 0.35, rx * 0.6, ry * 0.4, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = STAGE.ink;
  ctx.beginPath();
  ctx.arc(rx * 0.55, -ry * 0.2, Math.max(1.5, ry * 0.18), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** An old boot drifting by: a shaft, a foot and a sole. It is the size of the fish kind it was drawn as. `dir` is which way it drifts (toes first). */
function drawBoot(sc: Scene<FishingSnapshot>, cx: number, cy: number, tier: number, dir: number): void {
  const { ctx, S, now, fx } = sc;
  const r = FISHING_TIERS[tier].r * S;
  const sway = fx.reduced ? 0 : Math.sin(now / 400 + cx) * 0.12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(sway);
  ctx.scale(dir, 1);
  ctx.fillStyle = 'oklch(0.42 0.06 55)';
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, -r * 1.5); // top of the shaft
  ctx.lineTo(-r * 0.1, -r * 1.5);
  ctx.lineTo(-r * 0.1, -r * 0.1);
  ctx.lineTo(r * 1.3, r * 0.2); // toe
  ctx.lineTo(r * 1.3, r * 0.9);
  ctx.lineTo(-r * 0.9, r * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'oklch(0.25 0.03 55)'; // sole
  ctx.fillRect(-r * 0.9, r * 0.7, r * 2.2, r * 0.35);
  ctx.fillStyle = 'oklch(0.7 0.05 60)'; // cuff
  ctx.fillRect(-r * 0.9, -r * 1.5, r * 0.8, r * 0.3);
  ctx.restore();
}

/** Where a fish is now: its place in the snapshot carried on by how long ago that was. */
const place = (f: FishingSnapshot['fish'][number], age: number) => ({ x: f.x + f.vx * age, y: f.y + f.vy * age });

function drawAnglers(sc: Scene<FishingSnapshot>): void {
  const { ctx, S, snapshot, theme, now, fx } = sc;
  const n = Math.max(1, snapshot.players.length);
  // Neighbours are never closer than this, whatever the crowd, so the little bars fit under each.
  const room = Math.min(0.1, (0.84 / n) * 0.92);
  for (const i of sc.order()) {
    const c = snapshot.players[i];
    if (!c.alive) continue; // out of lines: the burst has taken them
    const mine = c.id === sc.me;
    const who = sc.info(c.id);
    const x = c.x * S;
    const rodY = ROD_Y * S;
    ctx.save();
    if (!mine) ctx.globalAlpha = 0.85;

    if (c.mode === 'charging') {
      // Where the lure would land if you let go now, with the power on a dashed line up the pond.
      const reach = CAST_MIN + c.power * (CAST_MAX - CAST_MIN);
      const aimY = (ROD_Y - reach) * S;
      ctx.strokeStyle = who.color;
      ctx.globalAlpha = mine ? 0.7 : 0.35;
      ctx.lineWidth = mine ? 2 : 1;
      ctx.setLineDash([S * 0.012, S * 0.012]);
      ctx.beginPath();
      ctx.moveTo(x, rodY);
      ctx.lineTo(x, aimY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, aimY, LURE_R * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = mine ? 1 : 0.85;
    } else if (c.mode === 'out' || c.mode === 'fight') {
      const ly = c.ly * S;
      ctx.strokeStyle = who.color;
      ctx.globalAlpha = mine ? 0.8 : 0.5;
      ctx.lineWidth = mine ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, rodY);
      ctx.lineTo(x, ly);
      ctx.stroke();
      ctx.globalAlpha = mine ? 1 : 0.85;
      // The lure: a bobbing bead, pulsing while it is being wound in.
      const bob = fx.reduced ? 0 : Math.sin(now / 260 + i) * S * 0.003;
      ctx.fillStyle = who.color;
      ctx.beginPath();
      ctx.arc(x, ly + bob, S * (c.winding ? 0.013 : 0.011), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'oklch(1 0 0 / 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, ly + bob, S * 0.017, 0, Math.PI * 2);
      ctx.stroke();
      // The hooked fish struggling on the end of the line.
      if (c.mode === 'fight' && c.tier >= 0) drawFish(sc, x, ly - S * 0.01, c.tier, 1, i * 2);
    }
    ctx.restore();

    sc.drawPlayer(c.id, x, rodY, S * 0.034, S * 0.034);
    // Under the avatar: lines left, the wait for a bite, and the health bar with its number. The bar is full at the best it has been,
    // so it reads as how far you have fallen since your peak.
    const by = rodY + S * 0.034 + S * 0.012;
    const bw = room * S;
    drawLives(ctx, x, by + S * 0.006, c.lives, 3, S * 0.008, theme.danger);
    ctx.fillStyle = STAGE.hudFill;
    roundRect(ctx, x - bw / 2, by + S * 0.02, bw, S * 0.006, S * 0.003);
    ctx.fill();
    ctx.fillStyle = c.patience < 0.25 ? theme.danger : theme.mint;
    roundRect(ctx, x - bw / 2, by + S * 0.02, Math.max(S * 0.006, bw * c.patience), S * 0.006, S * 0.003);
    ctx.fill();
    const hpTop = by + S * 0.032;
    const hpH = S * 0.012;
    const hpFrac = Math.min(1, Math.max(0, c.hp / Math.max(1, c.peak)));
    ctx.fillStyle = STAGE.hudFill;
    roundRect(ctx, x - bw / 2, hpTop, bw, hpH, hpH / 2);
    ctx.fill();
    ctx.fillStyle = hpFrac < 0.3 ? theme.danger : theme.acc;
    roundRect(ctx, x - bw / 2, hpTop, Math.max(hpH, bw * hpFrac), hpH, hpH / 2);
    ctx.fill();
    ctx.font = `700 ${Math.round(S * 0.024)}px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.text;
    ctx.fillText(String(Math.ceil(c.hp)), x, hpTop + hpH + S * 0.03);
    // Someone else's reeling: a thin catch bar and a line bar beside their fish.
    if (!mine && c.mode === 'fight') drawMiniFight(sc, c, x);
  }
}

/** How another angler's fight is going, small, above their lure. */
function drawMiniFight(sc: Scene<FishingSnapshot>, c: FishingPlayer, x: number): void {
  const { ctx, S, theme } = sc;
  const bw = S * 0.07;
  const top = c.ly * S - S * 0.05;
  const bar = (y: number, h: number, fraction: number, fill: string) => {
    ctx.fillStyle = STAGE.hudFill;
    roundRect(ctx, x - bw / 2, y, bw, h, h / 2);
    ctx.fill();
    ctx.fillStyle = fill;
    roundRect(ctx, x - bw / 2, y, Math.max(h, bw * fraction), h, h / 2);
    ctx.fill();
  };
  bar(top, S * 0.01, c.health, c.health < 0.25 ? theme.danger : theme.mint);
  bar(top + S * 0.014, S * 0.006, c.catch, theme.acc);
}

/** The viewer's own reeling bar: the track with the green zone you raise by holding, the fish on it, and how the catch and the line are going. */
function drawReelBar(sc: Scene<FishingSnapshot>, c: FishingPlayer): void {
  const { ctx, S, theme } = sc;
  const x = BAR.x * S;
  const w = BAR.w * S;
  const top = BAR.top * S;
  const h = (BAR.bottom - BAR.top) * S;
  const at = (v: number) => top + v * h;
  ctx.save();
  ctx.fillStyle = STAGE.hudFill;
  roundRect(ctx, x - S * 0.012, top - S * 0.03, w + S * 0.07, h + S * 0.06, S * 0.02);
  ctx.fill();
  ctx.fillStyle = 'oklch(0.18 0.02 240 / 0.9)';
  roundRect(ctx, x, top, w, h, w / 2);
  ctx.fill();
  // The green zone: keep the fish inside it.
  const inside = Math.abs(c.mark - c.zone) <= c.half;
  const zoneTop = at(Math.max(0, c.zone - c.half));
  const zoneBottom = at(Math.min(1, c.zone + c.half));
  ctx.fillStyle = theme.mint;
  ctx.globalAlpha = inside ? 0.75 : 0.45;
  roundRect(ctx, x, zoneTop, w, zoneBottom - zoneTop, w / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // The fish, sized by its kind.
  drawFish(sc, x + w / 2, at(c.mark), Math.max(0, c.tier), 1, 0);
  // The catch (how close to landing) down the side, and under the bar the line's strength.
  const cx = x + w + S * 0.012;
  const cw = S * 0.01;
  ctx.fillStyle = 'oklch(0.18 0.02 240 / 0.9)';
  roundRect(ctx, cx, top, cw, h, cw / 2);
  ctx.fill();
  ctx.fillStyle = theme.acc;
  const filled = h * c.catch;
  roundRect(ctx, cx, top + h - filled, cw, Math.max(cw, filled), cw / 2);
  ctx.fill();
  const lw = w + S * 0.05;
  ctx.fillStyle = 'oklch(0.18 0.02 240 / 0.9)';
  roundRect(ctx, x, top + h + S * 0.008, lw, S * 0.01, S * 0.005);
  ctx.fill();
  ctx.fillStyle = c.health < 0.25 ? theme.danger : theme.mint;
  roundRect(ctx, x, top + h + S * 0.008, Math.max(S * 0.01, lw * c.health), S * 0.01, S * 0.005);
  ctx.fill();
  ctx.font = `700 ${Math.round(S * 0.022)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.text;
  ctx.fillText(`+${FISHING_TIERS[Math.max(0, c.tier)].points}`, x + (w + S * 0.05) / 2, top - S * 0.01);
  ctx.restore();
}

/** Each angler as of the last snapshot drawn: a fish is landed when one that was being reeled in is gone and the health bar has gone up. */
const previousAnglers = rememberSnapshot<Map<string, { fighting: boolean; hp: number; tier: number; ly: number; lives: number }>>();

/** A fish landed bursts into confetti where it was, in the angler's colour: more for a bigger fish. */
function celebrate(sc: Scene<FishingSnapshot>): void {
  const { snapshot } = sc;
  const before = previousAnglers(snapshot, () => new Map(snapshot.players.map((p) => [p.id, { fighting: p.mode === 'fight', hp: p.hp, tier: p.tier, ly: p.ly, lives: p.lives }])));
  if (!before) return;
  for (const p of snapshot.players) {
    const was = before.get(p.id);
    if (was?.fighting && p.mode !== 'fight' && p.alive && p.hp > was.hp + 0.5) sc.fx.confettiAt(p.x, was.ly, sc.info(p.id).color, 16 + 10 * Math.max(0, was.tier));
    // A line lost (a snap, a boot, a wait too long): a red puff where the lure was.
    if (was && p.lives < was.lives) sc.fx.confettiAt(p.x, was.ly, sc.theme.danger, 10);
  }
}

function drawWorld(sc: Scene<FishingSnapshot>): void {
  const { ctx, S, snapshot, now } = sc;
  celebrate(sc);
  const age = snapshot.phase === 'playing' ? sc.fx.age(snapshot, now) : 0;
  const mine = snapshot.players.find((p) => p.id === sc.me);
  drawPond(sc);

  // The fish. The one you have on the line is on your line, not out swimming as well.
  for (const f of snapshot.fish) {
    const here = place(f, age);
    if (here.x < -0.2 || here.x > 1.2) continue;
    if (mine && mine.alive && mine.hooked === f.n) continue;
    if (f.boot) drawBoot(sc, here.x * S, here.y * S, f.tier, f.vx >= 0 ? 1 : -1);
    else drawFish(sc, here.x * S, here.y * S, f.tier, f.vx >= 0 ? 1 : -1, f.n);
  }
  drawAnglers(sc);
  if (mine && mine.alive && mine.mode === 'fight') drawReelBar(sc, mine);
}

const scene: SceneGame<FishingSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: ROD_Y }),
};

export const fishingView: LobbyGameView<FishingSnapshot> = {
  // One held button does everything: hold to cast (let go to throw), hold to wind the lure in, hold to reel a fish in.
  // Space or Up, or press and hold anywhere on the arena.
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
