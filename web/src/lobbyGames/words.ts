import { WORDS_BACKSPACE, WORDS_ENTER, WORDS_GUESSES, WORDS_LENGTH, WORDS_TARGETS, WORD_ABSENT, WORD_CORRECT, WORD_PRESENT, type WordsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

/** The run's length (ROUND_S in the rules), for the bar along the top. */
const RUN_MS = 90_000;
// Where things are on the arena, as fractions of its side: your own board on the left, everyone else's progress
// on the right (only how each guess scored, never letters), and the keyboard along the bottom.
const BOARD_X = 0.05;
const BOARD_Y = 0.13;
const CELL = 0.1;
const CELL_GAP = 0.01;
const OTHERS_X = 0.56;
const OTHERS_Y = 0.13;
const OTHERS_W = 0.4;
const OTHERS_H = 0.5;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEY_W = 0.092;
const KEY_H = 0.078;
const KEY_GAP = 0.004;
const KEYS_Y = 0.72;
const KEYS_X = 0.02;
/** How a guessed letter scored, as colours: right place, somewhere else in the word, not in it. */
const ABSENT = 'oklch(0.34 0.01 60)';

/** The on-screen keyboard: each key is a tap target drawn exactly where it is hit. Targets 0 to 25 are the letters
 * a to z, then Enter and Backspace. On a keyboard the same keys type the letters, send and take one back. */
function layout(): TapRect[] {
  const rects: TapRect[] = Array.from({ length: WORDS_TARGETS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  const place = (target: number, col: number, row: number, span: number, offset: number) => {
    rects[target] = { x: KEYS_X + (offset + col) * (KEY_W + KEY_GAP), y: KEYS_Y + row * (KEY_H + KEY_GAP), w: KEY_W * span + KEY_GAP * (span - 1), h: KEY_H };
  };
  KEY_ROWS.forEach((letters, row) => {
    // The second row is indented half a key, and the third makes room for Enter and Backspace.
    const offset = row === 1 ? 0.5 : row === 2 ? 1.5 : 0;
    [...letters].forEach((letter, col) => place(letter.charCodeAt(0) - 97, col, row, 1, offset));
  });
  place(WORDS_ENTER, 0, 2, 1.5, 0);
  place(WORDS_BACKSPACE, 8.5, 2, 1.5, 0);
  return rects;
}

const KEY_RECTS = layout();

export const WORDS_TAPS: TapTargets = {
  rects: KEY_RECTS,
  keys: [...'abcdefghijklmnopqrstuvwxyz', 'Enter', 'Backspace'],
};

function cellColour(sc: Scene<WordsSnapshot>, state: number): string {
  return state === WORD_CORRECT ? sc.theme.mint : state === WORD_PRESENT ? sc.theme.star : ABSENT;
}

function drawWorld(sc: Scene<WordsSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Time left in the run, as a bar draining along the top edge.
  if (snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / RUN_MS), S * 0.008);
  }

  // Your own board: a row for each guess, scored letter by letter; the word being typed; empty rows to come.
  const mine = snapshot.mine;
  const meIndex = snapshot.players.findIndex((p) => p.id === sc.me);
  const rows = snapshot.players[meIndex]?.rows ?? [];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cell = CELL * S;
  for (let r = 0; r < WORDS_GUESSES; r++) {
    for (let c = 0; c < WORDS_LENGTH; c++) {
      const x = (BOARD_X + c * (CELL + CELL_GAP)) * S;
      const y = (BOARD_Y + r * (CELL + CELL_GAP)) * S;
      const guess = mine?.guesses[r];
      const typing = !guess && r === (mine?.guesses.length ?? 0) && mine && snapshot.phase === 'playing';
      const letter = guess ? guess[c] : typing ? mine.draft[c] : undefined;
      roundRect(ctx, x, y, cell, cell, cell * 0.14);
      if (guess) {
        ctx.fillStyle = cellColour(sc, rows[r]?.[c] ?? WORD_ABSENT);
        ctx.fill();
      } else {
        ctx.fillStyle = 'oklch(1 0 0 / 0.05)';
        ctx.fill();
        ctx.strokeStyle = letter ? theme.text : STAGE.hudStroke;
        ctx.lineWidth = letter ? 2 : 1;
        ctx.stroke();
      }
      if (letter) {
        ctx.font = `800 ${Math.round(cell * 0.55)}px ${FONT.display}`;
        ctx.fillStyle = guess ? 'oklch(0.16 0.01 60)' : theme.text;
        ctx.fillText(letter.toUpperCase(), x + cell / 2, y + cell / 2 + cell * 0.03);
      }
    }
  }

  // Once the run is over the secret word is shown.
  if (snapshot.answer) {
    ctx.font = `800 ${Math.round(S * 0.034)}px ${FONT.display}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(sc.t('spin.lobby.words.answer', { word: snapshot.answer.toUpperCase() }), (BOARD_X + (WORDS_LENGTH * (CELL + CELL_GAP)) / 2) * S, (BOARD_Y - 0.035) * S);
  }

  // Everyone else's progress: a small grid for each, coloured the way each guess scored. No letters, so nothing
  // is given away; a solved board is green all the way across its last row.
  const others = snapshot.players.map((p, i) => ({ p, i })).filter(({ p }) => p.alive && p.id !== sc.me);
  const mini = Math.min(0.016, (OTHERS_W / Math.max(1, others.length)) * 0.2);
  const gw = (WORDS_LENGTH * (mini + 0.003) + 0.012) * S;
  const gh = (WORDS_GUESSES * (mini + 0.003) + 0.024) * S;
  const perRow = Math.max(1, Math.floor((OTHERS_W * S) / gw));
  const scale = Math.min(1, (OTHERS_H * S) / (Math.ceil(others.length / perRow) * gh));
  others.forEach(({ p }, k) => {
    const gx = OTHERS_X * S + (k % perRow) * gw * scale;
    const gy = OTHERS_Y * S + Math.floor(k / perRow) * gh * scale;
    ctx.fillStyle = sc.info(p.id).color;
    ctx.beginPath();
    ctx.arc(gx + 0.006 * S * scale, gy + 0.006 * S * scale, 0.005 * S * scale, 0, Math.PI * 2);
    ctx.fill();
    for (let r = 0; r < WORDS_GUESSES; r++) {
      for (let c = 0; c < WORDS_LENGTH; c++) {
        const x = gx + (0.012 + c * (mini + 0.003)) * S * scale;
        const y = gy + (0.016 + r * (mini + 0.003)) * S * scale;
        const state = p.rows[r]?.[c];
        ctx.fillStyle = state === undefined ? 'oklch(1 0 0 / 0.07)' : cellColour(sc, state);
        ctx.fillRect(x, y, mini * S * scale, mini * S * scale);
      }
    }
  });

  // The keyboard, each key coloured by the best it has scored for you.
  const keyStates = mine?.keys;
  ctx.font = `700 ${Math.round(KEY_H * S * 0.42)}px ${FONT.ui}`;
  KEY_RECTS.forEach((r, i) => {
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.012);
    const state = i < 26 ? (keyStates?.[i] ?? -1) : -1;
    ctx.fillStyle = state === WORD_CORRECT ? theme.mint : state === WORD_PRESENT ? theme.star : state === WORD_ABSENT ? 'oklch(0.25 0.01 60)' : 'oklch(1 0 0 / 0.14)';
    ctx.fill();
    ctx.fillStyle = state === WORD_CORRECT || state === WORD_PRESENT ? 'oklch(0.16 0.01 60)' : theme.text;
    const label = i < 26 ? String.fromCharCode(65 + i) : i === WORDS_ENTER ? '↵' : '⌫';
    ctx.fillText(label, (r.x + r.w / 2) * S, (r.y + r.h / 2) * S);
  });
}

const scene: SceneGame<WordsSnapshot> = {
  scroll: 'y',
  taps: WORDS_TAPS,
  drawWorld,
  // Nobody is knocked out here, so a burst would only start at the middle of the boards.
  anchor: () => ({ x: 0.5, y: 0.4 }),
};

export const wordsView: LobbyGameView<WordsSnapshot> = {
  // The keyboard is the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: WORDS_TAPS,
  nameKey: 'spin.lobby.words.name',
  taglineKey: 'spin.lobby.words.tagline',
  hintKey: 'spin.lobby.words.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive && !p.done })).sort((a, b) => b.score - a.score),
};
