import { ENDLESS_LIVES, QUIZ_CHOICES, type QuizSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STRIP_Y, drawLives, drawStandings, drawTimer, renderScene, roundRect, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// The quiz games (Maths rush, Counting, Word chain) share one layout: the standings strip, the prompt line, the question (each game draws its own,
// in the band between the prompt and the panels), then four answer panels (2 x 2).
export const QUIZ_QUESTION_Y = 0.4;
const BOARD_X = 0.1;
const BOARD_Y = 0.5;
const PANEL_W = 0.38;
const PANEL_H = 0.2;
const GAP = 0.04;
/** One hue for each panel (red, blue, green, yellow). */
const HUES = [25, 250, 145, 85];

const panelRect = (i: number): TapRect => ({ x: BOARD_X + (i % 2) * (PANEL_W + GAP), y: BOARD_Y + Math.floor(i / 2) * (PANEL_H + GAP), w: PANEL_W, h: PANEL_H });

/** The panels are the controller: each is a tap target, drawn exactly where it is hit. Numbered row by row (top left, top right, bottom left,
 * bottom right); on a keyboard the keys 1 to 4 do the same. */
export const QUIZ_TAPS: TapTargets = { rects: Array.from({ length: QUIZ_CHOICES }, (_, i) => panelRect(i)), keys: ['1', '2', '3', '4'] };

/** Draws the parts every quiz game has: the clock, the standings, and the answer panels (empty while the question is on show, the choices once
 * they are up, and the right one lit when the question is over). The game draws its own prompt and question around them. */
export function drawQuiz(sc: Scene<QuizSnapshot>, panels = true): void {
  const { ctx, S, snapshot, theme } = sc;

  // Time left: this question while one is up, otherwise the round.
  if (snapshot.stage !== 'between' && snapshot.stageTotalMs > 0) drawTimer(sc, snapshot.stageLeftMs / snapshot.stageTotalMs);
  else if (snapshot.phase === 'playing' && snapshot.limitMs > 0) drawTimer(sc, snapshot.roundLeftMs / snapshot.limitMs);

  // Everyone's points, a mark for how they answered the question on screen, and their lives (an endless run).
  drawStandings(sc, {
    badge: (p) => (p.right === true ? 'ok' : p.right === false ? 'no' : null),
    under: (p, cx, y) => drawLives(ctx, cx, y, p.lives, ENDLESS_LIVES, S * 0.01, theme.danger),
  });

  if (!panels) return;
  const over = snapshot.stage === 'between' && snapshot.answer >= 0;
  for (let i = 0; i < QUIZ_CHOICES; i++) {
    const r = panelRect(i);
    const text = snapshot.choices[i];
    ctx.save();
    // Panels without a choice yet are faint; once a question is over, the ones that were wrong dim.
    ctx.globalAlpha = text === undefined ? 0.18 : over && i !== snapshot.answer ? 0.4 : 1;
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.03);
    ctx.fillStyle = `oklch(0.62 0.16 ${HUES[i]})`;
    ctx.fill();
    ctx.restore();
    if (over && i === snapshot.answer) {
      ctx.strokeStyle = theme.mint;
      ctx.lineWidth = Math.max(2, S * 0.007);
      roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.03);
      ctx.stroke();
    }
    if (text !== undefined) {
      ctx.font = `800 ${Math.round(S * 0.075)}px ${FONT.display}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'oklch(0.14 0.01 60 / 0.85)';
      ctx.fillText(text, (r.x + r.w / 2) * S, (r.y + r.h / 2) * S + S * 0.004);
    }
  }
}

/** A quiz game's view: the shared parts, with the game's own prompt and question drawn by `drawQuestion` after them. `panels` says when the answer panels are drawn (Counting hides them while the shapes are on show). */
export function quizView<S extends QuizSnapshot>(names: { nameKey: LobbyGameView<S>['nameKey']; taglineKey: LobbyGameView<S>['taglineKey']; hintKey: LobbyGameView<S>['hintKey'] }, drawQuestion: (sc: Scene<S>) => void, panels: (snapshot: S) => boolean = () => true): LobbyGameView<S> {
  const scene: SceneGame<S> = {
    scroll: 'y',
    taps: QUIZ_TAPS,
    drawWorld: (sc) => {
      drawQuiz(sc as Scene<QuizSnapshot>, panels(sc.snapshot));
      drawQuestion(sc);
    },
    // Nobody is knocked out here before the end, so a burst would only start on the standings strip.
    anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
  };
  return {
    pad: 'none',
    actions: [],
    taps: QUIZ_TAPS,
    ...names,
    draw: (args) => renderScene(args, scene),
    standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
  };
}
