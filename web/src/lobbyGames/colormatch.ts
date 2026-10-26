import { COLOR_MATCH_PANELS, ENDLESS_LIVES, type ColorMatchSnapshot } from '@queueup/shared';
import type { MessageKey } from '../i18n';
import type { LobbyGameView } from './index';
import { FONT, STRIP_Y, drawLives, drawPrompt, drawStandings, drawTimer, renderScene, roundRect, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: what to match on the prompt line, the colour word, then the four
// panels (2 x 2).
const WORD_Y = 0.4;
const BOARD_X = 0.1;
const BOARD_Y = 0.5;
const PANEL_W = 0.38;
const PANEL_H = 0.2;
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

  // Time left: this prompt while one is up, otherwise the round.
  const prompting = snapshot.stage === 'prompt' && snapshot.prompt.n > 0;
  if (prompting) drawTimer(sc, snapshot.promptTotalMs > 0 ? snapshot.promptLeftMs / snapshot.promptTotalMs : 0);
  else if (snapshot.phase === 'playing' && snapshot.limitMs > 0) drawTimer(sc, snapshot.roundLeftMs / snapshot.limitMs);

  // Everyone's points, with a mark for how they answered the prompt on screen and their lives under.
  drawStandings(sc, {
    badge: (p) => (p.right === true ? 'ok' : p.right === false ? 'no' : null),
    under: (p, cx, y) => drawLives(ctx, cx, y, p.lives, ENDLESS_LIVES, S * 0.01, theme.danger),
  });

  // What to match (Color, Word or Shape), then the name of one colour written in the ink of another.
  if (prompting) {
    const { prompt } = snapshot;
    drawPrompt(sc, sc.t(MODE_KEYS[prompt.mode]));
    ctx.font = `800 ${Math.round(S * 0.11)}px ${FONT.display}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `oklch(0.8 0.18 ${HUES[prompt.ink]})`;
    ctx.fillText(sc.t(NAME_KEYS[prompt.word]), S / 2, WORD_Y * S);
  } else {
    drawPrompt(sc, sc.t('spin.lobby.colormatch.ready'));
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
  // Nobody is knocked out here, so a burst would only start on the standings strip.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
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
