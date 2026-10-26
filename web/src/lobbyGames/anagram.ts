import { ANAGRAM_BACKSPACE, ANAGRAM_MAX_LETTERS, ANAGRAM_TARGETS, type AnagramSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, STRIP_Y, drawStandings, drawTimer, renderScene, roundRect, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: the answer you are spelling,
// and the scrambled tiles (with a take-back key) along the bottom.
const SLOTS_Y = 0.36;
const SLOT = 0.11;
const SLOT_GAP = 0.014;
const TILES_Y = 0.66;
const TILE_W = 0.115;
const TILE_H = 0.15;
const TILE_GAP = 0.012;
const TILES_X = (1 - (ANAGRAM_TARGETS * TILE_W + (ANAGRAM_TARGETS - 1) * TILE_GAP)) / 2;

const tileRect = (i: number): TapRect => ({ x: TILES_X + i * (TILE_W + TILE_GAP), y: TILES_Y, w: TILE_W, h: TILE_H });

/** The tiles are the controller: targets 0 to 5 are the scrambled letters left to right and the last is the take-back
 * key, each drawn exactly where it is hit. On a keyboard the keys 1 to 6 pick a tile and Backspace takes one back. */
export const ANAGRAM_TAPS: TapTargets = {
  rects: Array.from({ length: ANAGRAM_TARGETS }, (_, i) => tileRect(i)),
  keys: ['1', '2', '3', '4', '5', '6', 'Backspace'],
};

function drawWorld(sc: Scene<AnagramSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Time left: this word while one is up, otherwise the round.
  if (snapshot.stage === 'play' && snapshot.wordTotalMs > 0) drawTimer(sc, snapshot.wordLeftMs / snapshot.wordTotalMs);
  else if (snapshot.phase === 'playing' && snapshot.limitMs > 0) drawTimer(sc, snapshot.roundLeftMs / snapshot.limitMs);

  // Everyone's points.
  drawStandings(sc);

  const letters = snapshot.letters;
  const picked = snapshot.mine?.picked ?? [];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // The answer so far: a slot for each letter, filled in the order you picked the tiles.
  const slotsW = letters.length * SLOT + (letters.length - 1) * SLOT_GAP;
  for (let k = 0; k < letters.length; k++) {
    const x = (0.5 - slotsW / 2 + k * (SLOT + SLOT_GAP)) * S;
    const y = SLOTS_Y * S;
    roundRect(ctx, x, y, SLOT * S, SLOT * S, S * 0.02);
    ctx.fillStyle = 'oklch(1 0 0 / 0.05)';
    ctx.fill();
    ctx.strokeStyle = picked[k] !== undefined ? theme.text : STAGE.hudStroke;
    ctx.lineWidth = picked[k] !== undefined ? 2 : 1;
    ctx.stroke();
    // Once the word is over, the answer is shown in the slots.
    const shown = snapshot.answer ? snapshot.answer[k] : picked[k] !== undefined ? letters[picked[k]] : '';
    if (shown) {
      ctx.font = `800 ${Math.round(SLOT * S * 0.6)}px ${FONT.display}`;
      ctx.fillStyle = snapshot.answer ? theme.mint : theme.text;
      ctx.fillText(shown.toUpperCase(), x + (SLOT * S) / 2, y + (SLOT * S) / 2 + SLOT * S * 0.03);
    }
  }
  if (snapshot.answer && snapshot.solvedBy) {
    ctx.font = `700 ${Math.round(S * 0.03)}px ${FONT.ui}`;
    ctx.fillStyle = theme.accText;
    ctx.fillText(sc.t('spin.lobby.anagram.solvedBy', { name: sc.info(snapshot.solvedBy).name }), S / 2, (SLOTS_Y + SLOT + 0.07) * S);
  } else if (snapshot.answer) {
    ctx.font = `700 ${Math.round(S * 0.03)}px ${FONT.ui}`;
    ctx.fillStyle = theme.line;
    ctx.fillText(sc.t('spin.lobby.anagram.nobody'), S / 2, (SLOTS_Y + SLOT + 0.07) * S);
  }

  // The scrambled tiles, and the take-back key.
  for (let i = 0; i < ANAGRAM_MAX_LETTERS; i++) {
    const r = tileRect(i);
    if (i >= letters.length) continue;
    const used = picked.includes(i);
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.02);
    ctx.fillStyle = used ? 'oklch(0.3 0.01 60)' : 'oklch(0.62 0.1 60)';
    ctx.globalAlpha = used || snapshot.stage !== 'play' ? 0.45 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = `800 ${Math.round(r.h * S * 0.55)}px ${FONT.display}`;
    ctx.fillStyle = used ? theme.line : 'oklch(0.16 0.01 60)';
    ctx.fillText(letters[i].toUpperCase(), (r.x + r.w / 2) * S, (r.y + r.h / 2) * S + r.h * S * 0.03);
  }
  const back = tileRect(ANAGRAM_BACKSPACE);
  roundRect(ctx, back.x * S, back.y * S, back.w * S, back.h * S, S * 0.02);
  ctx.fillStyle = 'oklch(0.34 0.02 60)';
  ctx.fill();
  ctx.font = `700 ${Math.round(back.h * S * 0.45)}px ${FONT.ui}`;
  ctx.fillStyle = theme.text;
  ctx.fillText('⌫', (back.x + back.w / 2) * S, (back.y + back.h / 2) * S);
}

const scene: SceneGame<AnagramSnapshot> = {
  scroll: 'y',
  taps: ANAGRAM_TAPS,
  drawWorld,
  // Nobody is knocked out here, so a burst would only start on the standings strip.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const anagramView: LobbyGameView<AnagramSnapshot> = {
  // The tiles are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: ANAGRAM_TAPS,
  nameKey: 'spin.lobby.anagram.name',
  taglineKey: 'spin.lobby.anagram.tagline',
  hintKey: 'spin.lobby.anagram.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
