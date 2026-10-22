import { COLOR_MATCH_PANELS, ENDLESS_LIVES, type ColorMatchSnapshot } from '@queueup/shared';
import type { MessageKey } from '../i18n';
import type { LobbyGameView } from './index';
import { FONT, drawLives, renderScene, roundRect, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: everyone's points in a row, the prompt, then the four
// panels (2 x 2).
const CHIPS_Y = 0.11;
const CHIP_R = 0.022;
const MODE_Y = 0.225;
const PROMPT_Y = 0.335;
const BOARD_X = 0.1;
const BOARD_Y = 0.45;
const PANEL_W = 0.38;
const PANEL_H = 0.22;
const GAP = 0.04;
/** One hue for each panel (red, blue, green, yellow). */
const HUES = [25, 250, 145, 85];
const MODE_KEYS = { ink: 'spin.lobby.colormatch.mode.ink', word: 'spin.lobby.colormatch.mode.word' } as const satisfies Record<string, MessageKey>;
const NAME_KEYS: MessageKey[] = ['spin.lobby.colormatch.color.0', 'spin.lobby.colormatch.color.1', 'spin.lobby.colormatch.color.2', 'spin.lobby.colormatch.color.3'];

/** A circle, square, triangle or diamond for panel `i`, `r` across. */
function drawGlyph(ctx: CanvasRenderingContext2D, i: number, cx: number, cy: number, r: number): void {
  ctx.fillStyle = 'oklch(0.14 0.01 60 / 0.85)';
  ctx.beginPath();
  if (i === 0) ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (i === 1) ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else if (i === 2) {
    ctx.moveTo(cx, cy - r * 1.1);
    ctx.lineTo(cx + r * 1.1, cy + r * 0.9);
    ctx.lineTo(cx - r * 1.1, cy + r * 0.9);
    ctx.closePath();
  } else {
    ctx.moveTo(cx, cy - r * 1.2);
    ctx.lineTo(cx + r * 1.2, cy);
    ctx.lineTo(cx, cy + r * 1.2);
    ctx.lineTo(cx - r * 1.2, cy);
    ctx.closePath();
  }
  ctx.fill();
}

const panelRect = (i: number): TapRect => ({ x: BOARD_X + (i % 2) * (PANEL_W + GAP), y: BOARD_Y + Math.floor(i / 2) * (PANEL_H + GAP), w: PANEL_W, h: PANEL_H });

/** The panels are the controller: each is a tap target, drawn exactly where it is hit. Numbered row by row (top left,
 * top right, bottom left, bottom right); on a keyboard the keys 1 to 4 do the same. */
export const COLOR_MATCH_TAPS: TapTargets = { rects: Array.from({ length: COLOR_MATCH_PANELS }, (_, i) => panelRect(i)), keys: ['1', '2', '3', '4'] };

function drawWorld(sc: Scene<ColorMatchSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Time left in the round, as a bar draining along the top edge.
  if (snapshot.phase === 'playing' && snapshot.limitMs > 0) {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / snapshot.limitMs), S * 0.008);
  }

  // Everyone's points in one row, with a mark for how they answered the prompt on screen.
  const n = snapshot.players.length;
  const step = Math.min(0.09, 0.84 / Math.max(1, n));
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // watching until the next round
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    sc.drawPlayer(p.id, cx, CHIPS_Y * S, CHIP_R * S, CHIP_R * S);
    ctx.fillStyle = p.right === true ? theme.mint : p.right === false ? theme.danger : theme.text;
    ctx.fillText(`${p.meters}${p.right === true ? ' ✓' : p.right === false ? ' ✗' : ''}`, cx, (CHIPS_Y + CHIP_R + 0.03) * S);
    drawLives(ctx, cx, (CHIPS_Y + CHIP_R + 0.058) * S, p.lives, ENDLESS_LIVES, S * 0.011, theme.danger);
  }

  // The prompt: what to match, then the name of one colour written in the ink of another.
  if (snapshot.stage === 'prompt' && snapshot.prompt.n > 0) {
    const { prompt } = snapshot;
    // What to match, in one large white word: Color, Word or Shape.
    ctx.font = `800 ${Math.round(S * 0.07)}px ${FONT.display}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.fillText(sc.t(MODE_KEYS[prompt.mode]), S / 2, MODE_Y * S);
    ctx.font = `800 ${Math.round(S * 0.11)}px ${FONT.display}`;
    ctx.fillStyle = `oklch(0.8 0.18 ${HUES[prompt.ink]})`;
    ctx.fillText(sc.t(NAME_KEYS[prompt.word]), S / 2, PROMPT_Y * S);
    // How long this prompt has left.
    const left = snapshot.promptTotalMs > 0 ? Math.max(0, snapshot.promptLeftMs / snapshot.promptTotalMs) : 0;
    ctx.fillStyle = 'oklch(1 0 0 / 0.12)';
    ctx.fillRect(BOARD_X * S, (PROMPT_Y + 0.085) * S, (PANEL_W * 2 + GAP) * S, S * 0.008);
    ctx.fillStyle = theme.acc;
    ctx.fillRect(BOARD_X * S, (PROMPT_Y + 0.085) * S, (PANEL_W * 2 + GAP) * S * left, S * 0.008);
  } else {
    ctx.font = `800 ${Math.round(S * 0.04)}px ${FONT.display}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.fillText(sc.t('spin.lobby.colormatch.ready'), S / 2, PROMPT_Y * S);
  }

  for (let i = 0; i < COLOR_MATCH_PANELS; i++) {
    const r = panelRect(i);
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.03);
    ctx.fillStyle = `oklch(0.62 0.16 ${HUES[i]})`;
    ctx.fill();
    // Colour is not the only way to tell the panels apart: each has its own shape and says its colour.
    const cx = (r.x + r.w / 2) * S;
    const cy = (r.y + r.h / 2) * S;
    drawGlyph(ctx, i, cx, cy - S * 0.03, S * 0.045);
    ctx.font = `800 ${Math.round(S * 0.034)}px ${FONT.display}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'oklch(0.14 0.01 60 / 0.85)';
    ctx.fillText(sc.t(NAME_KEYS[i]).toUpperCase(), cx, cy + S * 0.05);
  }
}

const scene: SceneGame<ColorMatchSnapshot> = {
  scroll: 'y',
  taps: COLOR_MATCH_TAPS,
  drawWorld,
  // Nobody is knocked out here, so a burst would only start on the row of points.
  anchor: (snapshot, index) => ({ x: 0.5 + (index - (snapshot.players.length - 1) / 2) * 0.09, y: CHIPS_Y }),
};

export const colorMatchView: LobbyGameView<ColorMatchSnapshot> = {
  // The panels are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: COLOR_MATCH_TAPS,
  nameKey: 'spin.lobby.colormatch.name',
  taglineKey: 'spin.lobby.colormatch.tagline',
  hintKey: 'spin.lobby.colormatch.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
