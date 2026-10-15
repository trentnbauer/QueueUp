import { MEMORY_PANELS, type MemorySnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, renderScene, roundRect, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: one board of four panels (2 x 2), everyone's
// progress in a row above it.
const BOARD_X = 0.1;
const BOARD_Y = 0.26;
const PANEL_W = 0.38;
const PANEL_H = 0.31;
const GAP = 0.04;
const CHIPS_Y = 0.12;
const CHIP_R = 0.022;
/** One hue for each panel, so they are told apart by colour as well as place. */
const HUES = [25, 250, 145, 85];

const panelRect = (i: number): TapRect => ({ x: BOARD_X + (i % 2) * (PANEL_W + GAP), y: BOARD_Y + Math.floor(i / 2) * (PANEL_H + GAP), w: PANEL_W, h: PANEL_H });

/** The panels are the controller: each is a tap target, drawn exactly where it is hit. Numbered row by row
 * (top left, top right, bottom left, bottom right); on a keyboard the keys 1 to 4 do the same. */
export const MEMORY_TAPS: TapTargets = { rects: Array.from({ length: MEMORY_PANELS }, (_, i) => panelRect(i)), keys: ['1', '2', '3', '4'] };

function drawWorld(sc: Scene<MemorySnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Time left to tap the pattern back, as a bar draining along the top edge.
  if (snapshot.stage === 'input' && snapshot.inputTotalMs > 0) {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.inputLeftMs / snapshot.inputTotalMs), S * 0.008);
  }

  // Everyone's progress in one row: how many panels of the pattern they have right (never which), a tick when
  // they have the lot. Someone who is out is dimmed.
  const n = snapshot.players.length;
  const step = Math.min(0.1, 0.88 / Math.max(1, n));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out, or watching until the next run
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    sc.drawPlayer(p.id, cx, CHIPS_Y * S, CHIP_R * S, CHIP_R * S);
    ctx.font = `700 ${Math.round(S * 0.024)}px ${FONT.mono}`;
    ctx.fillStyle = p.done ? theme.mint : theme.text;
    ctx.fillText(snapshot.stage === 'show' ? '' : p.done ? '✓' : `${p.progress}/${snapshot.length}`, cx, (CHIPS_Y + CHIP_R + 0.03) * S);
  }

  // What to do now.
  ctx.font = `800 ${Math.round(S * 0.04)}px ${FONT.display}`;
  ctx.fillStyle = snapshot.stage === 'input' ? theme.mint : theme.text;
  const label = snapshot.stage === 'show' ? sc.t('spin.lobby.memory.watch', { n: snapshot.length }) : snapshot.stage === 'input' ? sc.t('spin.lobby.memory.repeat') : '';
  ctx.fillText(label, S / 2, (BOARD_Y - 0.025) * S);

  for (let i = 0; i < MEMORY_PANELS; i++) {
    const r = panelRect(i);
    const lit = snapshot.lit === i;
    ctx.save();
    ctx.globalAlpha = lit ? 1 : 0.5;
    if (lit) {
      ctx.shadowColor = `oklch(0.8 0.18 ${HUES[i]})`;
      ctx.shadowBlur = S * 0.05;
    }
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.03);
    ctx.fillStyle = lit ? `oklch(0.85 0.17 ${HUES[i]})` : `oklch(0.55 0.12 ${HUES[i]})`;
    ctx.fill();
    ctx.restore();
  }
}

const scene: SceneGame<MemorySnapshot> = {
  scroll: 'y',
  taps: MEMORY_TAPS,
  drawWorld,
  // Where a knock-out burst starts: over the row of players.
  anchor: (snapshot, index) => ({ x: 0.5 + (index - (snapshot.players.length - 1) / 2) * 0.1, y: CHIPS_Y }),
};

export const memoryView: LobbyGameView<MemorySnapshot> = {
  // The panels are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: MEMORY_TAPS,
  nameKey: 'spin.lobby.memory.name',
  taglineKey: 'spin.lobby.memory.tagline',
  hintKey: 'spin.lobby.memory.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
