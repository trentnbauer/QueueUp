import { botColor, botNumber, isBotId, type LobbyGameSnapshot, type User } from '@queueup/shared';
import type { LobbyDrawArgs } from '../index';
import { avatar } from './draw';
import type { LobbyFx } from './fx';
import { drawHud } from './hud';
import { tapRect, type TapTargets } from '../taps';
import { STAGE, stageTheme, type StageTheme } from './theme';

/** Everything a game needs to draw its world for one frame, with the arena's look already set up. */
export interface Scene<S extends LobbyGameSnapshot = LobbyGameSnapshot> {
  ctx: CanvasRenderingContext2D;
  /** The arena's side in pixels. Size things as fractions of this. */
  S: number;
  /** `performance.now()` for this frame, for animation. */
  now: number;
  theme: StageTheme;
  snapshot: S;
  me: string;
  users: Map<string, User>;
  /** Eases a thing toward its latest server position (see LobbyDrawArgs). */
  ease: LobbyDrawArgs['ease'];
  color: LobbyDrawArgs['color'];
  t: LobbyDrawArgs['t'];
  fx: LobbyFx;
  /** The direction the viewer is holding right now (see LobbyDrawArgs). */
  held: { dx: number; dy: number };
  /** How far a scrolling course has moved, in screens, since this snapshot arrived: subtract it from
   * where the snapshot says an obstacle is (or add it to where something falls) so motion stays smooth. */
  drift: number;
  /** A player's colour, initial and name. */
  info: (id: string) => { color: string; initial: string; name: string };
  /** The order to draw players in: everyone else first, the viewer last so you are never hidden in a crowd. */
  order: () => number[];
  /** Draws a player. `rx`/`ry` are half-width and half-height in pixels: equal for a circle, taller for a capsule. */
  /** `tag: false` leaves off the YOU tag (the standings strip, a falling ball). */
  drawPlayer: (id: string, cx: number, cy: number, rx: number, ry: number, opts?: { tag?: boolean }) => void;
}

/** What a round-based game supplies to get the standard look: where its dots drift, how to draw its
 * world, and where a player is (for the knock-out burst). The background, effects, heads-up display,
 * countdown and result card all come from `renderScene`. */
export interface SceneGame<S extends LobbyGameSnapshot> {
  /** Which way the background dots drift: sideways as a course scrolls past, or down as things fall. */
  scroll: 'x' | 'y';
  /** The game's tap targets (the same ones its view declares), so the kit can light the one just pressed. */
  taps?: TapTargets;
  /** Draws the ground, obstacles and players, on top of the background and under the effects. */
  drawWorld(sc: Scene<S>): void;
  /** Where player number `index` is, as fractions of the arena's size. */
  anchor(snapshot: S, index: number): { x: number; y: number };
}

/** Draws one frame of a round-based game in the standard order: background, dot grid, the game's
 * world, effects, heads-up display, then the red flash and vignette. Every game's `draw` is one call
 * to this. */
