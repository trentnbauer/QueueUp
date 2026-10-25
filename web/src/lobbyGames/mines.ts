import { MINES_COLS, MINES_TARGETS, type MinesSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STRIP_Y, drawStandings, renderScene, roundRect, rememberSnapshot, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: the one shared board, under the standings strip.
const BOARD_X = 0.15;
const BOARD_Y = 0.29;
const BOARD_W = 0.7;
const CELL = BOARD_W / MINES_COLS;
const CELL_GAP = 0.004;
/** Colours for the numbers 1 to 8, as a mine counter reads. */
const NUMBER_HUES = [250, 145, 25, 290, 40, 190, 330, 60];

const cellRect = (i: number): TapRect => ({ x: BOARD_X + (i % MINES_COLS) * CELL, y: BOARD_Y + Math.floor(i / MINES_COLS) * CELL, w: CELL, h: CELL });

/** The board is the controller: each square is a tap target, drawn exactly where it is hit, numbered row by row. There is
 * no keyboard control (there are too many squares). */
export const MINES_TAPS: TapTargets = { rects: Array.from({ length: MINES_TARGETS }, (_, i) => cellRect(i)) };

/** The field as of the last snapshot drawn. */
const previousField = rememberSnapshot<number[]>();

/** Squares opened since the last snapshot give one small puff of confetti between them, in the colour of whoever opened them: a little bigger for an opening that
 * cleared a patch, but never more than a handful, so a quick game stays calm. */
function celebrate(sc: Scene<MinesSnapshot>): void {
  const { snapshot } = sc;
  const before = previousField(snapshot, () => [...snapshot.cells]);
  if (!before) return;
  const opened = snapshot.cells.flatMap((cell, i) => (before[i] === -1 && cell >= 0 && cell !== 9 ? [i] : []));
  if (opened.length === 0) return;
  const at = (i: number) => ({ x: BOARD_X + (i % MINES_COLS) * CELL + CELL / 2, y: BOARD_Y + Math.floor(i / MINES_COLS) * CELL + CELL / 2 });
  const spots = opened.map(at);
  const x = spots.reduce((sum, s) => sum + s.x, 0) / spots.length;
  const y = spots.reduce((sum, s) => sum + s.y, 0) / spots.length;
  const who = snapshot.players[snapshot.by[opened[0]]];
  sc.fx.confettiAt(x, y, who ? sc.info(who.id).color : 145, Math.min(14, 6 + opened.length));
}

function drawWorld(sc: Scene<MinesSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  celebrate(sc);

  // Everyone's points; someone who hit a mine is out (dimmed, with a mark).
  drawStandings(sc, { badge: (p) => (p.fell ? 'no' : null) });

  for (let i = 0; i < MINES_TARGETS; i++) {
    const r = cellRect(i);
    const x = (r.x + CELL_GAP) * S;
    const y = (r.y + CELL_GAP) * S;
    const w = (r.w - CELL_GAP * 2) * S;
    const state = snapshot.cells[i];
    const owner = snapshot.players[snapshot.by[i]];
    roundRect(ctx, x, y, w, w, S * 0.012);
    if (state === -1) {
      // Not opened: a raised tile.
      ctx.fillStyle = 'oklch(0.5 0.04 60)';
      ctx.fill();
      continue;
    }
    ctx.fillStyle = state === 9 ? 'oklch(0.36 0.12 25)' : 'oklch(0.24 0.01 60)';
    ctx.fill();
    // A thin outline in the colour of whoever opened it.
    if (owner) {
      ctx.strokeStyle = sc.info(owner.id).color;
      ctx.lineWidth = Math.max(1.5, S * 0.004);
      ctx.stroke();
    }
    if (state === 9) {
      ctx.fillStyle = theme.danger;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + w / 2, w * 0.26, 0, Math.PI * 2);
      ctx.fill();
    } else if (state > 0) {
      ctx.font = `800 ${Math.round(w * 0.62)}px ${FONT.display}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `oklch(0.8 0.16 ${NUMBER_HUES[state - 1]})`;
      ctx.fillText(String(state), x + w / 2, y + w / 2 + w * 0.04);
    }
  }
}

const scene: SceneGame<MinesSnapshot> = {
  scroll: 'y',
  taps: MINES_TAPS,
  drawWorld,
  // A burst starts over the standings strip, where the person who hit a mine is shown.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const minesView: LobbyGameView<MinesSnapshot> = {
  // The board is the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: MINES_TAPS,
  nameKey: 'spin.lobby.mines.name',
  taglineKey: 'spin.lobby.mines.tagline',
  hintKey: 'spin.lobby.mines.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
