import { ODDONEOUT_HIT, ODDONEOUT_TARGETS, type OddOneOutSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, STRIP_Y, drawStandings, renderScene, roundRect, rememberSnapshot, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: the one shared board, under the standings strip (with health under each score).
const BOARD_X = 0.15;
const BOARD_Y = 0.29;
const BOARD_W = 0.7;
const TILE_GAP = 0.012;
/** A tile's colour: the shared one, and the lightness of the odd one is this plus the board's `delta`. */
const TILE_L = 0.62;
const TILE_C = 0.13;
const HP_MAX = 20;

const hit = BOARD_W / ODDONEOUT_HIT;
const hitRect = (i: number): TapRect => ({ x: BOARD_X + (i % ODDONEOUT_HIT) * hit, y: BOARD_Y + Math.floor(i / ODDONEOUT_HIT) * hit, w: hit, h: hit });

/** The board is the controller: a 6 by 6 grid of targets laid over it, however many tiles it shows (2, 3 or 6 across: each divides 6, so a tap lands on the tile it was aimed at). */
export const ODDONEOUT_TAPS: TapTargets = { rects: Array.from({ length: ODDONEOUT_TARGETS }, (_, i) => hitRect(i)) };

/** The board and everyone's points as of the last snapshot drawn. */
const previousBoard = rememberSnapshot<{ round: number; n: number; odd: number; points: Map<string, number> }>();

/** The odd tile bursts into confetti, in the colour of whoever found it, when the board changes. */
function celebrate(sc: Scene<OddOneOutSnapshot>): void {
  const { snapshot } = sc;
  const before = previousBoard(snapshot, () => ({ round: snapshot.round, n: snapshot.board.n, odd: snapshot.board.odd, points: new Map(snapshot.players.map((p) => [p.id, p.meters])) }));
  if (!before || snapshot.round <= before.round) return;
  const tile = BOARD_W / before.n;
  const x = BOARD_X + ((before.odd % before.n) + 0.5) * tile;
  const y = BOARD_Y + (Math.floor(before.odd / before.n) + 0.5) * tile;
  const finder = snapshot.players.find((p) => p.meters > (before.points.get(p.id) ?? 0));
  sc.fx.confettiAt(x, y, finder ? sc.info(finder.id).color : 90, 30);
}

function drawWorld(sc: Scene<OddOneOutSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  celebrate(sc);

  // Everyone's points, with a health bar under each; a wrong tap marks the avatar until they can tap again.
  drawStandings(sc, {
    badge: (p) => (p.lockMs > 0 ? 'no' : null),
    under: (p, cx, y) => {
      if (!p.alive) return;
      const bw = S * 0.08;
      const bh = S * 0.008;
      const frac = Math.min(1, Math.max(0, p.hp / HP_MAX));
      ctx.fillStyle = STAGE.hudFill;
      roundRect(ctx, cx - bw / 2, y, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = frac < 0.3 ? theme.danger : theme.acc;
      roundRect(ctx, cx - bw / 2, y, Math.max(bh, bw * frac), bh, bh / 2);
      ctx.fill();
    },
  });

  // The board: n by n tiles of one colour, one of them a little lighter or darker.
  const { n: size, hue, delta, odd } = snapshot.board;
  const tile = BOARD_W / size;
  for (let i = 0; i < size * size; i++) {
    const x = (BOARD_X + (i % size) * tile + TILE_GAP) * S;
    const y = (BOARD_Y + Math.floor(i / size) * tile + TILE_GAP) * S;
    const w = (tile - TILE_GAP * 2) * S;
    roundRect(ctx, x, y, w, w, S * 0.02);
    ctx.fillStyle = `oklch(${(TILE_L + (i === odd ? delta : 0)).toFixed(4)} ${TILE_C} ${hue})`;
    ctx.fill();
  }
}

const scene: SceneGame<OddOneOutSnapshot> = {
  scroll: 'y',
  taps: ODDONEOUT_TAPS,
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const oddOneOutView: LobbyGameView<OddOneOutSnapshot> = {
  // The board is the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: ODDONEOUT_TAPS,
  nameKey: 'spin.lobby.oddoneout.name',
  taglineKey: 'spin.lobby.oddoneout.tagline',
  hintKey: 'spin.lobby.oddoneout.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