export function renderScene<S extends LobbyGameSnapshot>(args: LobbyDrawArgs<S>, game: SceneGame<S>): void {
  const { ctx, size: S, snapshot, me, users, ease, color, t, fx, held = { dx: 0, dy: 0 } } = args;
  const now = performance.now();
  const theme = stageTheme(color);
  const info = (id: string) => {
    // Bots are not members, so they are not in `users`: they get a plain name and a muted colour.
    if (isBotId(id)) return { color: botColor(id), initial: 'B', name: t('spin.lobby.hud.botName', { n: botNumber(id) }) };
    const user = users.get(id);
    const name = user?.displayName ?? '?';
    return { color: user?.avatarColor ?? '#8b5cf6', initial: name.slice(0, 1).toUpperCase() || '?', name };
  };

  fx.update(snapshot, now, {
    me,
    accent: theme.acc,
    colorOf: (id) => info(id).color,
    anchor: (snap, i) => game.anchor(snap as S, i),
    outText: t('spin.lobby.hud.outTag'),
    youOutText: t('spin.lobby.hud.youOutTag'),
  });

  const sc: Scene<S> = {
    ctx,
    S,
    now,
    theme,
    snapshot,
    me,
    users,
    ease,
    color,
    t,
    fx,
    held,
    drift: snapshot.phase === 'playing' ? snapshot.speed * fx.age(snapshot, now) : 0,
    info,
    order: () => snapshot.players.map((_, i) => i).sort((a, b) => Number(snapshot.players[a].id === me) - Number(snapshot.players[b].id === me)),
    drawPlayer: (id, cx, cy, rx, ry, opts) => {
      const who = info(id);
      avatar(ctx, { cx, cy, rx, ry, color: who.color, initial: who.initial, isMe: id === me }, S, theme, t('spin.lobby.hud.you'), opts?.tag ?? true);
    },
  };

  ctx.save();
  if (fx.shake > 0) {
    const amount = fx.shake * fx.shake * S * 0.03;
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }
  drawBackdrop(sc, game.scroll);
  game.drawWorld(sc);
  if (game.taps) drawPressed(sc, game.taps);
  fx.draw(ctx, S, theme);
  drawHud(sc);
  ctx.restore();

  if (fx.flash > 0) {
    ctx.fillStyle = `oklch(0.68 0.2 25 / ${fx.flash * 0.3})`;
    ctx.fillRect(0, 0, S, S);
  }
  const vignette = ctx.createRadialGradient(S / 2, S / 2, S * 0.4, S / 2, S / 2, S * 0.75);
  vignette.addColorStop(0, 'oklch(0 0 0 / 0)');
  vignette.addColorStop(1, 'oklch(0 0 0 / 0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, S, S);
}

/** How long a tapped target stays lit, in milliseconds. */
const PRESS_MS = 180;

/** A brief glow on the tap target that was just pressed, so a tap always feels answered. */
function drawPressed(sc: Scene, taps: TapTargets): void {
  const press = sc.fx.pressed;
  if (!press) return;
  const k = 1 - (sc.now - press.at) / PRESS_MS;
  const r = tapRect(taps, press.target);
  if (k <= 0 || !r) return;
  const { ctx, S } = sc;
  ctx.save();
  ctx.globalAlpha = 0.35 * k;
  ctx.fillStyle = sc.theme.acc;
  ctx.fillRect(r.x * S, r.y * S, r.w * S, r.h * S);
  ctx.restore();
}

/** The sky, an accent glow and a faint dot grid that drifts with the course. */
function drawBackdrop(sc: Scene, scroll: 'x' | 'y'): void {
  const { ctx, S, theme } = sc;
  const sky = ctx.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, STAGE.skyTop);
  sky.addColorStop(0.6, STAGE.skyMid);
  sky.addColorStop(1, STAGE.skyBottom);
  ctx.fillStyle = sky;
  // Slightly oversize, so a screen shake never shows the edge.
  ctx.fillRect(-S * 0.1, -S * 0.1, S * 1.2, S * 1.2);

  const glow = ctx.createRadialGradient(S * 0.75, S * 0.15, 0, S * 0.75, S * 0.15, S * 0.6);
  glow.addColorStop(0, theme.accGlow);
  glow.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();

  const step = S / 14;
  // `fx.scroll` moves every frame already; adding `drift` too would make the dots judder (see courseOffset).
  const offset = ((sc.fx.scroll * S * 0.25) % step + step) % step;
  ctx.fillStyle = STAGE.dot;
  for (let i = -1; i < 16; i++) {
    for (let j = -1; j < 16; j++) {
      ctx.fillRect(scroll === 'y' ? i * step : i * step - offset, scroll === 'y' ? j * step + offset : j * step, 1.5, 1.5);
    }
  }
}

/** The floor strip under a course: a darker band with a light line along its top. */
export function drawFloor(sc: Scene, top: number): void {
  const { ctx, S } = sc;
  ctx.fillStyle = STAGE.ground;
  ctx.fillRect(0, top, S, S - top);
  ctx.fillStyle = STAGE.groundLine;
  ctx.fillRect(0, top, S, 1);
}

/** Where a repeating pattern that is part of the course (ground marks, fence posts) sits: how many pixels
 * to slide it back (left on a sideways course, down on a falling one) from its starting spot. `period` is
 * how far apart the pattern repeats, in pixels. The pattern moves at exactly the course's speed, the same
 * as the obstacles and pickups, whatever its period. Use this for anything on the course instead of
 * working the offset out by hand: scaling an offset (`offset * 2`) makes the pattern move faster or slower
 * than the course. */
export function courseOffset(sc: Pick<Scene, 'S'> & { fx: Pick<Scene['fx'], 'scroll'> }, period: number): number {
  // `fx.scroll` already advances every frame at the course's speed, so `drift` (which is for things placed
  // by a snapshot) must not be added: it grows until the next snapshot and then drops back to zero, which
  // would make the pattern run at double speed between snapshots and snap back, so it looks like it vibrates.
  return (sc.fx.scroll * sc.S) % period;
}
